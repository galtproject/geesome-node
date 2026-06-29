import {IGeesomeApp} from '../../interface.js';
import type {IContentData, IListParams} from '../database/interface.js';
import type {IGroup, IPost} from '../group/interface.js';
import {PostStatus} from '../group/interface.js';
import IGeesomeActivityPubModule, {
	IActivityPubInboundRequest,
	IActivityPubRemoteActorKeyResolver,
	IActivityPubSignRequestOptions,
	IResolvedActivityPubConfig
} from './interface.js';
import {
	buildActivityPubGroupWebFingerResponse,
	getActivityPubGroupActorUrls,
	getActivityPubGroupPreferredUsername,
	isActivityPubEnabled,
	normalizeActivityPubPostLocalId,
	resolveActivityPubConfig
} from './helpers.js';
import {
	buildActivityPubGroupActor,
	buildActivityPubOutboxCollection,
	buildActivityPubPostNote,
	isActivityPubGroupFederatable,
	isActivityPubPostFederatable
} from './serializers.js';
import {
	generateActivityPubRsaKeyPair,
	getActivityPubRequestSignatureInfo,
	signActivityPubRequestWithKey,
	verifyActivityPubRequestWithKey
} from './signatureHelpers.js';
import {getActivityPubRemoteActorKey} from './remoteActorCache.js';
import type {IActivityPubRemoteActorCacheOptions} from './remoteActorCache.js';

type IActivityPubModuleOptions = IActivityPubRemoteActorCacheOptions & {
	models?: any;
	resolveRemoteActorKey?: IActivityPubRemoteActorKeyResolver;
};

export default async (app: IGeesomeApp, options: any = {}) => {
	app.checkModules(['api', 'group', 'database']);
	const models = options.models || await (await import('./models.js')).default(app.ms.database.sequelize);
	const module = getModule(app, models, options);
	(await import('./api.js')).default(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models, options: IActivityPubModuleOptions): IGeesomeActivityPubModule {
	const resolveRemoteActorKey = options.resolveRemoteActorKey || ((input) => getActivityPubRemoteActorKey(models, input, options));

	class ActivityPubModule implements IGeesomeActivityPubModule {
		isEnabled(): boolean {
			return isActivityPubEnabled(app.config.activityPubConfig);
		}

		async getWebFingerResponse(resource: string) {
			const config = getResolvedActivityPubConfig(app);
			const {preferredUsername, domain} = parseWebFingerResource(resource);
			if (domain !== config.domain.toLowerCase()) {
				throwActivityPubNotFound();
			}

			const group = await getFederatableGroup(app, preferredUsername);
			return buildActivityPubGroupWebFingerResponse(config, group);
		}

		async getGroupActor(groupName: string) {
			const config = getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
			const actorGroup = await getGroupWithProjectedImages(app, group, config);

			return buildActivityPubGroupActor(config, actorGroup, {publicKeyPem: actorRecord.publicKeyPem});
		}

		async getGroupOutbox(groupName: string, listParams: IListParams = {}) {
			const config = getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const groupPosts = await app.ms.group.getGroupPosts(group.id, {
				status: PostStatus.Published,
				isDeleted: false
			}, {
				...listParams,
				includeTotal: false
			});
			const contentsByPostId = await getContentsByPostId(app, groupPosts.list, config);

			return buildActivityPubOutboxCollection(config, group, groupPosts.list, {contentsByPostId});
		}

		async getGroupPostNote(groupName: string, localId: number | string) {
			const config = getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const post = await getFederatablePostByLocalId(app, group, localId);
			const contents = await getPostContents(app, post, config);

			return buildActivityPubPostNote(config, group, post, {contents});
		}

		async getGroupActorKey(groupName: string) {
			const config = getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);

			return getActorKeyFromRecord(app, actorRecord);
		}

		async signGroupRequest(groupName: string, options: IActivityPubSignRequestOptions) {
			const actorKey = await this.getGroupActorKey(groupName);
			return signActivityPubRequestWithKey(actorKey, options);
		}

		async getRemoteActorKey(input: {keyId: string; actor?: string; activity?: any}) {
			return resolveRemoteActorKey(input);
		}

		async verifyGroupInboxRequest(groupName: string, request: IActivityPubInboundRequest) {
			const config = getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const verification = await verifyInboundRequest(resolveRemoteActorKey, request);

			return {
				...verification,
				localActorUrl: getActivityPubGroupActorUrls(config, group).actorUrl,
				activityType: getActivityType(request.body),
				actor: getActivityActor(request.body)
			};
		}

		async verifySharedInboxRequest(request: IActivityPubInboundRequest) {
			getResolvedActivityPubConfig(app);
			const verification = await verifyInboundRequest(resolveRemoteActorKey, request);

			return {
				...verification,
				activityType: getActivityType(request.body),
				actor: getActivityActor(request.body)
			};
		}

		async flushDatabase() {
			await models.ActivityPubActor.destroy({where: {}});
			await models.ActivityPubRemoteActor.destroy({where: {}});
		}
	}

	return new ActivityPubModule();
}

async function getFederatableGroup(app: IGeesomeApp, groupName: string): Promise<IGroup> {
	const preferredUsername = getPreferredUsernameForRoute(groupName);
	const group = await app.ms.group.getGroupByParams({name: preferredUsername});
	if (!isActivityPubGroupFederatable(group)) {
		throwActivityPubNotFound();
	}
	return group;
}

async function getGroupWithProjectedImages(app: IGeesomeApp, group: IGroup, config: IResolvedActivityPubConfig): Promise<IGroup> {
	const [avatarImage, coverImage] = await Promise.all([
		getContentDataWithUrl(app, group.avatarImage, config),
		getContentDataWithUrl(app, group.coverImage, config)
	]);

	return {
		...group,
		avatarImage: avatarImage || group.avatarImage,
		coverImage: coverImage || group.coverImage
	};
}

async function getFederatablePostByLocalId(app: IGeesomeApp, group: IGroup, localId: number | string): Promise<IPost> {
	const postLocalId = getPostLocalIdForRoute(localId);
	const postRefs = await app.ms.group.getGroupPostRefsByLocalIds(group.id, [postLocalId], {
		attributes: ['id', 'groupId', 'localId', 'publishedAt', 'status', 'isDeleted', 'isEncrypted']
	});
	const postRef = postRefs.find((post) => Number(post.localId) === Number(postLocalId));
	if (!postRef) {
		throwActivityPubNotFound();
	}

	const groupPosts = await app.ms.group.getGroupPosts(group.id, {
		id: postRef.id,
		status: PostStatus.Published,
		isDeleted: false
	}, {
		limit: 1,
		includeTotal: false
	});
	const post = groupPosts.list[0] || postRef;
	if (!isActivityPubPostFederatable(group, post)) {
		throwActivityPubNotFound();
	}
	return post;
}

async function getContentsByPostId(app: IGeesomeApp, posts: IPost[], config: IResolvedActivityPubConfig): Promise<Map<number, IContentData[]>> {
	const result = new Map<number, IContentData[]>();
	await Promise.all(posts.map(async (post) => {
		if (!post.id) {
			return;
		}
		result.set(post.id, await getPostContents(app, post, config));
	}));
	return result;
}

async function getPostContents(app: IGeesomeApp, post: IPost, config: IResolvedActivityPubConfig): Promise<IContentData[]> {
	return app.ms.group.getPostContentDataWithUrl(post, getContentBaseUrl(config));
}

async function getContentDataWithUrl(app: IGeesomeApp, content, config: IResolvedActivityPubConfig): Promise<IContentData | null> {
	if (!content) {
		return null;
	}
	return app.ms.group.prepareContentDataWithUrl(content, getContentBaseUrl(config), {
		includeText: false,
		includeJson: false
	});
}

async function verifyInboundRequest(resolveRemoteActorKey: IActivityPubRemoteActorKeyResolver, request: IActivityPubInboundRequest) {
	const body = getInboundRequestBody(request);
	const signatureInfo = getActivityPubRequestSignatureInfo({
		method: request.method,
		url: request.url,
		headers: request.headers,
		body,
		now: request.now,
		maxClockSkewMs: request.maxClockSkewMs
	});
	const actorKey = await resolveRemoteActorKey({
		keyId: signatureInfo.keyId,
		actor: getActivityActor(request.body),
		activity: request.body
	});
	if (!actorKey) {
		throwActivityPubError('activitypub_remote_actor_key_not_found', 401);
	}
	return verifyActivityPubRequestWithKey(actorKey, {
		method: request.method,
		url: request.url,
		headers: request.headers,
		body,
		now: request.now,
		maxClockSkewMs: request.maxClockSkewMs
	});
}

async function getOrCreateGroupActorRecord(app: IGeesomeApp, models, config: IResolvedActivityPubConfig, group: IGroup) {
	const actorData = getGroupActorRecordData(config, group);
	const existingActor = await getGroupActorRecord(models, group);
	if (existingActor) {
		return syncEnabledGroupActorRecord(existingActor, actorData);
	}

	const keyPair = generateActivityPubRsaKeyPair();
	const privateKeyPemEncrypted = await app.encryptTextWithAppPass(keyPair.privateKeyPem);
	try {
		return await models.ActivityPubActor.create({
			...actorData,
			publicKeyPem: keyPair.publicKeyPem,
			privateKeyPemEncrypted,
			isEnabled: true
		});
	} catch (e) {
		if (!isActivityPubActorUniqueError(e)) {
			throw e;
		}
		const createdActor = await getGroupActorRecord(models, group);
		if (!createdActor) {
			throw e;
		}
		return syncEnabledGroupActorRecord(createdActor, actorData);
	}
}

async function getActorKeyFromRecord(app: IGeesomeApp, actorRecord) {
	return {
		keyId: getActorKeyId(actorRecord),
		actorUrl: actorRecord.actorUrl,
		publicKeyPem: actorRecord.publicKeyPem,
		privateKeyPem: await app.decryptTextWithAppPass(actorRecord.privateKeyPemEncrypted)
	};
}

async function getGroupActorRecord(models, group: IGroup) {
	return models.ActivityPubActor.findOne({
		where: {
			entityType: 'group',
			entityId: group.id
		}
	});
}

async function syncEnabledGroupActorRecord(actorRecord, actorData) {
	if (actorRecord.isEnabled === false) {
		throwActivityPubNotFound();
	}
	return syncGroupActorRecord(actorRecord, actorData);
}

async function syncGroupActorRecord(actorRecord, actorData) {
	const updateData = getChangedActorData(actorRecord, actorData);
	if (!Object.keys(updateData).length) {
		return actorRecord;
	}
	await actorRecord.update(updateData);
	return actorRecord;
}

function getGroupActorRecordData(config: IResolvedActivityPubConfig, group: IGroup) {
	const urls = getActivityPubGroupActorUrls(config, group);
	return {
		entityType: 'group',
		entityId: group.id,
		preferredUsername: getActivityPubGroupPreferredUsername(group),
		actorUrl: urls.actorUrl,
		inboxUrl: urls.inboxUrl,
		outboxUrl: urls.outboxUrl,
		followersUrl: urls.followersUrl,
		followingUrl: urls.followingUrl
	};
}

function getChangedActorData(actorRecord, actorData) {
	const updateData = {};
	Object.keys(actorData).forEach((key) => {
		if (actorRecord[key] === actorData[key]) {
			return;
		}
		updateData[key] = actorData[key];
	});
	return updateData;
}

function getInboundRequestBody(request: IActivityPubInboundRequest): Buffer | string | undefined {
	if (request.rawBody) {
		return request.rawBody;
	}
	if (request.body === undefined || request.body === null) {
		return undefined;
	}
	if (typeof request.body === 'string' || Buffer.isBuffer(request.body)) {
		return request.body;
	}
	return JSON.stringify(request.body);
}

function getActivityType(activity): string | undefined {
	return typeof activity?.type === 'string' ? activity.type : undefined;
}

function getActivityActor(activity): string | undefined {
	if (typeof activity?.actor === 'string') {
		return activity.actor;
	}
	if (typeof activity?.actor?.id === 'string') {
		return activity.actor.id;
	}
	return undefined;
}

function parseWebFingerResource(resource: string) {
	const rawResource = String(resource || '').trim();
	const match = rawResource.match(/^acct:([^@]+)@([^@]+)$/);
	if (!match) {
		throwActivityPubNotFound();
	}

	return {
		preferredUsername: match[1],
		domain: match[2].toLowerCase()
	};
}

function getPreferredUsernameForRoute(groupName: string): string {
	try {
		return getActivityPubGroupPreferredUsername(groupName);
	} catch (e) {
		throwActivityPubNotFound();
	}
}

function getPostLocalIdForRoute(localId: number | string): string {
	try {
		return normalizeActivityPubPostLocalId(localId);
	} catch (e) {
		throwActivityPubNotFound();
	}
}

function getResolvedActivityPubConfig(app: IGeesomeApp): IResolvedActivityPubConfig {
	if (!isActivityPubEnabled(app.config.activityPubConfig)) {
		throwActivityPubNotFound();
	}
	return resolveActivityPubConfig(app.config.activityPubConfig);
}

function getContentBaseUrl(config: IResolvedActivityPubConfig): string {
	return `${config.publicUrl}/ipfs/`;
}

function isActivityPubActorUniqueError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function getActorKeyId(actorRecord): string {
	return `${actorRecord.actorUrl}#main-key`;
}

function throwActivityPubNotFound(): never {
	throwActivityPubError('activitypub_resource_not_found', 404);
}

function throwActivityPubError(message: string, code: number): never {
	const error = new Error(message) as Error & {code?: number};
	error.code = code;
	throw error;
}
