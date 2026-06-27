import _ from 'lodash';
import pIteration from 'p-iteration';
import commonHelper from "geesome-libs/src/common.js";
import geesomeMessages from "geesome-libs/src/messages.js";
import {CorePermissionName, IInvite, IListParams, IListParamsOptions} from "../database/interface.js";
import {IGeesomeApp, IUserInput} from "../../interface.js";
import IGeesomeInviteModule, {IInviteStatusOptions} from "./interface.js";
import {inviteErrors} from "./errors.js";
import helpers from "../../helpers";
const {isUndefined} = _;
const inviteListParams: IListParamsOptions = {
	sortBy: 'createdAt',
	allowedSortBy: ['createdAt', 'updatedAt', 'id', 'title', 'code', 'isActive'],
	maxLimit: 100
};

export default async (app: IGeesomeApp) => {
	app.checkModules(['database', 'group']);

	const {sequelize, models} = app.ms.database;
	const module = getModule(app, await (await import('./models.js')).default(sequelize, models));
	(await import('./api.js')).default(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models) {
	class InviteModule implements IGeesomeInviteModule {
		public async registerUserByInviteCode(inviteCode, userData: IUserInput): Promise<any> {
			const {invite, permissions} = await this.getInvitePreflight(inviteCode, {requiredPermission: null});

			await app.callHook('invite', 'beforeUserRegistering', [null, userData, {
				checkMessage: await this.getRegisterMessage(inviteCode),
			}]);

			const user = await app.registerUser({
				...userData,
				permissions,
			});

			await models.JoinedByPivot.create({
				userId: user.id,
				joinedByInviteId: invite.id,
				joinedByUserId: invite.createdById
			});

			if (invite.limits) {
				await pIteration.forEachSeries(JSON.parse(invite.limits), (limitData) => {
					return app.setUserLimit(invite.createdById, {
						...limitData as any,
						userId: user.id,
					});
				});
			}

			if (invite.groupsToJoin) {
				await pIteration.forEachSeries(JSON.parse(invite.groupsToJoin), (groupId) => {
					return app.ms.group.addMemberToGroup(invite.createdById, groupId, user.id).catch(e => {/*ignore, because it's optional*/});
				});
			}

			return {
				user,
				apiKey: await app.generateUserApiKey(user.id, {type: "invite", permissions}, true),
				permissions,
				keyStoreMethod: 'node'
			};
		}

		public async getInviteStatus(inviteCode, options: IInviteStatusOptions = {}) {
			const preflight = await this.getInvitePreflight(inviteCode, options);
			const response: any = {
				ok: true,
				code: inviteCode,
				publicJoinEnabled: true,
				active: true,
				remainingUses: preflight.remainingUses,
				permissions: preflight.permissions,
				expiresAt: null,
				joinPath: `/v1/invite/join/${inviteCode}`
			};
			if (options.requiredPermission) {
				response.requiredPermission = options.requiredPermission;
			}
			return response;
		}

		async getRegisterMessage(inviteCode) {
			const selfIpnsId = await app.ms.staticId.getSelfStaticAccountId();
			return geesomeMessages.acceptInvite(selfIpnsId, inviteCode);
		}

		async createInvite(userId, inviteData) {
			await app.checkUserCan(userId, CorePermissionName.AdminAddUser);
			inviteData.code = commonHelper.makeCode(16);
			inviteData.createdById = userId;
			return this.addInvite(inviteData);
		}

		async updateInvite(userId, inviteId, inviteData) {
			await app.checkUserCan(userId, CorePermissionName.AdminAddUser);
			const invite = await this.getInvite(inviteId);
			if (!invite) {
				throw new Error("not_found");
			}
			if (invite.createdById !== userId) {
				throw new Error("not_creator");
			}
			delete inviteData.code;
			delete inviteData.createdById;
			return models.Invite.update(inviteData, {where: {id: inviteId}})
		}

		async getUserInvites(userId, filters = {}, listParams?: IListParams) {
			listParams = helpers.prepareListParams(listParams, inviteListParams);

			app.ms.database.setDefaultListParamsValues(listParams, inviteListParams);

			const {limit, offset, sortBy, sortDir} = listParams;
			const where = { createdById: userId };
			if (!isUndefined(filters['isActive'])) {
				where['isActive'] = isUndefined(filters['isActive']);
			}
			return {
				list: await models.Invite.findAll({
					where,
					order: [[sortBy, sortDir.toUpperCase()]],
					limit,
					offset
				}),
				total: await this.getUserInvitesCount(userId, filters)
			};
		}

		async addInvite(invite) {
			return models.Invite.create(invite);
		}

		async getInvite(id) {
			return models.Invite.findOne({where: {id}}) as IInvite;
		}

		async findInviteByCode(code) {
			return models.Invite.findOne({where: {code}}) as IInvite;
		}

		async getInvitePreflight(inviteCode, options: IInviteStatusOptions = {}) {
			const invite = await this.findInviteByCode(inviteCode);
			if (!invite) {
				throw inviteErrors.notFound();
			}
			if (!invite.isActive) {
				throw inviteErrors.notActive();
			}

			const joinedByInviteCount = await this.getJoinedByInviteCount(invite.id);
			const maxCount = Number(invite.maxCount || 0);
			if (joinedByInviteCount >= maxCount) {
				throw inviteErrors.exhausted();
			}

			const permissions = parseInvitePermissions(invite);
			if (options.requiredPermission && !hasRequiredPermission(permissions, options.requiredPermission)) {
				throw inviteErrors.missingUploadPermission(options.requiredPermission);
			}

			return {
				invite,
				permissions,
				remainingUses: Math.max(maxCount - joinedByInviteCount, 0)
			};
		}

		async getJoinedByInviteCount(joinedByInviteId) {
			return models.JoinedByPivot.count({ where: {joinedByInviteId} });
		}

		async getInvitedUserOfJoinedUser(userId) {
			return (await app.ms.database.getUser(userId) as any).getJoinedByUser().then(res => res[0]);
		}

		async getInviteOfJoinedUser(userId) {
			return (await app.ms.database.getUser(userId) as any).getJoinedByInvite().then(res => res[0]);
		}

		async getUsersListJoinedByInvite(inviteId) {
			return (await this.getInvite(inviteId) as any).getUsersJoinedByInvite();
		}

		async getUsersListJoinedByUser(userId) {
			return (await app.ms.database.getUser(userId) as any).getUsersJoinedByUser();
		}

		async getUserInvitesCount(createdById, filters = {}) {
			const where = { createdById };
			if (!isUndefined(filters['isActive'])) {
				where['isActive'] = isUndefined(filters['isActive']);
			}
			return models.Invite.count({ where });
		}

		async getAllInvites(filters = {}, listParams: IListParams = {}) {
			listParams = helpers.prepareListParams(listParams, inviteListParams);
			app.ms.database.setDefaultListParamsValues(listParams, inviteListParams);

			const {limit, offset, sortBy, sortDir} = listParams;
			const where = { };
			if (!isUndefined(filters['isActive'])) {
				where['isActive'] = isUndefined(filters['isActive']);
			}
			return models.Invite.findAll({
				where,
				order: [[sortBy, sortDir.toUpperCase()]],
				limit,
				offset
			});
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['JoinedByPivot', 'Invite'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}
	return new InviteModule();
}

function parseInvitePermissions(invite) {
	if (!invite.permissions) {
		return [];
	}
	if (Array.isArray(invite.permissions)) {
		return invite.permissions;
	}
	try {
		const permissions = JSON.parse(invite.permissions);
		if (Array.isArray(permissions)) {
			return permissions;
		}
	} catch (e) {
		throw inviteErrors.invalidPermissions();
	}
	throw inviteErrors.invalidPermissions();
}

function hasRequiredPermission(permissions, requiredPermission) {
	if (requiredPermission.startsWith('admin:')) {
		return permissions.includes(CorePermissionName.AdminAll) || permissions.includes(requiredPermission);
	}
	if (requiredPermission.startsWith('user:')) {
		return permissions.includes(CorePermissionName.UserAll) || permissions.includes(requiredPermission);
	}
	return permissions.includes(requiredPermission);
}
