import _ from 'lodash';
import debug from 'debug';
import {Op, Transaction} from "sequelize";
import pIteration from 'p-iteration';
import commonHelper from "geesome-libs/src/common.js";
import pgpHelper from "geesome-libs/src/pgpHelper.js";
import ipfsHelper from "geesome-libs/src/ipfsHelper.js";
import peerIdHelper from "geesome-libs/src/peerIdHelper.js";
import IGeesomeGroupModule, {
	GroupType,
	GroupView,
	IGroup,
	IGroupRead,
	IPost,
	IResolvedPostContent,
	PostContentAttachmentReason,
	PostStatus
} from "./interface.js";
import {buildPostLifecycleEvent, buildSourceImportPostEvent, getPostEventState} from './postEventHelpers.js';
import {IGeesomeApp} from "../../interface.js";
import {startIntervalWorker} from '../../backgroundWorker.js';
import type {IBackgroundWorker} from '../../backgroundWorker.js';
import helpers from '../../helpers.js';
import {
	ContentView,
	CorePermissionName,
	GroupPermissionName,
	IContent,
	IContentData,
	IContentDataProjectionOptions,
	IListParams,
	IListParamsOptions
} from "../database/interface.js";
import {
	getProjectedContentRichText,
	getProjectedContentRichTextPlainText,
	getProjectedContentText,
	isProjectedRichTextContent
} from './contentProjectionHelpers.js';
import {getPostInputContents, stripPostContentInputFields} from './postContentInputHelpers.js';
import {
	IMAGE_COMPOSITION_POST_TYPE,
	IMAGE_COMPOSITION_VIEW,
	IMAGE_COMPOSITION_VERSION,
	StoredImageComposition,
} from './imageCompositionContract.js';
import {
	assertRasterBaseContent,
	buildResolvedImageComposition,
	canViewImageCompositionGroup,
	doesStoredCompositionMatchCreate,
	getImageCompositionProperties,
	ImageCompositionApiError,
	normalizeImageCompositionCreateInput,
	normalizeImageCompositionUpdateInput,
	parseStoredImageComposition,
} from './imageComposition.js';
import {generateImageCompositionStickerSvg} from './imageCompositionSvg.js';
import {
	createImageCompositionOperationRepository,
	createImageCompositionRequestHash,
} from './imageCompositionOperationRepository.js';
const {extend, pick, isUndefined, some, uniqBy, clone, orderBy, sumBy} = _;
const log = debug('geesome:app:group');
const groupDerivedStateQueueModuleName = 'group-derived-state';
const groupDerivedStateJobMaxAttempts = helpers.parsePositiveInteger(process.env.GROUP_DERIVED_STATE_JOB_MAX_ATTEMPTS, 3);
const groupDerivedStateWorkerIntervalMs = helpers.parsePositiveInteger(process.env.GROUP_DERIVED_STATE_WORKER_INTERVAL_MS, 30000);
const groupDerivedStateWorkerBatchLimit = helpers.parsePositiveInteger(process.env.GROUP_DERIVED_STATE_WORKER_BATCH_LIMIT, 10);
const groupDerivedStateKickBatchLimit = helpers.parsePositiveInteger(process.env.GROUP_DERIVED_STATE_KICK_BATCH_LIMIT, 1);
const publicPostListParams = {
	sortBy: 'publishedAt',
	allowedSortBy: ['publishedAt', 'updatedAt', 'createdAt', 'id'],
	maxLimit: 100
};
const allPostListParams = {
	sortBy: 'publishedAt',
	allowedSortBy: ['publishedAt', 'updatedAt', 'createdAt', 'id']
};
const adminGroupListParams: IListParamsOptions = {
	sortBy: 'createdAt',
	allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'title', 'type', 'isDeleted'],
	maxLimit: 100
};
const userGroupListParams: IListParamsOptions = {
	sortBy: 'createdAt',
	allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'title', 'type'],
	maxLimit: 100
};
const userFriendListParams: IListParamsOptions = {
	sortBy: 'createdAt',
	allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'email', 'storageAccountId'],
	maxLimit: 100
};
const staticRebindBatchLimit = helpers.parsePositiveInteger(process.env.STATIC_REBIND_BATCH_LIMIT, 100);

function contentSize(content) {
	return Number(content?.size) || 0;
}

function getStableGroupListOrder(sortBy, sortDir) {
	const direction = sortDir.toUpperCase();
	const order = [[sortBy, direction]];
	if (sortBy !== 'id') {
		order.push(['id', direction]);
	}
	return order;
}

function shouldUseAsyncDerivedState(options: any = {}) {
	if (options.asyncDerivedState !== undefined) {
		return options.asyncDerivedState === true;
	}
	return helpers.parseBoolean(process.env.GROUP_DERIVED_STATE_ASYNC, true);
}

function shouldRunDerivedStateWorker() {
	return helpers.parseBoolean(
		process.env.GROUP_DERIVED_STATE_WORKER,
		shouldUseAsyncDerivedState()
	);
}

function getGroupDerivedStateJobAttempts(job) {
	const attempts = Number(job.attempts);
	if (!Number.isFinite(attempts) || attempts < 0) {
		return 0;
	}
	return Math.floor(attempts);
}

function getNextGroupDerivedStateJobAttempt(job) {
	return {
		...job,
		attempts: getGroupDerivedStateJobAttempts(job) + 1
	};
}

function getGroupDerivedStateJobName(job) {
	return `run-${groupDerivedStateQueueModuleName}-${job.type}`;
}

function getGroupDerivedStateJobChannel(job) {
	const entityId = job.type === 'post-manifest' ? job.postId : job.groupId;
	return `${groupDerivedStateQueueModuleName}:${job.type}:${entityId}`;
}

function getGroupDerivedStateStorageStatus(storageId) {
	return {
		ok: !!storageId,
		storageId: storageId || null
	};
}

function getPostManifestJobResult(job, post, group) {
	return {
		type: job.type,
		attempts: getGroupDerivedStateJobAttempts(job),
		postId: post.id,
		groupId: post.groupId,
		postManifest: getGroupDerivedStateStorageStatus(post.manifestStorageId),
		postDirectory: getGroupDerivedStateStorageStatus(post.directoryStorageId),
		groupDirectory: getGroupDerivedStateStorageStatus(group.directoryStorageId),
		groupManifest: getGroupManifestJobStatus(group)
	};
}

function getGroupManifestJobResult(job, group) {
	return {
		type: job.type,
		attempts: getGroupDerivedStateJobAttempts(job),
		groupId: group.id,
		groupDirectory: getGroupDerivedStateStorageStatus(group.directoryStorageId),
		groupManifest: getGroupManifestJobStatus(group)
	};
}

function getGroupManifestJobStatus(group) {
	return {
		ok: !!group.manifestStorageId && !!group.manifestStaticStorageId,
		storageId: group.manifestStorageId || null,
		staticStorageId: group.manifestStaticStorageId || null,
		storageUpdatedAt: group.storageUpdatedAt || null,
		staticStorageUpdatedAt: group.staticStorageUpdatedAt || null
	};
}

function getGroupDerivedStateJobFailureMessage(job, errorMessage) {
	return `${groupDerivedStateQueueModuleName} ${job.type} attempt ${getGroupDerivedStateJobAttempts(job)} of ${groupDerivedStateJobMaxAttempts} failed: ${errorMessage}`;
}

function getGroupDerivedStateJobFailureResult(job, errorMessage) {
	return {
		...job,
		maxAttempts: groupDerivedStateJobMaxAttempts,
		retryExhausted: getGroupDerivedStateJobAttempts(job) >= groupDerivedStateJobMaxAttempts,
		errorMessage
	};
}

function parseGroupDerivedStateJob(inputJson) {
	const job = JSON.parse(inputJson);
	if (!job || typeof job !== 'object') {
		throw new Error('invalid_derived_state_job');
	}
	if (job.type === 'post-manifest') {
		const postId = Number(job.postId);
		if (!Number.isFinite(postId)) {
			throw new Error('invalid_derived_state_post_id');
		}
		return {...job, type: 'post-manifest', postId: Math.floor(postId)};
	}
	if (job.type === 'group-manifest') {
		const groupId = Number(job.groupId);
		if (!Number.isFinite(groupId)) {
			throw new Error('invalid_derived_state_group_id');
		}
		return {...job, type: 'group-manifest', groupId: Math.floor(groupId)};
	}
	throw new Error('invalid_derived_state_job_type');
}

function getPostManifestJobInput(postId) {
	return {type: 'post-manifest', postId: Number(postId)};
}

function getGroupManifestJobInput(groupId) {
	return {type: 'group-manifest', groupId: Number(groupId)};
}

function getErrorMessage(error) {
	if (error && error.message) {
		return error.message;
	}
	return String(error);
}

function doesStoredCompositionMatchUpdate(composition: StoredImageComposition, input): boolean {
	if (composition.output.width !== input.output.width || composition.output.height !== input.output.height) {
		return false;
	}
	if (composition.stickers.length !== input.stickers.length) {
		return false;
	}
	const semanticFields = ['id', 'kind', 'template', 'text', 'x', 'y', 'width', 'height', 'rotationDeg', 'zIndex'];
	return input.stickers.every((sticker, index) => {
		const stored = composition.stickers[index];
		return semanticFields.every(field => stored?.[field] === sticker[field]);
	});
}

export default async (app: IGeesomeApp) => {
	app.checkModules(['database', 'communicator', 'storage', 'staticId', 'content', 'asyncOperation']);
	const {sequelize, models} = app.ms.database;
	const module = getModule(app, await (await import('./models/index.js')).default(sequelize, models));
	(await import('./api.js')).default(app, module);
	module.startDerivedStateQueueWorker();
	return module;
}

function getModule(app: IGeesomeApp, models) {
	const {communicator} = app.ms;
	const imageCompositionOperations = createImageCompositionOperationRepository(app.ms.database.sequelize, models);
	let derivedStateQueueProcessPromise: Promise<any> | null = null;
	let derivedStateQueueWorker: IBackgroundWorker | null = null;
	let stopped = false;

	async function createActorContentFromGroupObject(userId, contentObject) {
		if (!contentObject) {
			return null;
		}
		if (contentObject.storageId) {
			return app.ms.content.createContentByObject(userId, contentObject);
		}
		if (contentObject.manifestStorageId) {
			return app.ms.content.createContentByRemoteStorageId(userId, contentObject.manifestStorageId);
		}
		return null;
	}

	class GroupModule implements IGeesomeGroupModule {
		async createGroup(userId, groupData) {
			log('groupData', groupData);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);

			if (!groupData['name'] || !helpers.validateUsername(groupData['name'])) {
				throw new Error("incorrect_name");
			}
			const existUserWithName = await this.getGroupByParams({name: groupData['name'], isCollateral: false});
			if (existUserWithName) {
				throw new Error("name_already_exists");
			}

			groupData.creatorId = userId;
			groupData.manifestStaticStorageId = await app.ms.staticId.createStaticAccountId(userId, groupData['name']);
			if (groupData.type !== GroupType.PersonalChat) {
				groupData.staticStorageId = groupData.manifestStaticStorageId;
			}

			const group = await this.addGroup(groupData);
			await app.ms.staticId.setStaticAccountGroupId(userId, groupData['name'], group.id);

			// await app.callHook('hookAfterGroupSaving', [userId, group.id, groupData])

			if (groupData.type !== GroupType.PersonalChat) {
				await this.addAdminToGroupPure(userId, group.id);
			}

			await this.updateGroupManifest(userId, group.id);

			return this.getGroup(group.id);
		}

		async createGroupByObject(userId, groupObject) {
			const dbAvatar = await createActorContentFromGroupObject(userId, groupObject.avatarImage);
			const dbCover = await createActorContentFromGroupObject(userId, groupObject.coverImage);
			const groupFields = ['manifestStaticStorageId', 'manifestStorageId', 'name', 'title', 'view', 'type', 'theme', 'homePage', 'isPublic', 'isRemote', 'description', 'size'];
			const dbGroup = await this.addGroup(extend(pick(groupObject, groupFields), {
				avatarImageId: dbAvatar ? dbAvatar.id : null,
				coverImageId: dbCover ? dbCover.id : null
			}));

			if (dbGroup.isRemote) {
				app.events.emit(app.events.NewRemoteGroup, dbGroup);
			}
			return dbGroup;
		}

		async canEditGroup(userId, groupId) {
			if (!groupId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			return this.isAdminInGroupPure(userId, groupId);
		}


		async isMemberInGroup(userId, groupId) {
			if (!groupId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			return this.isMemberInGroupPure(userId, groupId);
		}

		async isAdminInGroup(userId, groupId) {
			if (!groupId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			return this.isAdminInGroupPure(userId, groupId);
		}

		async addMemberToGroup(userId, groupId, memberId, groupPermissions = []) {
			groupPermissions = groupPermissions || [];
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);
			const group = await this.getLocalGroup(userId, groupId);
			if(!(await this.isAdminInGroup(userId, groupId))) {
				if(userId.toString() !== memberId.toString()) {
					throw new Error("not_permitted");
				}
				if(!group.isPublic || !group.isOpen) {
					throw new Error("not_permitted");
				}
			}

			await this.addMemberToGroupPure(memberId, groupId);

			await pIteration.forEach(groupPermissions, (permissionName) => {
				return this.addGroupPermission(memberId, groupId, permissionName);
			});
		}

		async setMembersOfGroup(userId, groupId, newMemberUserIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await this.setMembersToGroup(newMemberUserIds, groupId);
		}

		async removeMemberFromGroup(userId, groupId, memberId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);
			const group = await this.getLocalGroup(userId, groupId);
			if(!(await this.isAdminInGroup(userId, groupId))) {
				if(userId.toString() !== memberId.toString()) {
					throw new Error("not_permitted");
				}
				if(!group.isPublic || !group.isOpen) {
					throw new Error("not_permitted");
				}
			}
			await (await this.getGroup(groupId)).removeMembers([await app.ms.database.getUser(memberId)]);
			await this.removeAllGroupPermission(memberId, groupId);
		}

		async setGroupPermissions(userId, groupId, memberId, groupPermissions = []) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);
			if(!(await this.isAdminInGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			await this.removeAllGroupPermission(memberId, groupId);

			await pIteration.forEach(groupPermissions, (permissionName) => {
				return this.addGroupPermission(memberId, groupId, permissionName);
			});
		}

		async addAdminToGroup(userId, groupId, newAdminUserId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await this.addAdminToGroupPure(newAdminUserId, groupId);
		}

		async removeAdminFromGroup(userId, groupId, removeAdminUserId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await (await this.getGroup(groupId)).removeAdministrators([await app.ms.database.getUser(removeAdminUserId)]);
		}

		async setAdminsOfGroup(userId, groupId, newAdminUserIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (!(await this.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			groupId = await this.checkGroupId(groupId);
			await this.setAdminsToGroup(newAdminUserIds, groupId);
		}

		async updateGroup(userId, groupId, updateData) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);

			const groupPermission = await this.isHaveGroupPermission(userId, groupId, GroupPermissionName.EditGeneralData);
			const canEditGroup = await this.canEditGroup(userId, groupId);
			if (!canEditGroup && !groupPermission) {
				throw new Error("not_permitted");
			}
			if (!canEditGroup && groupPermission) {
				delete updateData.name;
				delete updateData.propertiesJson;
			}
			if (updateData['name'] && !helpers.validateUsername(updateData['name'])) {
				throw new Error("incorrect_name");
			}
			const group = await this.getGroup(groupId);
			if (updateData['name'] && updateData['name'] !== group.name) {
				await app.ms.staticId.renameGroupStaticAccountId(userId, groupId, group.name, updateData['name']);
			}
			await this.updateGroupPure(groupId, updateData);

			await this.updateGroupManifest(userId, groupId);

			log('updateGroupManifest:finish');

			return this.getGroup(groupId);
		}

		async updateGroupManifest(userId, groupId) {
			log('updateGroupManifest');
			// Counters (size, availablePostsCount) are maintained incrementally in
			// incrementGroupCounters() during post create/update/delete. publishedPostsCount
			// is a legacy localId high-water mark maintained by allocatePostLocalId().
			// updateGroupManifest no longer runs SUM(size)/COUNT per regeneration; a full
			// rebuild is available via reconcileGroupCounters() for ops use only.
			const group = await this.getGroup(groupId);

			const {manifest, state} = await app.ms.entityJsonManifest.generateGroupManifestWithState(group);
			const manifestStorageId = await app.saveDataStructure(manifest, {waitForStorage: true});
			log('generateAndSaveManifest');
			let storageUpdatedAt = group.storageUpdatedAt;
			let staticStorageUpdatedAt = group.staticStorageUpdatedAt;

			const promises = [];
			if (manifestStorageId != group.manifestStorageId) {
				storageUpdatedAt = new Date();
				staticStorageUpdatedAt = new Date();

				promises.push(app.ms.staticId.bindToStaticId(group.creatorId, manifestStorageId, group.manifestStaticStorageId))
			}

			const updateData: any = {
				manifestStorageId,
				storageUpdatedAt,
				staticStorageUpdatedAt
			};
			if (state.postCursor) {
				updateData.manifestPostsCursorUpdatedAt = state.postCursor.updatedAt;
				updateData.manifestPostsCursorId = state.postCursor.id;
			}

			promises.push(this.updateGroupPure(groupId, updateData));
			return Promise.all(promises);
		}

		async incrementGroupCounters(groupId, deltas: {sizeDelta?: number, availableDelta?: number} = {}, options: any = {}) {
			const updateData: any = {};
			const addCounterDelta = (column, delta) => {
				const value = Number(delta);
				if (!Number.isFinite(value) || value === 0) {
					return;
				}
				updateData[column] = app.ms.database.sequelize.literal(`COALESCE("${column}", 0) + ${value}`);
			};

			addCounterDelta('size', deltas.sizeDelta);
			if (deltas.availableDelta) {
				addCounterDelta('availablePostsCount', deltas.availableDelta);
			}
			if (!Object.keys(updateData).length) {
				return;
			}
			return models.Group.update(updateData, {where: {id: groupId}, transaction: options.transaction});
		}

		async reconcileGroupCounters(groupId) {
			const [size, availablePostsCount, maxLocalId] = await Promise.all([
				models.Post.sum('size', {where: {groupId, isDeleted: false, status: PostStatus.Published}}).then(s => s || 0),
				models.Post.count({where: {groupId, isDeleted: false, status: PostStatus.Published}}),
				models.Post.max('localId', {where: {groupId}}).then(m => m || 0),
			]);
			return this.updateGroupPure(groupId, {size, availablePostsCount, publishedPostsCount: maxLocalId});
		}

		async reconcilePostRelationCounters(postIds, options: any = {}) {
			const ids = helpers.normalizeUniqueIds(postIds);
			return pIteration.forEach(ids, async (postId) => {
				const [repliesCount, repostsCount] = await Promise.all([
					models.Post.count({
						where: this.getPostsWhere({replyToId: postId}),
						transaction: options.transaction
					}),
					models.Post.count({
						where: this.getPostsWhere({repostOfId: postId}),
						transaction: options.transaction
					})
				]);
				await models.Post.update({repliesCount, repostsCount}, {where: {id: postId}, transaction: options.transaction});
			});
		}

		async updatePostManifest(userId, postId) {
			log('updatePostManifest');
			const post = await this.getPostPure(postId);
			log('getPost');
			const manifestStorageId = await app.generateAndSaveManifest('post', post);
			log('generateAndSaveManifest');
			await post.update({ manifestStorageId });
			const directoryStorageId = await this.makePostDirectoryWithContents(postId);
			await post.update({ directoryStorageId });
			await post.group.update({
				directoryStorageId: await app.ms.storage.getDirectoryId(`/${post.group.staticStorageId}/`)
			});
			await this.updateGroupManifest(userId, post.groupId);
			await this.callAfterPostManifestUpdateHooks(userId, post);
			return post;
		}

		async callAfterPostManifestUpdateHooks(userId, post) {
			try {
				await app.callHook('group', 'afterPostManifestUpdate', [userId, post.id]);
			} catch (e) {
				log('afterPostManifestUpdate hook error', e);
			}
		}

		async queuePostManifestUpdate(userId, postId, options: any = {}) {
			const queue = await app.ms.asyncOperation.addUniqueUserOperationQueue(
				userId,
				groupDerivedStateQueueModuleName,
				options.userApiKeyId || null,
				getPostManifestJobInput(postId)
			);
			if (options.process !== false) {
				this.startDerivedStateQueueProcessing();
			}
			return queue;
		}

		async queueGroupManifestUpdate(userId, groupId, options: any = {}) {
			const queue = await app.ms.asyncOperation.addUniqueUserOperationQueue(
				userId,
				groupDerivedStateQueueModuleName,
				options.userApiKeyId || null,
				getGroupManifestJobInput(groupId)
			);
			if (options.process !== false) {
				this.startDerivedStateQueueProcessing();
			}
			return queue;
		}

		startDerivedStateQueueProcessing(options: any = {}) {
			if (stopped) {
				return;
			}
			const limit = helpers.parsePositiveInteger(options.limit, groupDerivedStateKickBatchLimit);
			void this.processDerivedStateQueue({limit}).catch((e) => {
				log('processDerivedStateQueue error', e);
			});
		}

		startDerivedStateQueueWorker() {
			if (stopped || !shouldRunDerivedStateWorker()) {
				return;
			}
			if (derivedStateQueueWorker) {
				return;
			}

			derivedStateQueueWorker = startIntervalWorker(
				() => this.processDerivedStateQueue({limit: groupDerivedStateWorkerBatchLimit}),
				{
					intervalMs: groupDerivedStateWorkerIntervalMs,
					runImmediately: true,
					onError: e => log('processDerivedStateQueue error', e)
				}
			);
		}

		async stopDerivedStateQueueWorker() {
			const worker = derivedStateQueueWorker;
			derivedStateQueueWorker = null;
			await worker?.stop();
		}

		async stop() {
			stopped = true;
			await this.stopDerivedStateQueueWorker();
			await derivedStateQueueProcessPromise;
		}

		async applyPostManifestUpdate(userId, post, group = null, options: any = {}) {
			if (!shouldUseAsyncDerivedState(options)) {
				return this.updatePostManifest(userId, post.id);
			}

			const postGroup = group || post.group || await this.getGroup(post.groupId);
			if (postGroup.isEncrypted && postGroup.type === GroupType.PersonalChat) {
				return this.updatePostManifest(userId, post.id);
			}

			await this.queuePostManifestUpdate(userId, post.id, options);
			return this.getPostPure(post.id);
		}

		async applyGroupManifestUpdate(userId, groupId, options: any = {}) {
			if (!shouldUseAsyncDerivedState(options)) {
				return this.updateGroupManifest(userId, groupId);
			}

			return this.queueGroupManifestUpdate(userId, groupId, options);
		}

		processDerivedStateQueue(options: any = {}) {
			if (stopped || derivedStateQueueProcessPromise) {
				return Promise.resolve({processed: 0});
			}

			derivedStateQueueProcessPromise = this.runDerivedStateQueue(options);
			return derivedStateQueueProcessPromise.finally(() => {
				derivedStateQueueProcessPromise = null;
			});
		}

		async runDerivedStateQueue(options: any = {}) {
			let processed = 0;
			const limit = helpers.parsePositiveInteger(options.limit, Number.MAX_SAFE_INTEGER);

			while (processed < limit) {
				const waitingQueue = await this.prepareNextDerivedStateQueue();
				if (!waitingQueue) {
					return {processed};
				}

				await this.processDerivedStateQueueItem(waitingQueue);
				processed += 1;
			}
			return {processed};
		}

		async prepareNextDerivedStateQueue() {
			while (true) {
				const waitingQueue = await app.ms.asyncOperation.getWaitingOperationByModule(groupDerivedStateQueueModuleName);
				if (!waitingQueue) {
					return null;
				}
				if (!waitingQueue.asyncOperation) {
					return waitingQueue;
				}
				if (waitingQueue.asyncOperation.inProcess) {
					return null;
				}

				let job;
				try {
					job = parseGroupDerivedStateJob(waitingQueue.inputJson);
				} catch (e) {
					await app.ms.asyncOperation.closeUserOperationQueue(waitingQueue.id);
					continue;
				}
				const hasFailure = waitingQueue.asyncOperation.errorType || waitingQueue.asyncOperation.errorMessage;
				if (!hasFailure) {
					await app.ms.asyncOperation.closeUserOperationQueue(waitingQueue.id);
					continue;
				}
				if (getGroupDerivedStateJobAttempts(job) >= groupDerivedStateJobMaxAttempts) {
					await app.ms.asyncOperation.closeUserOperationQueue(waitingQueue.id);
					continue;
				}

				await app.ms.asyncOperation.updateUserOperationQueue(waitingQueue.id, {asyncOperationId: null});
				return waitingQueue;
			}
		}

		async processDerivedStateQueueItem(waitingQueue) {
			const job = getNextGroupDerivedStateJobAttempt(parseGroupDerivedStateJob(waitingQueue.inputJson));
			await app.ms.asyncOperation.updateUserOperationQueue(waitingQueue.id, {
				inputJson: JSON.stringify(job),
				startedAt: new Date()
			});

			const asyncOperation = await app.ms.asyncOperation.addAsyncOperation(waitingQueue.userId, {
				userApiKeyId: waitingQueue.userApiKeyId,
				module: groupDerivedStateQueueModuleName,
				name: getGroupDerivedStateJobName(job),
				channel: getGroupDerivedStateJobChannel(job)
			});

			await app.ms.asyncOperation.setAsyncOperationToUserOperationQueue(waitingQueue.id, asyncOperation.id);

			try {
				const result = await this.runDerivedStateJob(waitingQueue.userId, job);
				await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
				await app.ms.asyncOperation.finishAsyncOperation(waitingQueue.userId, asyncOperation.id, null, JSON.stringify(result));
				return result;
			} catch (e) {
				const rawErrorMessage = getErrorMessage(e);
				const errorMessage = getGroupDerivedStateJobFailureMessage(job, rawErrorMessage);
				await app.ms.asyncOperation.errorAsyncOperation(waitingQueue.userId, asyncOperation.id, errorMessage);
				if (getGroupDerivedStateJobAttempts(job) >= groupDerivedStateJobMaxAttempts) {
					await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
					return getGroupDerivedStateJobFailureResult(job, rawErrorMessage);
				}
				await app.ms.asyncOperation.updateUserOperationQueue(waitingQueue.id, {asyncOperationId: null});
				return null;
			}
		}

		async runDerivedStateJob(userId, job) {
			if (job.type === 'post-manifest') {
				const post = await this.updatePostManifest(userId, job.postId);
				const repairedPost = await this.getPostPure(post.id);
				const repairedGroup = await this.getGroup(repairedPost.groupId);
				return getPostManifestJobResult(job, repairedPost, repairedGroup);
			}
			if (job.type === 'group-manifest') {
				await this.updateGroupManifest(userId, job.groupId);
				const repairedGroup = await this.getGroup(job.groupId);
				return getGroupManifestJobResult(job, repairedGroup);
			}
			throw new Error('invalid_derived_state_job_type');
		}

		async getGroupUnreadPostsData(userId, groupId) {
			const groupRead = await this.getGroupRead(userId, groupId);
			if (groupRead) {
				const unreadFilters: any = {isDeleted: false};
				const hasReadPostCursor = groupRead.readAt && !isUndefined(groupRead.readPostId) && groupRead.readPostId !== null;
				if (hasReadPostCursor) {
					unreadFilters.publishedAfterCursorAt = groupRead.readAt;
					unreadFilters.publishedAfterCursorId = groupRead.readPostId;
				} else {
					unreadFilters.publishedAtGt = groupRead.readAt;
				}
				return {
					readAt: groupRead.readAt,
					readPostId: groupRead.readPostId,
					count: await this.getGroupPostsCount(groupId, unreadFilters)
				};
			}
			const group = await this.getGroup(groupId);
			if (!group) {
				return {
					readAt: null,
					count: 0
				};
			}
			return {
				readAt: null,
				//TODO: delete publishedPostsCount using after migration
				count: group.availablePostsCount ?? group.publishedPostsCount
			};
		}

		async addOrUpdateGroupRead(userId, groupReadData) {
			groupReadData.userId = userId;
			let groupRead = await this.getGroupRead(userId, groupReadData.groupId);
			if (groupRead) {
				return this.updateGroupRead(groupRead.id, groupReadData);
			} else {
				return this.addGroupRead(groupReadData);
			}
		}

		async getGroupPeers(groupId) {
			let ipnsId;
			if (ipfsHelper.isAccountCidHash(groupId)) {
				ipnsId = groupId;
			} else {
				const group = await this.getGroup(groupId);
				ipnsId = group.manifestStaticStorageId;
			}
			return app.ms.staticId.getStaticIdPeers(ipnsId);
		}


		async getLocalGroup(userId, groupId) {
			groupId = await this.checkGroupId(groupId);
			return this.getGroup(groupId);
		}

		async getGroupByManifestId(groupId, staticId) {
			if (!staticId) {
				const historyItem = await app.ms.staticId.getStaticIdItemByDynamicId(groupId);
				if (historyItem) {
					staticId = historyItem.staticId;
				}
			}
			const whereOr = [];
			if (groupId) {
				whereOr.push({manifestStorageId: groupId});
			}
			if (staticId) {
				whereOr.push({manifestStaticStorageId: staticId});
			}
			if (!whereOr.length) {
				return null;
			}
			return models.Group.findOne({
				where: {[Op.or]: whereOr, isDeleted: false},
				include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
			}) as IGroup;
		}

		async getGroupPosts(groupId, filters = {}, listParams?: IListParams) {
			groupId = await this.checkGroupId(groupId);
			listParams = helpers.prepareListParams(listParams, publicPostListParams);
			if (isUndefined(filters['isDeleted'])) {
				filters['isDeleted'] = false;
			}

			app.ms.database.setDefaultListParamsValues(listParams, publicPostListParams);
			const {limit} = listParams;
			const cursor = helpers.getListCursorState(filters);

			// D8/D9: keyset/cursor pagination. When the caller passes a cursor (publishedAt + id),
			// scan forward by (publishedAt DESC, id DESC) and skip total. The legacy offset path is
			// preserved so existing callers do not change. Cursor pagination drops the count and the
			// offset and exposes nextCursor in the result so a UI can iterate without large offsets.
			const pagePosts = await this.getGroupPostRefs(groupId, filters, listParams, {
				attributes: ['id', 'publishedAt']
			});
			const postIds = pagePosts.map(post => post.id);
			const list = await this.getHydratedPostListByIds(postIds, {groupId, includeRepostOf: true});
			const nextCursor = helpers.getNextListCursor(cursor, pagePosts, limit);

			return {
				list,
				total: helpers.shouldIncludeListTotal(listParams, cursor) ? await this.getGroupPostsCount(groupId, filters) : null,
				nextCursor,
			};
		}

		async getGroupPostRefs(groupId, filters = {}, listParams?: IListParams, options: any = {}) {
			groupId = await this.checkGroupId(groupId);
			listParams = helpers.prepareListParams(listParams);
			if (isUndefined(filters['isDeleted'])) {
				filters['isDeleted'] = false;
			}

			app.ms.database.setDefaultListParamsValues(listParams, options.defaultListParams || {sortBy: 'publishedAt'});
			const {limit, offset, sortBy, sortDir} = listParams;
			const cursorOptions = options.cursor || {};
			const cursor = helpers.getListCursorState(filters, cursorOptions);
			const where = this.getGroupPostsWhere(groupId, filters);
			if (options.cursor) {
				helpers.addCursorWhere(where, filters, options.cursor);
			}

			// Lightweight scans should not hydrate attachments/reposts. Callers that only need
			// timeline identity can reuse this instead of the full post-list loader.
			return models.Post.findAll({
				attributes: helpers.getCursorListAttributes(options.attributes || ['id', 'localId', 'publishedAt'], cursor, sortBy),
				where,
				order: helpers.getCursorListOrder(cursor, {sortBy, sortDir}),
				limit,
				offset: helpers.getCursorListOffset(cursor, offset),
				transaction: options.transaction
			}) as IPost[];
		}

		async getGroupPostRefsByLocalIds(groupId, localIds, options: any = {}) {
			groupId = await this.checkGroupId(groupId);
			const ids = helpers.normalizeUniqueIds(localIds);
			if (!ids.length) {
				return [];
			}
			return models.Post.findAll({
				attributes: options.attributes || ['id', 'localId', 'manifestStorageId', 'status', 'isDeleted'],
				where: {
					groupId,
					localId: {[Op.in]: ids}
				},
				order: [['localId', 'ASC'], ['id', 'ASC']],
				transaction: options.transaction
			}) as IPost[];
		}

		async forEachGroupPostRefBatch(groupId, options: any = {}, onBatch) {
			const maxRefs = isUndefined(options.maxRefs) ? Number.MAX_SAFE_INTEGER : options.maxRefs;
			const batchLimit = isUndefined(options.batchLimit) ? 100 : options.batchLimit;
			const listParams = options.listParams || {};
			let filters = {...(options.filters || {})};
			let processedRefs = 0;

			while (processedRefs < maxRefs) {
				const limit = Math.min(batchLimit, maxRefs - processedRefs);
				const postRefs = await this.getGroupPostRefs(groupId, filters, {
					...listParams,
					limit,
					offset: 0
				}, options);
				const refCount = postRefs.length;
				const nextCursor = helpers.getNextCursorFromRows(postRefs, limit, options.cursor);
				const batch = {
					postRefs,
					refCount,
					nextCursor
				};
				if (!batch.refCount) {
					break;
				}
				processedRefs += batch.refCount;
				const shouldContinue = await onBatch(batch, {processedRefs});
				if (shouldContinue === false || !batch.nextCursor) {
					break;
				}
				filters = {
					...filters,
					...helpers.getCursorFiltersFromCursor(batch.nextCursor, options.cursor)
				};
			}

			return processedRefs;
		}

		async getHydratedGroupPostBatch(groupId, filters = {}, listParams?: IListParams, options: any = {}) {
			listParams = helpers.prepareListParams(listParams);
			app.ms.database.setDefaultListParamsValues(listParams, options.defaultListParams || {sortBy: 'publishedAt'});
			const postRefs = await this.getGroupPostRefs(groupId, filters, listParams, {
				attributes: options.attributes || ['id', 'publishedAt'],
				cursor: options.cursor,
				defaultListParams: options.defaultListParams
			});
			const hydrateOptions = {
				groupId,
				...(options.hydrateOptions || {})
			};
			const groupPosts = await this.getHydratedPostListByIds(
				postRefs.map(post => post.id),
				hydrateOptions
			);
			return {
				postRefs,
				groupPosts,
				refCount: postRefs.length,
				nextCursor: helpers.getNextCursorFromRows(postRefs, listParams.limit, options.cursor)
			};
		}

		async forEachHydratedGroupPostBatch(groupId, options: any = {}, onBatch) {
			return this.forEachGroupPostRefBatch(groupId, options, async (refBatch, state) => {
				const hydrateOptions = {
					groupId,
					...(options.hydrateOptions || {})
				};
				const groupPosts = await this.getHydratedPostListByIds(
					refBatch.postRefs.map(post => post.id),
					hydrateOptions
				);
				return onBatch({
					...refBatch,
					groupPosts
				}, state);
			});
		}

		async getGroupManifestPostRefs(groupId, filters = {}, listParams?: IListParams) {
			return this.getGroupPostRefs(groupId, filters, listParams, {
				defaultListParams: {sortBy: 'updatedAt'},
				attributes: ['id', 'localId', 'isDeleted', 'isEncrypted', 'manifestStorageId', 'encryptedManifestStorageId', 'updatedAt'],
				cursor: {
					valueField: 'updatedAt',
					cursorValueFilter: 'cursorUpdatedAt',
					direction: 'after',
					orderDir: 'ASC'
				}
			});
		}

		async checkGroupId(groupId) {
			if (groupId == 'null' || groupId == 'undefined') {
				return null;
			}
			if (!groupId || isUndefined(groupId)) {
				return null;
			}
			if (!commonHelper.isNumber(groupId)) {
				let group = await this.getGroupByManifestId(groupId, groupId);
				if (group) {
					return group.id;
				}
			}
			return groupId;
		}

		async canCreatePostInGroup(userId, groupId) {
			if (!groupId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			const group = await this.getLocalGroup(userId, groupId);
			let canCreate = (await this.isAdminInGroupPure(userId, groupId))
				|| (!group.isOpen && await this.isMemberInGroupPure(userId, groupId));
			if(canCreate) {
				return canCreate;
			}

			const responses = await app.callHook('group', 'canCreatePostInGroup', [userId, groupId]);
			return some(responses);
		}

		async canReplyToPost(userId, replyToPostId) {
			if (!replyToPostId) {
				return true;
			}
			const post = await this.getPostPure(replyToPostId);
			if (post.isReplyForbidden) {
				return false;
			}
			if (post.isReplyForbidden === false) {
				return true;
			}
			if (await this.isAdminInGroupPure(userId, post.groupId)) {
				return true;
			}
			return !post.group.isReplyForbidden;
		}

		async canEditPostInGroup(userId, groupId, postId) {
			if (!groupId || !postId) {
				return false;
			}
			groupId = await this.checkGroupId(groupId);
			const group = await this.getLocalGroup(userId, groupId);
			const post = await this.getPostPure(postId);
			let canEdit = (await this.isAdminInGroupPure(userId, groupId))
				|| (!group.isOpen && await this.isMemberInGroupPure(userId, groupId) && post.userId === userId);
			if(canEdit) {
				return canEdit;
			}
			const responses = await app.callHook('group', 'canCreatePostInGroup', [userId, groupId]);
			return some(responses) && post.userId === userId;
		}

		resolveContentForPostData(content: IContent, dbContent: IContent, permissionReason: PostContentAttachmentReason): IResolvedPostContent {
			return {
				id: dbContent.id,
				view: content.view || dbContent.view,
				size: dbContent.size,
				permissionReason
			};
		}

		async resolveContentForPost(userId: number, content: IContent): Promise<IResolvedPostContent> {
			if (content.id) {
				const dbContent: IContent = await app.ms.database.getContent(content.id);
				if (!dbContent) {
					throw new Error("content_not_found");
				}
				if (dbContent.userId === userId) {
					return this.resolveContentForPostData(content, dbContent, PostContentAttachmentReason.Owner);
				}
				if (dbContent.isPublic) {
					return this.resolveContentForPostData(content, dbContent, PostContentAttachmentReason.Public);
				}
				throw new Error("content_not_permitted");
			}
			if (content.manifestStorageId) {
				const dbContent: IContent = await app.ms.content.createContentByRemoteStorageId(userId, content.manifestStorageId);
				if (!dbContent) {
					throw new Error("content_not_found");
				}
				return this.resolveContentForPostData(content, dbContent, PostContentAttachmentReason.ActorManifestImport);
			}
			if (content.storageId) {
				const dbContent: IContent = await app.ms.database.getContentByStorageAndUserId(content.storageId, userId);
				if (!dbContent) {
					throw new Error("content_not_found");
				}
				return this.resolveContentForPostData(content, dbContent, PostContentAttachmentReason.ActorStorage);
			}
			throw new Error("content_not_found");
		}

		async getContentsForPost(userId: number, contents: IContent[]): Promise<IResolvedPostContent[] | null> {
			if(!contents) {
				return null;
			}
			const contentsData = await pIteration.map(contents, c => this.resolveContentForPost(userId, c));
			return uniqBy(contentsData.filter(c => c.id), 'id');
		}

		async createImageComposition(userId: number, rawInput) {
			const input = normalizeImageCompositionCreateInput(rawInput);
			const [, canCreate] = await Promise.all([
				app.checkUserCan(userId, CorePermissionName.UserGroupManagement),
				this.canCreatePostInGroup(userId, input.groupId),
			]);
			if (!canCreate) {
				throw new ImageCompositionApiError('composition_not_permitted', 403);
			}
			const baseContent = await this.getPermittedImageCompositionBase(userId, input.baseContentManifestId);
			const operation = await this.claimImageCompositionOperation(userId, 'create', input.compositionId, input);
			if (operation.replay) {
				return operation.response;
			}

			try {
				const existingPost = await models.Post.findOne({where: {
					groupId: input.groupId,
					type: IMAGE_COMPOSITION_POST_TYPE,
					source: 'microwave-girls',
					sourceChannelId: 'image-composition-v1',
					sourcePostId: input.compositionId,
					isDeleted: false,
				}});
				if (existingPost) {
					if (Number(existingPost.userId) !== Number(userId)) {
						throw new ImageCompositionApiError('composition_idempotency_conflict', 409);
					}
					const recoveredPost = await this.getPostPure(existingPost.id);
					const recoveredComposition = parseStoredImageComposition(recoveredPost);
					if (!doesStoredCompositionMatchCreate(recoveredComposition, input)) {
						throw new ImageCompositionApiError('composition_idempotency_conflict', 409);
					}
					const repairedPost = await this.applyPostManifestUpdate(userId, recoveredPost, recoveredPost.group);
					const response = buildResolvedImageComposition(repairedPost, recoveredComposition);
					await imageCompositionOperations.succeed(operation.id, operation.claimToken, {
						postId: response.postId,
						revision: response.revision,
						response,
					});
					return response;
				}
				const storedStickers = [];
				const stickerContents: IContent[] = [];
				for (const sticker of input.stickers) {
					const generated = generateImageCompositionStickerSvg(sticker);
					const content = await app.ms.content.saveData(
						userId,
						generated.svg,
						`composition-${input.compositionId}-${sticker.id}.svg`,
						{
							mimeType: generated.mimeType,
							view: ContentView.Attachment,
							properties: {
								source: 'image-composition-v1',
								semanticHash: generated.semanticHash,
								templateVersion: generated.templateVersion,
							},
						},
					);
					stickerContents.push(content);
					storedStickers.push({
						...sticker,
						templateVersion: generated.templateVersion,
						contentManifestId: content.manifestStorageId,
						semanticHash: generated.semanticHash,
					});
				}
				const composition: StoredImageComposition = {
					version: IMAGE_COMPOSITION_VERSION,
					compositionId: input.compositionId,
					revision: 1,
					baseContentManifestId: input.baseContentManifestId,
					output: input.output,
					stickers: storedStickers,
				};
				const post = await this.createPost(userId, {
					groupId: input.groupId,
					status: PostStatus.Published,
					type: IMAGE_COMPOSITION_POST_TYPE,
					view: IMAGE_COMPOSITION_VIEW,
					source: 'microwave-girls',
					sourceChannelId: 'image-composition-v1',
					sourcePostId: input.compositionId,
					propertiesJson: getImageCompositionProperties(composition),
					contents: [
						{id: baseContent.id, view: ContentView.Media},
						...stickerContents.map(content => ({id: content.id, view: ContentView.Attachment})),
					],
				});
				const response = buildResolvedImageComposition(post, composition);
				await imageCompositionOperations.succeed(operation.id, operation.claimToken, {
					postId: response.postId,
					revision: response.revision,
					response,
				});
				return response;
			} catch (error) {
				await this.failImageCompositionOperation(operation, error);
				throw error;
			}
		}

		async updateImageComposition(userId: number, postId, rawInput) {
			const input = normalizeImageCompositionUpdateInput(rawInput);
			const oldPost = await this.getPostPure(postId);
			if (!oldPost) {
				throw new ImageCompositionApiError('composition_not_found', 404);
			}
			const current = parseStoredImageComposition(oldPost);
			const [, canEdit] = await Promise.all([
				app.checkUserCan(userId, CorePermissionName.UserGroupManagement),
				this.canEditPostInGroup(userId, oldPost.groupId, oldPost.id),
			]);
			if (!canEdit) {
				throw new ImageCompositionApiError('composition_not_permitted', 403);
			}
			if (current.output.width !== input.output.width || current.output.height !== input.output.height) {
				throw new ImageCompositionApiError('composition_invalid', 422, {field: 'output'});
			}
			const operation = await this.claimImageCompositionOperation(userId, 'update', String(oldPost.id), input);
			if (operation.replay) {
				return operation.response;
			}
			if (current.revision !== input.expectedRevision) {
				if (current.revision === input.expectedRevision + 1 && doesStoredCompositionMatchUpdate(current, input)) {
					const repairedPost = await this.applyPostManifestUpdate(userId, oldPost, oldPost.group);
					const response = buildResolvedImageComposition(repairedPost, current);
					await imageCompositionOperations.succeed(operation.id, operation.claimToken, {
						postId: response.postId,
						revision: response.revision,
						response,
					});
					return response;
				}
				const conflict = new ImageCompositionApiError('composition_revision_conflict', 409, {currentRevision: current.revision});
				await this.failImageCompositionOperation(operation, conflict);
				throw conflict;
			}

			try {
				const contentsByManifest = new Map((oldPost.contents || []).map(content => [content.manifestStorageId, content]));
				const baseContent = contentsByManifest.get(current.baseContentManifestId);
				assertRasterBaseContent(baseContent || null);
				const oldStickers = new Map(current.stickers.map(sticker => [sticker.id, sticker]));
				const nextStickers = [];
				const nextContents: IContent[] = [];
				for (const sticker of input.stickers) {
					const generated = generateImageCompositionStickerSvg(sticker);
					const oldSticker = oldStickers.get(sticker.id);
					let content = oldSticker?.semanticHash === generated.semanticHash
						? contentsByManifest.get(oldSticker.contentManifestId)
						: null;
					if (!content) {
						content = await app.ms.content.saveData(
							userId,
							generated.svg,
							`composition-${current.compositionId}-${sticker.id}-r${current.revision + 1}.svg`,
							{
								mimeType: generated.mimeType,
								view: ContentView.Attachment,
								properties: {
									source: 'image-composition-v1',
									semanticHash: generated.semanticHash,
									templateVersion: generated.templateVersion,
								},
							},
						);
					}
					nextContents.push(content);
					nextStickers.push({
						...sticker,
						templateVersion: generated.templateVersion,
						contentManifestId: content.manifestStorageId,
						semanticHash: generated.semanticHash,
					});
				}
				const composition: StoredImageComposition = {
					...current,
					revision: current.revision + 1,
					stickers: nextStickers,
				};
				const post = await this.updatePostPure(userId, oldPost.id, {
					propertiesJson: getImageCompositionProperties(composition),
					contents: [
						{id: baseContent.id, view: ContentView.Media},
						...nextContents.map(content => ({id: content.id, view: ContentView.Attachment})),
					],
				}, {
					oldPost,
					expectedCompositionRevision: input.expectedRevision,
				});
				const response = buildResolvedImageComposition(post, composition);
				await imageCompositionOperations.succeed(operation.id, operation.claimToken, {
					postId: response.postId,
					revision: response.revision,
					response,
				});
				return response;
			} catch (error) {
				await this.failImageCompositionOperation(operation, error);
				throw error;
			}
		}

		async getImageComposition(userId: number, postId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			const post = await this.getPostPure(postId);
			if (!post || post.isDeleted || post.status !== PostStatus.Published) {
				throw new ImageCompositionApiError('composition_not_found', 404);
			}
			if (!(await this.canViewImageCompositionGroup(userId, post.group))) {
				throw new ImageCompositionApiError('composition_not_permitted', 403);
			}
			return buildResolvedImageComposition(post);
		}

		async getImageCompositions(userId: number, groupId, filters = {}, listParams?: IListParams) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			groupId = await this.checkGroupId(groupId);
			const group = await this.getGroup(groupId);
			if (!(await this.canViewImageCompositionGroup(userId, group))) {
				throw new ImageCompositionApiError('composition_not_permitted', 403);
			}
			const result = await this.getGroupPosts(groupId, {
				...filters,
				type: IMAGE_COMPOSITION_POST_TYPE,
				status: PostStatus.Published,
				isDeleted: false,
			}, listParams);
			return {
				...result,
				list: result.list.flatMap(post => {
					try {
						return [buildResolvedImageComposition(post)];
					} catch (error) {
						if (error instanceof ImageCompositionApiError) {
							return [];
						}
						throw error;
					}
				}),
			};
		}

		async canViewImageCompositionGroup(userId: number, group) {
			if (!group) {
				return false;
			}
			// Public compositions are readable by authenticated clients. Private-group
			// compositions are restricted to that group's members and administrators.
			if (group.isPublic) {
				return true;
			}
			const [isMember, isAdmin] = await Promise.all([
				this.isMemberInGroupPure(userId, group.id),
				this.isAdminInGroupPure(userId, group.id),
			]);
			return canViewImageCompositionGroup(group, isMember, isAdmin);
		}

		async getPermittedImageCompositionBase(userId: number, manifestStorageId: string): Promise<IContent> {
			let content = await app.ms.database.getContentByManifestAndUserId(manifestStorageId, userId);
			if (!content) {
				content = await app.ms.database.getContentByManifestId(manifestStorageId);
				if (content && !content.isPublic) {
					throw new ImageCompositionApiError('composition_content_not_permitted', 403);
				}
			}
			assertRasterBaseContent(content);
			return content;
		}

		async claimImageCompositionOperation(userId: number, operationKind: 'create' | 'update', targetKey: string, request) {
			const identity = {actorUserId: userId, operationKind, targetKey, idempotencyKey: request.idempotencyKey};
			let claim;
			try {
				claim = await imageCompositionOperations.claim({
					...identity,
					requestHash: createImageCompositionRequestHash(request),
				});
			} catch (error) {
				if ((error as Error).message === 'composition_idempotency_conflict') {
					throw new ImageCompositionApiError('composition_idempotency_conflict', 409);
				}
				throw error;
			}
			if (claim.disposition === 'replay') {
				return {replay: true, response: claim.result?.response};
			}
			if (claim.disposition === 'claimed') {
				return {replay: false, id: claim.operation.id, claimToken: claim.claimToken};
			}
			for (let attempt = 0; attempt < 50; attempt += 1) {
				await new Promise(resolve => setTimeout(resolve, 100));
				const pending = await imageCompositionOperations.find(identity);
				if (pending?.state === 'succeeded') {
					return {replay: true, response: pending.resultJson ? JSON.parse(pending.resultJson) : undefined};
				}
				if (pending?.state === 'failed') {
					const reclaimed = await imageCompositionOperations.claim({
						...identity,
						requestHash: createImageCompositionRequestHash(request),
					});
					if (reclaimed.disposition === 'claimed') {
						return {replay: false, id: reclaimed.operation.id, claimToken: reclaimed.claimToken};
					}
				}
			}
			throw new ImageCompositionApiError('composition_idempotency_conflict', 409, {retryable: true});
		}

		async failImageCompositionOperation(operation, error) {
			try {
				await imageCompositionOperations.fail(
					operation.id,
					operation.claimToken,
					error instanceof ImageCompositionApiError ? error.errorCode : 'composition_storage_failed',
				);
			} catch (claimError) {
				log('failed to record image composition operation failure', claimError);
			}
		}

		async createPost(userId, postData) {
			postData = clone(postData);
			log('createPost', postData);
			const [, canCreate, canReply] = await Promise.all([
				app.checkUserCan(userId, CorePermissionName.UserGroupManagement),
				this.canCreatePostInGroup(userId, postData.groupId),
				this.canReplyToPost(userId, postData.replyToId)
			]);
			if(!canCreate || !canReply) {
				throw new Error("not_permitted");
			}
			log('checkUserCan, canCreatePostInGroup');
			postData.userId = userId;
			postData.groupId = await this.checkGroupId(postData.groupId);
			log('checkGroupId');

			const postInputContents = await getPostInputContents(app, userId, postData);
			stripPostContentInputFields(postData);
			const contents = await this.getContentsForPost(userId, postInputContents);
			const size = sumBy(contents || [], contentSize);

			const [user, group] = await Promise.all([
				app.ms.database.getUser(userId),
				this.getGroup(postData.groupId)
			]);
			log('getUser, getGroup');

			postData.authorStorageId = user.manifestStorageId;
			postData.authorStaticStorageId = user.manifestStaticStorageId;
			postData.groupStorageId = group.manifestStorageId;
			postData.groupStaticStorageId = group.manifestStaticStorageId;

			if(!postData.isRemote) {
				postData.isRemote = false;
			}

			const shouldPublishPost = postData.status === PostStatus.Published && postData.isDeleted !== true;
			let post;
			await app.ms.database.sequelize.transaction(async (transaction) => {
				if (shouldPublishPost) {
					postData.localId = await this.allocatePostLocalId(postData, transaction);
					postData.publishedAt = postData.publishedAt || new Date();
				}
				log('localId');

				post = await this.addPost(postData, {transaction});
				log('addPost');

				await this.reconcilePostRelationCounters([post.replyToId, post.repostOfId], {transaction});
				log('replyPostUpdate');

				if (contents) {
					await this.setPostContents(post.id, contents, {transaction});
				}
				log('setPostContents');

				await models.Post.update({size}, {where: {id: post.id}, transaction});
				log('updatePost');

				const nextPostEventState = {...getPostEventState(post), size};
				await this.addPostEvents([
					buildPostLifecycleEvent(userId, null, nextPostEventState),
					buildSourceImportPostEvent(userId, null, nextPostEventState)
				], {transaction});

				if (post.status === PostStatus.Published && !post.isDeleted) {
					await this.incrementGroupCounters(post.groupId, {sizeDelta: size || 0, availableDelta: 1}, {transaction});
				}
			});
			post = await this.getPostPure(post.id);

			// B4: drafts/deleted rows are DB-only canonical state. Skip post/group manifest,
			// static directory, and the personal-chat encryption handshake unless the row
			// was created as an active published post.
			if (post.status === PostStatus.Published && !post.isDeleted) {
				post = await this.applyPostManifestUpdate(userId, post, group);
				log('updatePostManifest');

				if (group.isEncrypted && group.type === GroupType.PersonalChat) {
					// Encrypt post id
					const keyForEncrypt = await app.ms.accountStorage.getStaticIdPublicKeyByOr(group.staticStorageId);

					const userKey = await communicator.keyLookup(user.manifestStaticStorageId);
					const userPrivateKey = await pgpHelper.transformKey(userKey.marshal());
					const userPublicKey = await pgpHelper.transformKey(userKey.public.marshal(), true);
					const publicKeyForEncrypt = await pgpHelper.transformKey(peerIdHelper.base64ToPublicKey(keyForEncrypt), true);
					const encryptedText = await pgpHelper.encrypt([userPrivateKey], [publicKeyForEncrypt, userPublicKey], post.manifestStorageId);

					//TODO: enable on fluence update

					// communicator.publishEventByStaticId(user.manifestStaticStorageId, communicator.getAccountsGroupUpdatesTopic([user.manifestStaticStorageId, group.staticStorageId], group.name), {
					// 	type: 'new_post',
					// 	postId: encryptedText,
					// 	groupId: group.manifestStaticStorageId,
					// 	isEncrypted: true,
					// 	sentAt: (post.publishedAt || post.createdAt).toString()
					// });

					await models.Post.update({isEncrypted: true, encryptedManifestStorageId: encryptedText}, {where: {id: post.id}});
					await this.updateGroupManifest(userId, group.id);
				} else {
					// Send plain post id
					//TODO: enable on fluence update

					// communicator.publishEventByStaticId(user.manifestStaticStorageId, communicator.getUpdatesTopic(group.staticStorageId, 'update'), {
					// 	type: 'new_post',
					// 	postId: post.manifestStorageId,
					// 	groupId: group.manifestStaticStorageId,
					// 	isEncrypted: false,
					// 	sentAt: (post.publishedAt || post.createdAt).toString()
					// });
					log('publishEventByStaticId');
				}
			}

			return post;
		}

		async createRemotePostByObject(userId, postData, options: any = {}) {
			postData = clone(postData);
			postData.userId = userId;
			postData.groupId = await this.checkGroupId(postData.groupId);
			postData.isRemote = true;
			postData.status = PostStatus.Published;

			const contents = await this.getContentsForPost(userId, postData.contents);
			delete postData.contents;
			const size = sumBy(contents || [], contentSize);
			const shouldPublishPost = postData.status === PostStatus.Published && postData.isDeleted !== true;
			let post;

			await app.ms.database.sequelize.transaction(async (transaction) => {
				const lockedGroup = await this.lockGroupForPostWrite(postData.groupId, transaction);
				const existingPost = await this.getActivePostByGroupAndManifestId(postData, {transaction});
				if (existingPost) {
					post = existingPost;
					return;
				}

				if (shouldPublishPost && !postData.localId) {
					postData.localId = await this.allocatePostLocalId(postData, transaction, lockedGroup);
				}
				if (shouldPublishPost) {
					postData.publishedAt = postData.publishedAt || new Date();
				}

				post = await this.addPost(postData, {transaction});
				await this.reconcilePostRelationCounters([post.replyToId, post.repostOfId], {transaction});
				if (contents) {
					await this.setPostContents(post.id, contents, {transaction});
				}
				await models.Post.update({size}, {where: {id: post.id}, transaction});

				const nextPostEventState = {...getPostEventState(post), size};
				await this.addPostEvents([
					buildPostLifecycleEvent(userId, null, nextPostEventState),
					buildSourceImportPostEvent(userId, null, nextPostEventState)
				], {transaction});

				if (post.status === PostStatus.Published && !post.isDeleted) {
					await this.incrementGroupCounters(post.groupId, {sizeDelta: size || 0, availableDelta: 1}, {transaction});
				}
			});

			if (!options.skipGroupManifestUpdate) {
				await this.applyGroupManifestUpdate(userId, post.groupId, options);
			}
			return this.getPostPure(post.id);
		}

		async getPost(userId, postId) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			//TODO: add check for user can view post
			return this.getPostPure(postId);
		}

		async getPostListByIds(userId, groupId, postIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			//TODO: add check for user can view post
			return this.getPostListByIdsPure(groupId, postIds);
		}

		async delete(userId, groupId, postIds) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			//TODO: add check for user can view post
			return this.getPostListByIdsPure(groupId, postIds);
		}

		async prepareContentData(c: IContent, options: IContentDataProjectionOptions = {}): Promise<IContentData> {
			// Prefer the PostsContents join-row view when this Content arrives via post.contents
			// hydration; the Content row's default view is the fallback. P2: "Per-post attachment
			// metadata is not consistently read from the join row" — same fix as the post manifest
			// generator.
			const attachmentView = c['postsContents']?.view || c.view || ContentView.Contents;
			const baseData = {
				id: c.id,
				name: c.name,
				description: c.description,
				storageId: c.storageId,
				previewStorageId: c.mediumPreviewStorageId,
				view: attachmentView,
				manifestId: c.manifestStorageId,
				extension: c.extension,
				previewExtension: c.previewExtension,
				mimeType: c.mimeType,
				size: c.size,
			}
			const mimeType = String(c.mimeType || '');
			if (isProjectedRichTextContent(c)) {
				const contentData: IContentData = {
					type: 'text',
					...baseData
				};
				if (options.includeText !== false || options.includeJson !== false) {
					const richText = await getProjectedContentRichText(app.ms.storage, c, options);
					if (options.includeText !== false) {
						contentData.text = getProjectedContentRichTextPlainText(richText);
					}
					if (richText && options.includeJson !== false) {
						contentData.json = richText;
					}
				}
				return contentData;
			}
			if (mimeType.startsWith('text/')) {
				const contentData: IContentData = {
					type: 'text',
					...baseData
				};
				if (options.includeText !== false) {
					contentData.text = await getProjectedContentText(app.ms.storage, c, options);
				}
				return contentData;
			} else if (mimeType.includes('image')) {
				return {
					type: 'image',
					...baseData
				};
			} else if (mimeType.includes('video')) {
				return {
					type: 'video',
					...baseData
				};
			} else if (mimeType.includes('json')) {
				const contentData: IContentData = {
					type: 'json',
					...baseData
				};
				if (options.includeJson !== false) {
					contentData.json = JSON.parse(await getProjectedContentText(app.ms.storage, c, options));
				}
				return contentData;
			}
			return {
				type: 'file',
				...baseData
			};
		}

		async prepareContentDataWithUrl(c: IContent, baseStorageUri: string, options: IContentDataProjectionOptions = {}): Promise<IContentData> {
			return this.prepareContentData(c, options).then(contentData => {
				if (!contentData) {
					return contentData;
				}
				if (contentData.storageId) {
					contentData['url'] = baseStorageUri + contentData.storageId;
				}
				if (contentData.previewStorageId) {
					contentData['previewUrl'] = baseStorageUri + contentData.previewStorageId;
				}
				return contentData;
			});
		}

		async getPostContentData(post: IPost, baseStorageUri: string, options: IContentDataProjectionOptions = {}): Promise<IContentData[]> {
			return pIteration.map(
				orderBy(post.contents, [(c: any) => c.postsContents.position], ['asc']),
				c => this.prepareContentDataWithUrl(c, baseStorageUri, options),
			).then((contents: any[]) => contents.filter(c => !!c));
		}

		async getPostContentDataWithUrl(post: IPost, baseStorageUri: string, options: IContentDataProjectionOptions = {}): Promise<IContentData[]> {
			return this.getPostContentData(post, baseStorageUri, options).then(contents => contents.map(c => {
				if (c.storageId) {
					c['url'] = baseStorageUri + c.storageId;
				}
				if (c.previewStorageId) {
					c['previewUrl'] = baseStorageUri + c.previewStorageId;
				}
				return c;
			}));
		}

		async updateRemotePostByObject(userId, postId, postData, options: any = {}) {
			postData = clone(postData);
			postData.isRemote = true;
			postData.status = PostStatus.Published;
			return this.updatePostPure(userId, postId, postData, options);
		}

		async updatePost(userId, postId, postData) {
			const oldPost = await this.getPostPure(postId);
			const [, canEdit] = await Promise.all([
				await app.checkUserCan(userId, CorePermissionName.UserGroupManagement),
				this.canEditPostInGroup(userId, oldPost.groupId, postId),
			]);
			if (!canEdit) {
				throw new Error("not_permitted");
			}

			return this.updatePostPure(userId, postId, postData, {oldPost});
		}

		async updatePostPure(userId, postId, postData, options: any = {}) {
			const oldPost = options.oldPost || await this.getPostPure(postId);
			if (!oldPost) {
				throw new Error("post_not_found");
			}

			postData = clone(postData);
			// B5: cross-group moves are not supported. Users who want a post in another group
			// repost it (repostOfId) or create a new post that reuses the same content attachments.
			if (!isUndefined(postData.groupId) && Number(postData.groupId) !== Number(oldPost.groupId)) {
				throw new Error("group_move_not_supported");
			}
			delete postData.groupId;

			const postInputContents = await getPostInputContents(app, userId, postData);
			stripPostContentInputFields(postData);
			const contentsData = await this.getContentsForPost(userId, postInputContents);

			// B4: drafts/deleted rows are DB-only. Only run post manifest/static rebuild when
			// the merged row is actively published. Rows that leave the public lifecycle still
			// need the group manifest regenerated so its inherited posts trie drops the old local ID.
			const mergedStatus = !isUndefined(postData.status) ? postData.status : oldPost.status;
			const mergedIsDeleted = !isUndefined(postData.isDeleted) ? postData.isDeleted : oldPost.isDeleted;
			const wasPublished = oldPost.status === PostStatus.Published && !oldPost.isDeleted;
			const isPublished = mergedStatus === PostStatus.Published && !mergedIsDeleted;
			const oldSize = oldPost.size || 0;
			postData.size = contentsData ? sumBy(contentsData, contentSize) : await this.getPostSizeSum(postId);
			const newSize = postData.size || 0;
			const newReplyToId = !isUndefined(postData.replyToId) ? postData.replyToId : oldPost.replyToId;
			const newRepostOfId = !isUndefined(postData.repostOfId) ? postData.repostOfId : oldPost.repostOfId;
			const replyToPostIds = helpers.normalizeUniqueIds([oldPost.replyToId, newReplyToId]);
			const repostOfPostIds = helpers.normalizeUniqueIds([oldPost.repostOfId, newRepostOfId]);
			const shouldReconcileReplyCounters = wasPublished !== isPublished || Number(oldPost.replyToId || 0) !== Number(newReplyToId || 0);
			const shouldReconcileRepostCounters = wasPublished !== isPublished || Number(oldPost.repostOfId || 0) !== Number(newRepostOfId || 0);
			const nextPostEventState = {
				...getPostEventState(oldPost),
				...postData,
				id: oldPost.id,
				groupId: oldPost.groupId,
				userId: oldPost.userId
			};

			await app.ms.database.sequelize.transaction(async (transaction) => {
				if (!isUndefined(options.expectedCompositionRevision)) {
					const lockedPost = await models.Post.findOne({
						where: {id: postId},
						transaction,
						lock: transaction.LOCK.UPDATE,
					});
					if (!lockedPost) {
						throw new ImageCompositionApiError('composition_not_found', 404);
					}
					const lockedComposition = parseStoredImageComposition(lockedPost as IPost);
					if (lockedComposition.revision !== options.expectedCompositionRevision) {
						throw new ImageCompositionApiError('composition_revision_conflict', 409, {
							currentRevision: lockedComposition.revision,
						});
					}
				}
				if (isPublished && !oldPost.localId) {
					postData.localId = await this.allocatePostLocalId({...postData, groupId: oldPost.groupId}, transaction);
					postData.publishedAt = postData.publishedAt || oldPost.publishedAt || new Date();
					nextPostEventState.localId = postData.localId;
					nextPostEventState.publishedAt = postData.publishedAt;
				}

				if (contentsData) {
					await this.setPostContents(postId, contentsData, {transaction});
				}

				await models.Post.update(postData, {where: {id: postId}, transaction});
				await this.addPostEvents([
					buildPostLifecycleEvent(userId, oldPost, nextPostEventState),
					buildSourceImportPostEvent(userId, oldPost, nextPostEventState)
				], {transaction});
				if (isPublished && !wasPublished) {
					await this.incrementGroupCounters(oldPost.groupId, {sizeDelta: newSize, availableDelta: 1}, {transaction});
				} else if (!isPublished && wasPublished) {
					await this.incrementGroupCounters(oldPost.groupId, {sizeDelta: -oldSize, availableDelta: -1}, {transaction});
				} else if (isPublished && newSize !== oldSize) {
					await this.incrementGroupCounters(oldPost.groupId, {sizeDelta: newSize - oldSize}, {transaction});
				}

				if (shouldReconcileReplyCounters || shouldReconcileRepostCounters) {
					await this.reconcilePostRelationCounters([...replyToPostIds, ...repostOfPostIds], {transaction});
				}
			});
			if (isPublished) {
				const updatedPost = await this.getPostPure(postId);
				return this.applyPostManifestUpdate(userId, updatedPost, oldPost.group, options);
			}
			if (wasPublished) {
				await this.applyGroupManifestUpdate(userId, oldPost.groupId, options);
			}
			return this.getPostPure(postId);
		}

		async deletePosts(userId, postIds, options: any = {}) {
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			const posts = await this.getPostsMetadata(postIds);
			const cantEditSomeOfPosts = await pIteration.some(posts, async (post) => {
				return this.canEditPostInGroup(userId, post.groupId, post.id).then(r => !r);
			})
			if (cantEditSomeOfPosts) {
				throw new Error("not_permitted");
			}

			return this.deletePostsByMetadata(userId, posts, options);
		}

		async deletePostsPure(userId, postIds, options: any = {}) {
			const posts = await this.getPostsMetadata(postIds);
			return this.deletePostsByMetadata(userId, posts, options);
		}

		async deletePostsByMetadata(userId, posts, options: any = {}) {
			if (!posts.length) {
				return true;
			}

			// Capture counter deltas before mutating state so we know which posts were currently
			// counted toward availability/size at the moment of deletion.
			const decrementsByGroup: Record<number, {sizeDelta: number, availableDelta: number}> = {};
			for (const p of posts) {
				if (!p.groupId) {
					continue;
				}
				// already counted out
				if (p.isDeleted) {
					continue;
				}
				// drafts/queued never moved counters
				if (p.status !== PostStatus.Published) {
					continue;
				}
				const entry = decrementsByGroup[p.groupId] || {sizeDelta: 0, availableDelta: 0};
				entry.sizeDelta -= (p.size || 0);
				entry.availableDelta -= 1;
				decrementsByGroup[p.groupId] = entry;
			}
			const replyToPostIds = helpers.normalizeUniqueIds(posts.map(p => p.replyToId));
			const repostOfPostIds = helpers.normalizeUniqueIds(posts.map(p => p.repostOfId));
			const postIds = posts.map(p => p.id);
			const updateData: any = {isDeleted: true};
			if (options.clearLocalIds) {
				updateData.localId = null;
			}

			await app.ms.database.sequelize.transaction(async (transaction) => {
				await this.updatePosts(postIds, updateData, {transaction});

				await pIteration.forEach(posts, async (post) => {
					const nextPostEventState = {
						...getPostEventState(post),
						...updateData
					};
					await this.addPostEvents([
						buildPostLifecycleEvent(userId, post, nextPostEventState),
						buildSourceImportPostEvent(userId, post, nextPostEventState)
					], {transaction});
				});

				await pIteration.forEach(Object.entries(decrementsByGroup), async ([groupId, deltas]) => {
					await this.incrementGroupCounters(Number(groupId), deltas, {transaction});
				});

				await this.reconcilePostRelationCounters([...replyToPostIds, ...repostOfPostIds], {transaction});
			});

			if (!options.skipGroupManifestUpdate) {
				// Regenerate the affected group manifests so counters and deleted local-id tombstones land.
				// The manifest is still monolithic; chunked post-index storage remains the follow-up P1.
				const affectedGroupIds = Array.from(new Set(posts.map(p => p.groupId).filter((id): id is number => !!id)));
				await pIteration.forEach(affectedGroupIds, async (groupId) => {
					await this.applyGroupManifestUpdate(userId, groupId, options);
				});
			}

			return true;
		}

		async lockGroupForPostWrite(groupId, transaction) {
			if (!groupId) {
				return null;
			}
			const group = await models.Group.findOne({
				where: {id: groupId},
				transaction,
				lock: Transaction.LOCK.UPDATE
			});
			if (!group) {
				throw new Error("group_not_found");
			}
			return group;
		}

		async getActivePostByGroupAndManifestId(post: IPost, options: any = {}) {
			if (!post.groupId || !post.manifestStorageId) {
				return null;
			}
			return models.Post.findOne({
				where: {
					groupId: post.groupId,
					manifestStorageId: post.manifestStorageId,
					isDeleted: false
				},
				order: [['id', 'ASC']],
				transaction: options.transaction
			});
		}

		async allocatePostLocalId(post: IPost, transaction, lockedGroup = null) {
			if (!post.groupId) {
				return null;
			}
			const group = lockedGroup || await this.lockGroupForPostWrite(post.groupId, transaction);
			const maxLocalId = await models.Post.max('localId', {where: {groupId: post.groupId}, transaction}).then(m => m || 0);
			const nextLocalId = Math.max(group.publishedPostsCount || 0, maxLocalId) + 1;
			await group.update({publishedPostsCount: nextLocalId}, {transaction});
			return nextLocalId;
		}

		async getPostLocalId(post: IPost) {
			return app.ms.database.sequelize.transaction((transaction) => this.allocatePostLocalId(post, transaction));
		}

		async addUserFriendById(userId, friendId) {
			await app.checkUserCan(userId, CorePermissionName.UserFriendsManagement);

			friendId = await app.checkUserId(userId, friendId, true);

			const user = await app.ms.database.getUser(userId);
			const friend = await app.ms.database.getUser(friendId);

			const group = await this.createGroup(userId, {
				name: (user.name + "_" + friend.name).replace(/[\W_]+/g, "_") + '_default',
				type: GroupType.PersonalChat,
				theme: 'default',
				title: friend.title,
				storageId: friend.manifestStorageId,
				staticStorageId: friend.manifestStaticStorageId,
				avatarImageId: friend.avatarImageId,
				view: GroupView.TelegramLike,
				isPublic: false,
				isEncrypted: true,
				isRemote: false
			});

			await this.addMemberToGroupPure(userId, group.id);
			await this.addAdminToGroupPure(userId, group.id);

			app.events.emit(app.events.NewPersonalGroup, group);

			return app.ms.database.addUserFriend(userId, friendId);
		}

		async removeUserFriendById(userId, friendId) {
			await app.checkUserCan(userId, CorePermissionName.UserFriendsManagement);

			friendId = await app.checkUserId(userId, friendId, true);

			// TODO: remove personal chat group?

			return app.ms.database.removeUserFriend(userId, friendId);
		}

		async getUserFriends(userId, search?, listParams?: IListParams) {
			listParams = helpers.prepareListParams(listParams, userFriendListParams);
			await app.checkUserCan(userId, CorePermissionName.UserFriendsManagement);
			return {
				list: await app.ms.database.getUserFriends(userId, search, listParams),
				total: await app.ms.database.getUserFriendsCount(userId, search)
			};
		}

		async getMemberInGroups(userId, types, listParams?: IListParams) {
			listParams = helpers.prepareListParams(listParams, userGroupListParams);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			app.ms.database.setDefaultListParamsValues(listParams, userGroupListParams);

			const {limit, offset, sortBy, sortDir} = listParams;
			const where = { type: {[Op.in]: types}, isDeleted: false };
			const user = await app.ms.database.getUser(userId) as any;
			// TODO: use query object instead of types
			return {
				list: await user.getMemberInGroups({
					where,
					include: [ {association: 'avatarImage'}, {association: 'coverImage'} ],
					order: getStableGroupListOrder(sortBy, sortDir),
					limit,
					offset
				}),
				total: await user.countMemberInGroups({where})
			};
		}

		async getAdminInGroups(userId, types, listParams?: IListParams) {
			listParams = helpers.prepareListParams(listParams, userGroupListParams);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			app.ms.database.setDefaultListParamsValues(listParams, userGroupListParams);

			const {limit, offset, sortBy, sortDir} = listParams;
			const where = { type: {[Op.in]: types}, isDeleted: false };
			const user = await app.ms.database.getUser(userId) as any;
			// TODO: use query object instead of types
			return {
				list: await user.getAdministratorInGroups({
					where,
					include: [ {association: 'avatarImage'}, {association: 'coverImage'} ],
					order: getStableGroupListOrder(sortBy, sortDir),
					limit,
					offset
				}),
				total: await user.countAdministratorInGroups({where})
			};
		}

		async getPersonalChatGroups(userId, listParams?: IListParams) {
			listParams = helpers.prepareListParams(listParams, userGroupListParams);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			app.ms.database.setDefaultListParamsValues(listParams, userGroupListParams);

			const {limit, offset, sortBy, sortDir} = listParams;
			const where = {creatorId: userId, type: GroupType.PersonalChat, isDeleted: false};
			return {
				list: await models.Group.findAll({
					where,
					order: getStableGroupListOrder(sortBy, sortDir),
					limit,
					offset
				}) as IGroup[],
				total: await models.Group.count({where})
			};
		}

		async getAllGroupList(adminId, searchString?, listParams?: IListParams) {
			listParams = helpers.prepareListParams(listParams, adminGroupListParams);
			await app.checkUserCan(adminId, CorePermissionName.AdminRead);

			app.ms.database.setDefaultListParamsValues(listParams, adminGroupListParams);
			const {sortBy, sortDir, limit, offset} = listParams;
			return {
				list: await models.Group.findAll({
					where: this.getAllGroupWhere(searchString),
					order: getStableGroupListOrder(sortBy, sortDir),
					limit,
					offset
				}),
				total: await this.getAllGroupCount(searchString)
			};
		}

		async getGroup(id) {
			return models.Group.findOne({
				where: {id},
				include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
			}) as IGroup;
		}

		async getGroupWhereStaticOutdated(outdatedForSeconds, options: any = {}) {
			const limit = helpers.parsePositiveInteger(options.limit, staticRebindBatchLimit);
			return models.Group.findAll({
				where: {
					staticStorageUpdatedAt: {
						[Op.lt]: commonHelper.moveDate(-parseFloat(outdatedForSeconds), 'second')
					},
					isDeleted: false
				},
				order: [['staticStorageUpdatedAt', 'ASC'], ['id', 'ASC']],
				limit
			});
		}

		async getRemoteGroups() {
			return models.Group.findAll({ where: { isRemote: true, isDeleted: false } });
		}

		async addGroup(group) {
			return models.Group.create(group);
		}

		async updateGroupPure(id, updateData) {
			return models.Group.update(updateData, {where: {id}});
		}

		async addMemberToGroupPure(userId, groupId) {
			return (await this.getGroup(groupId)).addMembers([await app.ms.database.getUser(userId)]);
		}

		async setMembersToGroup(userIds, groupId) {
			return (await this.getGroup(groupId)).setMembers(userIds);
		}

		async addAdminToGroupPure(userId, groupId) {
			return (await this.getGroup(groupId)).addAdministrators([await app.ms.database.getUser(userId)]);
		}

		async setAdminsToGroup(userIds, groupId) {
			return (await this.getGroup(groupId)).setAdministrators(userIds);
		}

		async isAdminInGroupPure(userId, groupId) {
			const result = await (await app.ms.database.getUser(userId) as any).getAdministratorInGroups({ where: {id: groupId} });
			return result.length > 0;
		}

		async isMemberInGroupPure(userId, groupId) {
			const result = await (await app.ms.database.getUser(userId) as any).getMemberInGroups({ where: {id: groupId} });
			return result.length > 0;
		}

		async getCreatorInGroupsByType(creatorId, type: GroupType) {
			return models.Group.findAll({ where: {creatorId, type, isDeleted: false} }) as IGroup[];
		}

		getPostsWhere(filters) {
			const where: any = {
				isDeleted: false
			};
			// C1: default to Published-only visibility. Admin/editor callers must pass
			// `includeAllStatuses: true`, an explicit `status`, or a `statusIn` list to see drafts.
			const statusOverride = !isUndefined(filters.status) || !isUndefined(filters.statusNe) || filters.statusIn;
			if (!filters.includeAllStatuses && !statusOverride) {
				where['status'] = PostStatus.Published;
			}
			// D8 keyset cursor: forward-scan by (publishedAt DESC, id DESC).
			helpers.addCursorWhere(where, filters);
			helpers.addCursorWhere(where, filters, {
				cursorValueFilter: 'publishedAfterCursorAt',
				cursorIdFilter: 'publishedAfterCursorId',
				direction: 'after'
			});
			[
				'id',
				'status',
				'type',
				'replyToId',
				'repostOfId',
				'name',
				'groupId',
				'isDeleted',
				'source',
				'sourceChannelId',
				'sourcePostId'
			].forEach((name) => {
				if(filters[name] === 'null') {
					filters[name] = null;
				}
				if(filters[name + 'Ne'] === 'null') {
					filters[name + 'Ne'] = null;
				}
				if(!isUndefined(filters[name])) {
					where[name] = filters[name];
				}
				if(!isUndefined(filters[name + 'Ne'])) {
					where[name] = {[Op.ne]: filters[name + 'Ne']};
				}
			});
			if (filters.statusIn) {
				where['status'] = {[Op.in]: filters.statusIn};
			}
			['publishedAt', 'updatedAt', 'id'].forEach(field => {
				['Gt', 'Gte', 'Lt', 'Lte'].forEach((postfix) => {
					if (filters[field + postfix]) {
						if(!where[field]) {
							where[field] = {};
						}
						where[field][Op[postfix.toLowerCase()]] = filters[field + postfix];
					}
				});
			});
			log('getPostsWhere', where);
			return where;
		}

		getGroupPostsWhere(groupId, filters) {
			return {
				groupId,
				...this.getPostsWhere(filters)
			};
		}

		public getGroupPostPath(posId) {
			const rootDiv = 10000, subDiv = 100;
			return `${Math.floor(posId / rootDiv)}/${Math.floor((posId % rootDiv) / subDiv)}/${posId}`;
		}

		public getFullGroupPostPath(staticStorageGroupId, postId) {
			return `/${staticStorageGroupId}/${this.getGroupPostPath(postId)}/`;
		}

		public async makePostStorageDir(group: IGroup, post: IPost) {
			const path = this.getFullGroupPostPath(group.staticStorageId, post.localId);
			log('makePostStorageDir', path);
			await app.ms.storage.makeDir(path);
			return path;
		}

		public async makePostDirectoryWithContents(postId) {
			log('makePostDirectoryWithContents');
			const post = await this.getPostPure(postId);
			const postManifest = await app.ms.storage.getObject(post.manifestStorageId);
			postManifest.contentsById = {};
			const path = await this.makePostStorageDir(post.group, post);
			await pIteration.forEach(post.contents, async (c: IContent, index) => {
				const [contentManifest] = await Promise.all([
					app.ms.storage.getObject(c.manifestStorageId),
					app.ms.storage.copyFileFromId(c.storageId, path + index),
				]);
				postManifest.contentsById[c.manifestStorageId] = contentManifest;
			});
			const postManifestStorageId = await app.ms.storage.saveFileByData(JSON.stringify(postManifest)).then(c => c.id);
			await app.ms.storage.copyFileFromId(postManifestStorageId, path + 'manifest.json');
			return app.ms.storage.getDirectoryId(path);
		}

		async getGroupPostsCount(groupId, filters = {}) {
			return models.Post.count({ where: this.getGroupPostsWhere(groupId, filters) });
		}

		async getAllPosts(filters = {}, listParams: IListParams = {}) {
			const pagePosts = await this.getAllPostRefs(filters, listParams, {
				attributes: ['id', 'publishedAt']
			});
			return this.getHydratedPostListByIds(pagePosts.map(post => post.id));
		}

		async getAllPostRefs(filters = {}, listParams: IListParams = {}, options: any = {}) {
			listParams = helpers.prepareListParams(listParams, options.defaultListParams || allPostListParams);
			app.ms.database.setDefaultListParamsValues(listParams, options.defaultListParams || allPostListParams);
			const {limit, offset, sortBy, sortDir} = listParams;
			const cursorOptions = options.cursor || {};
			const cursor = helpers.getListCursorState(filters, cursorOptions);
			const where = this.getPostsWhere(filters);
			if (options.cursor) {
				helpers.addCursorWhere(where, filters, options.cursor);
			}

			return models.Post.findAll({
				attributes: helpers.getCursorListAttributes(options.attributes || ['id', 'publishedAt'], cursor, sortBy),
				where,
				order: helpers.getCursorListOrder(cursor, {sortBy, sortDir}),
				limit,
				offset: helpers.getCursorListOffset(cursor, offset),
				transaction: options.transaction
			}) as IPost[];
		}

		async forEachAllPostRefBatch(options: any = {}, onBatch) {
			const maxRefs = isUndefined(options.maxRefs) ? Number.MAX_SAFE_INTEGER : options.maxRefs;
			const batchLimit = isUndefined(options.batchLimit) ? 100 : options.batchLimit;
			const listParams = options.listParams || {};
			let filters = {...(options.filters || {})};
			let processedRefs = 0;

			while (processedRefs < maxRefs) {
				const limit = Math.min(batchLimit, maxRefs - processedRefs);
				const postRefs = await this.getAllPostRefs(filters, {
					...listParams,
					limit,
					offset: 0
				}, options);
				const refCount = postRefs.length;
				const nextCursor = helpers.getNextCursorFromRows(postRefs, limit, options.cursor);
				const batch = {
					postRefs,
					refCount,
					nextCursor
				};
				if (!batch.refCount) {
					break;
				}
				processedRefs += batch.refCount;
				const shouldContinue = await onBatch(batch, {processedRefs});
				if (shouldContinue === false || !batch.nextCursor) {
					break;
				}
				filters = {
					...filters,
					...helpers.getCursorFiltersFromCursor(batch.nextCursor, options.cursor)
				};
			}

			return processedRefs;
		}

		async getAllPostsCount(filters = {}) {
			return models.Post.count({ where: this.getPostsWhere(filters) });
		}

		async getGroupSizeSum(id) {
			return (await models.Post.sum('size', {where: {groupId: id}})) || 0;
		}

		async getGroupByParams(params) {
			params = pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId', 'isCollateral']);

			params.isDeleted = false;
			return models.Group.findOne({
				where: params,
				include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
			}) as IGroup;
		}

		async getPostByParams(params) {
			params = pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId']);
			return models.Post.findOne({
				where: params,
				include: [{association: 'contents'}, {association: 'group'}],
			}).then((post: IPost) => {
				post.contents = orderBy(post.contents, [c => c.postsContents.position], ['asc']);
				return post;
			});
		}

		getGroupsWhere(filters) {
			const where = {};
			['name'].forEach((name) => {
				if(!isUndefined(filters[name])) {
					where[name] = filters[name];
				}
			});
			log('getGroupsWhere', where);
			return where;
		}

		async getPostPure(id) {
			const post = await models.Post.findOne({
				where: {id},
				include: [{association: 'contents'}, {association: 'group'}],
			});

			return this.orderPostContents(post);
		}

		async getPostsMetadata(postIds) {
			return models.Post.findAll({ where: {id: {[Op.in]: postIds}}}) as IPost[];
		}

		orderPostContents(post) {
			if (!post) {
				return post;
			}
			if (post.contents) {
				post.contents = orderBy(post.contents, [(content) => {
					return content.postsContents.position;
				}], ['asc']);
			}
			if (post.repostOf && post.repostOf.contents) {
				post.repostOf.contents = orderBy(post.repostOf.contents, [(content) => {
					return content.postsContents.position;
				}], ['asc']);
			}
			return post;
		}

		async getHydratedPostListByIds(postIds, options: {groupId?, includeGroup?, includeRepostOf?} = {}) {
			if (!postIds.length) {
				return [];
			}
			const where: any = {id: {[Op.in]: postIds}};
			if (!isUndefined(options.groupId)) {
				where.groupId = options.groupId;
			}
			const include: any[] = [{association: 'contents'}];
			if (options.includeGroup) {
				include.push({association: 'group'});
			}
			if (options.includeRepostOf) {
				include.push({association: 'repostOf', include: [{association: 'contents'}, {association: 'group'}]});
			}
			const posts = await models.Post.findAll({where, include});
			const postsById = new Map();
			for (const post of posts) {
				postsById.set(post.id, this.orderPostContents(post));
			}
			return postIds.map(id => postsById.get(id)).filter(post => !!post);
		}

		async getPostListByIdsPure(groupId, postIds) {
			return this.getHydratedPostListByIds(postIds, {groupId, includeGroup: true});
		}

		async getPostByManifestId(manifestStorageId) {
			const post = await models.Post.findOne({
				where: { manifestStorageId },
				include: [{association: 'contents'}]
			});

			post.contents = orderBy(post.contents, [(content) => {
				return content.postsContents.position;
			}], ['asc']);

			return post;
		}

		async getPostByGroupManifestIdAndLocalId(groupManifestStorageId, localId) {
			const group = await this.getGroupByManifestId(groupManifestStorageId, groupManifestStorageId);

			if(!group) {
				return null;
			}

			const post = await models.Post.findOne({
				where: { localId, groupId: group.id },
				include: [{association: 'contents'}]
			});

			post.contents = orderBy(post.contents, [(content) => {
				return content.postsContents.position;
			}], ['asc']);

			return post;
		}

		async addPost(post, options: any = {}) {
			return models.Post.create(post, {transaction: options.transaction});
		}

		async addPostEvent(postEvent, options: any = {}) {
			return models.PostEvent.create(postEvent, {transaction: options.transaction});
		}

		async addPostEvents(postEvents, options: any = {}) {
			const events = postEvents.filter(event => !!event);
			if (!events.length) {
				return [];
			}
			return models.PostEvent.bulkCreate(events, {transaction: options.transaction});
		}

		async updatePosts(ids, updateData, options: any = {}) {
			return models.Post.update(updateData, {where: {id: {[Op.in]: ids}}, transaction: options.transaction});
		}

		async clearPostLocalIds(ids, options: any = {}) {
			const postIds = helpers.normalizeUniqueIds(ids);
			if (!postIds.length) {
				return [0];
			}
			return models.Post.update({localId: null}, {
				where: {id: {[Op.in]: postIds}},
				transaction: options.transaction
			});
		}

		async setPostContents(postId, contents, options: any = {}) {
			// Targeted diff against PostsContents instead of the full DELETE+INSERT cycle that
			// Sequelize's auto-managed setContents would do. Closes the P2 finding "setPostContents
			// deletes and re-inserts the entire join on each edit". Position is part of the key so
			// reorder still produces delete+insert pairs (functionally equivalent to today), but
			// edits that change only one attachment now touch one row.
			const {transaction} = options;
			const desired: Array<{contentId: number; position: number; view: any}> = [];
			await pIteration.forEach(contents, async (content: IContent, position) => {
				const contentObj: any = await models.Content.findOne({where: {id: content.id, isDeleted: {[Op.ne]: true}}, transaction});
				if (!contentObj) {
					return;
				}
				desired.push({contentId: contentObj.id, position, view: content.view});
			});

			const existing = await models.PostsContents.findAll({where: {postId}, transaction});
			const keyOf = (r: any) => `${r.contentId}@${r.position}`;
			const existingByKey = new Map<string, any>();
			for (const row of existing) {
				existingByKey.set(keyOf(row), row);
			}
			const desiredKeys = new Set(desired.map(keyOf));

			const toDelete = existing.filter(r => !desiredKeys.has(keyOf(r)));
			const toInsert = desired.filter(d => !existingByKey.has(keyOf(d)));
			const toUpdate: Array<{contentId: any; view: any}> = [];
			for (const d of desired) {
				const existingRow = existingByKey.get(keyOf(d));
				if (existingRow && existingRow.view !== d.view) {
					toUpdate.push({contentId: existingRow.contentId, view: d.view});
				}
			}

			if (toDelete.length > 0) {
				await models.PostsContents.destroy({where: {postId, contentId: {[Op.in]: toDelete.map(r => r.contentId)}}, transaction});
			}
			if (toInsert.length > 0) {
				await models.PostsContents.bulkCreate(toInsert.map(d => ({postId, contentId: d.contentId, position: d.position, view: d.view})), {transaction});
			}
			return Promise.all(toUpdate.map(u => {
				return models.PostsContents.update({view: u.view}, {where: {postId, contentId: u.contentId}, transaction});
			}));
		}

		async getPostSizeSum(id) {
			const post = await this.getPostPure(id);
			return sumBy(post.contents, contentSize);
		}

		async addGroupPermission(userId, groupId, permissionName) {
			return models.GroupPermission.create({userId, groupId, name: permissionName});
		}

		async removeGroupPermission(userId, groupId, permissionName) {
			return models.GroupPermission.destroy({where: {userId, groupId, name: permissionName}})
		}

		async removeAllGroupPermission(userId, groupId) {
			return models.GroupPermission.destroy({where: {userId, groupId}})
		}

		async getGroupPermissions(userId, groupId) {
			return models.GroupPermission.findAll({where: {userId, groupId}})
		}

		async isHaveGroupPermission(userId, groupId, permissionName) {
			return models.GroupPermission.findOne({where: {userId, groupId, name: permissionName}}).then(r => !!r);
		}

		async getGroupRead(userId, groupId) {
			return models.GroupRead.findOne({where: {userId, groupId}}) as IGroupRead;
		}

		async addGroupRead(groupReadData) {
			return models.GroupRead.create(groupReadData);
		}

		async removeGroupRead(userId, groupId) {
			return models.GroupRead.destroy({where: {userId, groupId}})
		}

		async updateGroupRead(id, updateData) {
			return models.GroupRead.update(updateData, {where: {id}});
		}

		getAllGroupWhere(searchString?) {
			let where: any = {isDeleted: false};
			if (searchString) {
				where = {[Op.or]: [{name: searchString}, {title: searchString}]};
			}
			return where;
		}

		async getAllGroupCount(searchString?) {
			return models.Group.count({
				where: this.getAllGroupWhere(searchString)
			});
		}

		// async beforeContentAdding(userId, contentData, options) {
		//
		// }

		async flushDatabase() {
			await pIteration.forEachSeries([
				'ImageCompositionOperation', 'Mention', 'AutoTag', 'Tag', 'GroupRead', 'PostEvent', 'PostsContents', 'Post', 'GroupPermission',
				'GroupAdministrators', 'GroupMembers', 'Group'
			], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}

	return new GroupModule();
}
