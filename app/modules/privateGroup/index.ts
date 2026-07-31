import {createHash} from 'node:crypto';
import {Op} from 'sequelize';
import type {IGeesomeApp} from '../../interface.js';
import {GroupType, IGroup, IPost} from '../group/interface.js';
import IGeesomePrivateGroupModule, {
	IPrivateGroupMembershipSnapshot,
	IPrivateGroupPostMembership,
	privateGroupPostManifestHook,
	publicPostManifestHook
} from './interface.js';

export default async function (app: IGeesomeApp): Promise<IGeesomePrivateGroupModule> {
	const models = await (await import('./models.js')).default(
		app.ms.database.sequelize
	);
	const module = getModule(app, models);
	(await import('./api.js')).default(app, module);
	return module;
}

export function getModule(app: IGeesomeApp, models: any = null): IGeesomePrivateGroupModule {
	return {
		isEnabled(): boolean {
			return app.config?.privateGroupConfig?.enabled === true;
		},

		isPrivateGroup(group: Partial<IGroup> | null | undefined): boolean {
			return group?.type === GroupType.PrivateGroup;
		},

		normalizeGroupData(groupData: Partial<IGroup>): Partial<IGroup> {
			if (!this.isPrivateGroup(groupData)) {
				return {...groupData};
			}
			if (!this.isEnabled()) {
				throw new Error('private_group_disabled');
			}
			return {
				...groupData,
				isPublic: false,
				isOpen: false,
				isEncrypted: true
			};
		},

		getPostManifestHook(group: Partial<IGroup> | null | undefined): string {
			if (this.isPrivateGroup(group)) {
				return privateGroupPostManifestHook;
			}
			return publicPostManifestHook;
		},

		canMutateSharedPost(userId: number, post: Partial<IPost>): boolean {
			return Number(post?.userId) === Number(userId);
		},

		async createMembershipSnapshot(userId, groupId, expectedVersion) {
			assertMembershipModels(models);
			const normalizedGroupId = normalizeId(groupId, 'private_group_id_invalid');
			const normalizedUserId = normalizeId(userId, 'private_group_user_id_invalid');
			assertPrivateGroupEnabled(this);
			const sequelize = app.ms.database.sequelize;

			return sequelize.transaction(async transaction => {
				const dependencies = getMembershipDependencies(sequelize);
				const lockedGroup = await dependencies.Group.findByPk(normalizedGroupId, {
					transaction,
					lock: transaction.LOCK.UPDATE
				});
				if (!this.isPrivateGroup(lockedGroup)) {
					throw new Error('private_group_required');
				}
				const isAdministrator = await dependencies.GroupAdministrators.count({
					where: {
						groupId: normalizedGroupId,
						userId: normalizedUserId
					},
					transaction
				});
				if (!isAdministrator) {
					throw new Error('not_permitted');
				}

				const latestSnapshot = await models.PrivateGroupMembershipSnapshot.findOne({
					where: {groupId: normalizedGroupId},
					order: [['version', 'DESC']],
					transaction,
					lock: transaction.LOCK.UPDATE
				});
				const members = await dependencies.GroupMembers.findAll({
					attributes: ['userId'],
					where: {groupId: normalizedGroupId},
					order: [['userId', 'ASC']],
					transaction
				});
				const memberIds = members.map(member => Number(member.userId));
				const devices = await dependencies.ChatDevice.findAll({
					where: {
						userId: {[Op.in]: memberIds},
						revokedAt: null
					},
					order: [
						['userId', 'ASC'],
						['deviceId', 'ASC'],
						['keyId', 'ASC'],
						['id', 'ASC']
					],
					transaction
				});
				assertEveryMemberHasDevice(memberIds, devices);

				const deviceRows = devices.map(serializeMembershipDeviceRow);
				const membershipHash = hashMembershipDevices(deviceRows);
				if (latestSnapshot?.membershipHash === membershipHash) {
					return loadMembershipSnapshot(models, latestSnapshot.id, transaction);
				}

				const currentVersion = latestSnapshot
					? normalizeVersion(latestSnapshot.version)
					: '0';
				if (normalizeVersion(expectedVersion) !== currentVersion) {
					throw new Error('private_group_membership_version_conflict');
				}

				const snapshot = await models.PrivateGroupMembershipSnapshot.create({
					groupId: normalizedGroupId,
					version: (BigInt(currentVersion) + 1n).toString(),
					createdByUserId: normalizedUserId,
					membershipHash,
					memberCount: memberIds.length,
					deviceCount: deviceRows.length
				}, {transaction});
				await models.PrivateGroupMembershipDevice.bulkCreate(
					deviceRows.map(device => ({
						...device,
						privateGroupMembershipSnapshotId: snapshot.id
					})),
					{transaction}
				);
				return loadMembershipSnapshot(models, snapshot.id, transaction);
			});
		},

		async getMembershipSnapshot(userId, groupId, version?) {
			assertMembershipModels(models);
			const normalizedGroupId = normalizeId(groupId, 'private_group_id_invalid');
			await assertCanReadPrivateGroup(app, this, userId, normalizedGroupId);
			const where: any = {groupId: normalizedGroupId};
			if (version !== undefined && version !== null) {
				where.version = normalizeVersion(version);
			}
			const snapshot = await models.PrivateGroupMembershipSnapshot.findOne({
				where,
				order: [['version', 'DESC']]
			});
			if (!snapshot) {
				return null;
			}
			return loadMembershipSnapshot(models, snapshot.id);
		},

		async bindPostMembership(userId, post, membershipVersion, transaction) {
			assertMembershipModels(models);
			if (!transaction) {
				throw new Error('private_group_post_transaction_required');
			}
			const normalizedUserId = normalizeId(userId, 'private_group_user_id_invalid');
			const postId = normalizeId(post?.id, 'private_group_post_id_invalid');
			const groupId = normalizeId(post?.groupId, 'private_group_id_invalid');
			const requestedVersion = normalizeRequiredVersion(
				membershipVersion,
				'private_group_membership_version_required'
			);
			const dependencies = getMembershipDependencies(app.ms.database.sequelize);
			const lockedGroup = await dependencies.Group.findByPk(groupId, {
				transaction,
				lock: transaction.LOCK.UPDATE
			});
			if (!this.isPrivateGroup(lockedGroup)) {
				throw new Error('private_group_required');
			}
			if (Number(post.userId) !== normalizedUserId) {
				throw new Error('private_group_post_author_mismatch');
			}

			const latestSnapshot = await models.PrivateGroupMembershipSnapshot.findOne({
				where: {groupId},
				order: [['version', 'DESC']],
				transaction
			});
			if (!latestSnapshot) {
				throw new Error('private_group_membership_snapshot_required');
			}
			if (normalizeVersion(latestSnapshot.version) !== requestedVersion) {
				throw new Error('private_group_membership_snapshot_stale');
			}
			const authorDeviceCount = await models.PrivateGroupMembershipDevice.count({
				where: {
					privateGroupMembershipSnapshotId: latestSnapshot.id,
					userId: normalizedUserId
				},
				transaction
			});
			if (!authorDeviceCount) {
				throw new Error('private_group_post_author_not_in_membership');
			}

			const binding = await models.PrivateGroupPostMembership.create({
				postId,
				groupId,
				privateGroupMembershipSnapshotId: latestSnapshot.id,
				membershipVersion: requestedVersion
			}, {transaction});
			return serializePostMembership(binding);
		},

		async getPostMembership(postId, transaction?) {
			assertMembershipModels(models);
			const binding = await models.PrivateGroupPostMembership.findOne({
				where: {postId: normalizeId(postId, 'private_group_post_id_invalid')},
				transaction
			});
			if (!binding) {
				return null;
			}
			return serializePostMembership(binding);
		},

		async afterPrivatePostManifestUpdate(
			_userId: number,
			postId: number
		) {
			const post = await app.ms.group.getPostPure(postId);
			if (!post || !this.isPrivateGroup(post.group)) {
				throw new Error('private_group_post_required');
			}
			const membership = await this.getPostMembership(postId);
			if (!membership) {
				throw new Error('private_group_post_membership_required');
			}
			return {
				groupId: Number(post.groupId),
				postId: Number(post.id),
				private: true,
				membershipVersion: membership.membershipVersion
			};
		},

		async flushDatabase() {
			if (!models) {
				return;
			}
			await models.PrivateGroupPostMembership.destroy({where: {}});
			await models.PrivateGroupMembershipDevice.destroy({where: {}});
			await models.PrivateGroupMembershipSnapshot.destroy({where: {}});
		}
	};
}

function assertPrivateGroupEnabled(module: IGeesomePrivateGroupModule) {
	if (!module.isEnabled()) {
		throw new Error('private_group_disabled');
	}
}

async function assertCanReadPrivateGroup(
	app: IGeesomeApp,
	module: IGeesomePrivateGroupModule,
	userId: number,
	groupId: number
) {
	if (!module.isEnabled()) {
		throw new Error('private_group_disabled');
	}
	const group = await app.ms.group.getGroup(groupId);
	if (!module.isPrivateGroup(group)) {
		throw new Error('private_group_required');
	}
	const [isMember, isAdmin] = await Promise.all([
		app.ms.group.isMemberInGroup(userId, groupId),
		app.ms.group.isAdminInGroup(userId, groupId)
	]);
	if (!isMember && !isAdmin) {
		throw new Error('not_permitted');
	}
}

function getMembershipDependencies(sequelize) {
	const Group = sequelize.models.group;
	const GroupMembers = sequelize.models.groupMembers;
	const GroupAdministrators = sequelize.models.groupAdministrators;
	const ChatDevice = sequelize.models.chatDevice;
	if (!Group || !GroupMembers || !GroupAdministrators || !ChatDevice) {
		throw new Error('private_group_membership_dependencies_unavailable');
	}
	return {Group, GroupMembers, GroupAdministrators, ChatDevice};
}

function assertMembershipModels(models) {
	if (
		!models?.PrivateGroupMembershipSnapshot
		|| !models?.PrivateGroupMembershipDevice
		|| !models?.PrivateGroupPostMembership
	) {
		throw new Error('private_group_membership_models_unavailable');
	}
}

function assertEveryMemberHasDevice(memberIds: number[], devices) {
	const deviceMemberIds = new Set(devices.map(device => Number(device.userId)));
	if (memberIds.some(memberId => !deviceMemberIds.has(memberId))) {
		throw new Error('private_group_member_device_required');
	}
}

function serializeMembershipDeviceRow(device) {
	return {
		userId: Number(device.userId),
		ownerId: String(device.ownerId),
		deviceId: String(device.deviceId),
		keyId: String(device.keyId),
		bundleJson: String(device.bundleJson)
	};
}

function hashMembershipDevices(devices): string {
	return createHash('sha256')
		.update(JSON.stringify(devices))
		.digest('hex');
}

async function loadMembershipSnapshot(
	models,
	snapshotId: number,
	transaction?
): Promise<IPrivateGroupMembershipSnapshot> {
	const snapshot = await models.PrivateGroupMembershipSnapshot.findByPk(snapshotId, {
		include: [{association: 'devices'}],
		order: [[{model: models.PrivateGroupMembershipDevice, as: 'devices'}, 'id', 'ASC']],
		transaction
	});
	return {
		id: Number(snapshot.id),
		groupId: Number(snapshot.groupId),
		version: normalizeVersion(snapshot.version),
		createdByUserId: Number(snapshot.createdByUserId),
		membershipHash: String(snapshot.membershipHash),
		memberCount: Number(snapshot.memberCount),
		deviceCount: Number(snapshot.deviceCount),
		devices: snapshot.devices.map(device => ({
			userId: Number(device.userId),
			ownerId: String(device.ownerId),
			deviceId: String(device.deviceId),
			keyId: String(device.keyId),
			publicBundle: JSON.parse(device.bundleJson)
		})),
		createdAt: snapshot.createdAt
	};
}

function serializePostMembership(binding): IPrivateGroupPostMembership {
	return {
		id: Number(binding.id),
		postId: Number(binding.postId),
		groupId: Number(binding.groupId),
		membershipSnapshotId: Number(binding.privateGroupMembershipSnapshotId),
		membershipVersion: normalizeVersion(binding.membershipVersion)
	};
}

function normalizeId(value, errorCode: string): number {
	const id = Number(value);
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw new Error(errorCode);
	}
	return id;
}

function normalizeRequiredVersion(value, errorCode: string): string {
	if (value === undefined || value === null || value === '') {
		throw new Error(errorCode);
	}
	return normalizeVersion(value);
}

function normalizeVersion(value): string {
	const rawValue = String(value);
	if (!/^\d+$/.test(rawValue)) {
		throw new Error('private_group_membership_version_invalid');
	}
	return BigInt(rawValue).toString();
}
