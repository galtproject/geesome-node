import {Op} from 'sequelize';
import {IGeesomeApp} from '../../interface.js';
import helpers from '../../helpers.js';
import {htmlToText, sanitizeAbsoluteHref, sanitizeHtml} from '../../htmlSafety.js';
import {RICH_TEXT_MIME_TYPE, htmlToRichText} from '../../richText.js';
import type {IContent, IContentData, IListParams} from '../database/interface.js';
import type {IGroup, IPost} from '../group/interface.js';
import {PostStatus} from '../group/interface.js';
import IGeesomeActivityPubModule, {
	ActivityPubFollowDirection,
	ActivityPubFlagState,
	ActivityPubFollowState,
	ActivityPubObjectOrigin,
	ActivityPubObjectReviewState,
	ActivityPubObjectVisibility,
	IActivityPubFlagReport,
	IActivityPubFlagReportFilters,
	IActivityPubFlagReportListResponse,
	IActivityPubRemoteObjectFilters,
	IActivityPubRemoteObjectListResponse,
	IActivityPubRemoteObjectPostCreateResult,
	IActivityPubRemoteObjectPostDraft,
	IActivityPubRemoteObjectPostDraftSource,
	IActivityPubRemoteObjectReport,
	IActivityPubRemoteObjectReviewStateInput,
	IActivityPubRemoteObjectPreview,
	IActivityPubInboxResult,
	IActivityPubInboundRequest,
	IActivityPubDeliveryProcessOptions,
	IActivityPubOutboundFollowOptions,
	IActivityPubOutboundFollowResult,
	IActivityPubRemoteActorKeyResolver,
	IActivityPubDeliveryRequestSender,
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
	buildActivityPubFollowersCollection,
	buildActivityPubFollowingCollection,
	buildActivityPubFollowActivity,
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
import {getActivityPubRemoteActorKey, getActivityPubRemoteActorRecord} from './remoteActorCache.js';
import type {IActivityPubRemoteActorCacheOptions} from './remoteActorCache.js';
import {
	recordInboundActivityPubBlock,
	recordInboundActivityPubFollow,
	recordInboundActivityPubFollowUndo,
	recordOutboundActivityPubFollow,
	recordOutboundActivityPubFollowResponse
} from './followState.js';
import {recordInboundActivityPubFlag} from './flagState.js';
import {
	enqueueActivityPubPostCreateDeliveries,
	enqueueActivityPubFollowDelivery,
	enqueueActivityPubFollowAcceptDelivery,
	processActivityPubDeliveryQueue
} from './deliveryState.js';
import {
	getLocalActivityPubObjectByObjectId,
	syncLocalPostActivityPubObject,
	syncRemoteActivityPubObject,
	tombstoneRemoteActivityPubObject,
	updateRemoteActivityPubObject
} from './objectState.js';
import {
	getActivityPubObjectReviewByObjectId,
	getActivityPubObjectReviewRecordsByObjectIds,
	getActivityPubObjectReviewState,
	getActivityPubObjectReviewStateObjectIdWhere,
	getRequiredActivityPubObjectReviewState,
	resetActivityPubObjectReviewState,
	setActivityPubObjectReviewState as setActivityPubObjectReviewStateRecord
} from './objectReviewState.js';

type IActivityPubModuleOptions = IActivityPubRemoteActorCacheOptions & {
	models?: any;
	resolveRemoteActorKey?: IActivityPubRemoteActorKeyResolver;
	deliverActivityPubRequest?: IActivityPubDeliveryRequestSender;
};

const activityPubFollowerListParams = {
	limit: 20,
	sortBy: 'acceptedAt',
	sortDir: 'DESC',
	allowedSortBy: ['acceptedAt', 'createdAt', 'updatedAt', 'id'],
	maxLimit: 100
};

const activityPubFlagReportListParams = {
	limit: 20,
	sortBy: 'createdAt',
	sortDir: 'DESC',
	allowedSortBy: ['createdAt', 'updatedAt', 'id', 'state'],
	maxLimit: 100
};

const activityPubRemoteObjectListParams = {
	limit: 20,
	sortBy: 'publishedAt',
	sortDir: 'DESC',
	allowedSortBy: ['publishedAt', 'createdAt', 'updatedAt', 'id', 'objectType', 'visibility'],
	maxLimit: 100
};
const maxActivityPubRemoteObjectPreviewRawHtmlLength = 50000;
const maxActivityPubRemoteObjectPreviewHtmlLength = 5000;
const maxActivityPubRemoteObjectPreviewTextLength = 1000;
const maxActivityPubRemoteObjectPreviewNameLength = 500;

export default async (app: IGeesomeApp, options: any = {}) => {
	app.checkModules(['api', 'group', 'database', 'content']);
	const models = options.models || await (await import('./models.js')).default(app.ms.database.sequelize);
	const module = getModule(app, models, options);
	(await import('./api.js')).default(app, module);
	(await import('./cron.js')).default(app, module);
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
			const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
			await syncLocalPostActivityPubObjects(models, {
				config,
				group,
				posts: groupPosts.list,
				contentsByPostId,
				localActorRecord: actorRecord
			});

			return buildActivityPubOutboxCollection(config, group, groupPosts.list, {contentsByPostId});
		}

		async getGroupFollowers(groupName: string, listParams: IListParams = {}) {
			const config = getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
			const followers = await getGroupFollowerActorUrls(app, models, actorRecord, listParams);

			return buildActivityPubFollowersCollection(config, group, followers.actorUrls, {
				totalItems: followers.total
			});
		}

		async getGroupFollowing(groupName: string, listParams: IListParams = {}) {
			const config = getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getGroupActorRecord(models, group);
			const following = actorRecord
				? await getGroupFollowingActorUrls(app, models, actorRecord, listParams)
				: getEmptyActorUrlPage();

			return buildActivityPubFollowingCollection(config, group, following.actorUrls, {
				totalItems: following.total
			});
		}

		async getGroupPostNote(groupName: string, localId: number | string) {
			const config = getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const post = await getFederatablePostByLocalId(app, group, localId);
			const contents = await getPostContents(app, post, config);
			const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
			const note = buildActivityPubPostNote(config, group, post, {contents});

			await syncLocalPostActivityPubObject(models, {
				config,
				group,
				post,
				contents,
				localActorRecord: actorRecord
			});
			return note;
		}

		async getGroupFlagReports(groupName: string, filters: IActivityPubFlagReportFilters = {}, listParams: IListParams = {}): Promise<IActivityPubFlagReportListResponse> {
			getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getGroupActorRecord(models, group);
			if (!actorRecord) {
				return getEmptyFlagReportList();
			}

			return getGroupFlagReportList(app, models, actorRecord, filters, listParams);
		}

		async getGroupRemoteObjects(groupName: string, filters: IActivityPubRemoteObjectFilters = {}, listParams: IListParams = {}): Promise<IActivityPubRemoteObjectListResponse> {
			getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getGroupActorRecord(models, group);
			if (!actorRecord) {
				return getEmptyRemoteObjectList();
			}

			return getGroupRemoteObjectList(app, models, actorRecord, filters, listParams);
		}

		async getGroupRemoteObject(groupName: string, remoteObjectId: number | string): Promise<IActivityPubRemoteObjectReport> {
			getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getGroupActorRecord(models, group);
			const object = actorRecord ? await getGroupRemoteObjectRecord(models, actorRecord, remoteObjectId) : null;
			if (!object) {
				throwActivityPubError('activitypub_remote_object_not_found', 404);
			}

			return getActivityPubRemoteObjectReportWithRemoteActor(models, object);
		}

		async getGroupRemoteObjectPostDraft(groupName: string, remoteObjectId: number | string): Promise<IActivityPubRemoteObjectPostDraft> {
			getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getGroupActorRecord(models, group);
			const objectRecord = actorRecord ? await getGroupRemoteObjectRecord(models, actorRecord, remoteObjectId) : null;
			if (!objectRecord) {
				throwActivityPubError('activitypub_remote_object_not_found', 404);
			}
			const remoteObject = await getActivityPubRemoteObjectReportWithRemoteActor(models, objectRecord);
			return getActivityPubRemoteObjectPostDraft(models, actorRecord, remoteObject);
		}

		async createGroupRemoteObjectPost(groupName: string, remoteObjectId: number | string, userId: number): Promise<IActivityPubRemoteObjectPostCreateResult> {
			getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getGroupActorRecord(models, group);
			const objectRecord = actorRecord ? await getGroupRemoteObjectRecord(models, actorRecord, remoteObjectId) : null;
			if (!objectRecord) {
				throwActivityPubError('activitypub_remote_object_not_found', 404);
			}
			const remoteObject = await getActivityPubRemoteObjectReportWithRemoteActor(models, objectRecord);
			const postDraft = await getActivityPubRemoteObjectPostDraft(models, actorRecord, remoteObject);
			assertActivityPubRemoteObjectPostDraftCreatable(postDraft);
			const content = await createActivityPubRemoteObjectPostContent(app, userId, postDraft);
			const post = await app.ms.group.createRemotePostByObject(userId, getActivityPubRemoteObjectPostData(group, remoteObject, postDraft, content));
			await updateActivityPubRemoteObjectLocalPostId(objectRecord, post);

			return {
				post,
				remoteObject: await getActivityPubRemoteObjectReportWithRemoteActor(models, objectRecord)
			};
		}

		async setGroupRemoteObjectReviewState(groupName: string, remoteObjectId: number | string, input: IActivityPubRemoteObjectReviewStateInput, reviewedByUserId?: number): Promise<IActivityPubRemoteObjectReport> {
			getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getGroupActorRecord(models, group);
			const object = actorRecord ? await getGroupRemoteObjectRecord(models, actorRecord, remoteObjectId) : null;
			if (!object) {
				throwActivityPubError('activitypub_remote_object_not_found', 404);
			}
			await setActivityPubObjectReviewStateRecord(models, {
				objectRecord: object,
				state: getRequiredActivityPubObjectReviewState(input?.state),
				reviewedByUserId
			});

			return getActivityPubRemoteObjectReportWithRemoteActor(models, object);
		}

		async setGroupFlagReportState(groupName: string, flagId: number | string, state: ActivityPubFlagState | string): Promise<IActivityPubFlagReport> {
			getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getGroupActorRecord(models, group);
			const flag = actorRecord ? await getGroupFlagReportRecord(models, actorRecord, flagId) : null;
			if (!flag) {
				throwActivityPubError('activitypub_flag_report_not_found', 404);
			}
			const reportState = getRequiredActivityPubFlagState(state);
			if (flag.state !== reportState) {
				await flag.update({state: reportState});
			}

			return getActivityPubFlagReportWithRemoteActor(models, flag);
		}

		async followRemoteActor(groupName: string, remoteActorUrl: string, followOptions: IActivityPubOutboundFollowOptions = {}): Promise<IActivityPubOutboundFollowResult> {
			const config = getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const localActorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
			const remoteActorRecord = await getActivityPubRemoteActorRecord(models, remoteActorUrl, options);
			const activity = buildActivityPubFollowActivity(config, group, remoteActorRecord.actorUrl, {
				activityId: getOutboundFollowActivityId(config, group, remoteActorRecord)
			});
			const follow = await recordOutboundActivityPubFollow(models, {
				localActorRecord,
				remoteActorRecord,
				activity,
				now: followOptions.now
			});
			const delivery = await enqueueActivityPubFollowDelivery(models, {
				localActorRecord,
				remoteActorRecord,
				followRecord: follow,
				followActivity: activity,
				now: followOptions.now
			});

			return getOutboundFollowResult(config, group, remoteActorRecord, follow, delivery);
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

		async processDeliveryQueue(processOptions: IActivityPubDeliveryProcessOptions = {}) {
			getResolvedActivityPubConfig(app);

			return processActivityPubDeliveryQueue(models, {
				...processOptions,
				deliverActivityPubRequest: processOptions.deliverActivityPubRequest || options.deliverActivityPubRequest,
				getActorKey: (actorRecord) => getActorKeyFromRecord(app, actorRecord)
			});
		}

		async afterPostManifestUpdate(_userId: number, postId: number) {
			if (!this.isEnabled()) {
				return getEmptyPostDeliveryResult();
			}
			const config = getResolvedActivityPubConfig(app);
			const post = await app.ms.group.getPostPure(postId);
			const group = post?.group;
			if (!isActivityPubPostFederatable(group, post)) {
				return getEmptyPostDeliveryResult();
			}
			const contents = await getPostContents(app, post, config);
			const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
			const objectRecord = await syncLocalPostActivityPubObject(models, {
				config,
				group,
				post,
				contents,
				localActorRecord: actorRecord
			});
			const deliveries = await enqueueActivityPubPostCreateDeliveries(models, {
				config,
				group,
				post,
				contents,
				localActorRecord: actorRecord
			});

			return {
				objectId: objectRecord?.id,
				queued: deliveries.length,
				deliveryIds: deliveries.map((delivery) => delivery.id)
			};
		}

		async handleGroupInboxRequest(groupName: string, request: IActivityPubInboundRequest): Promise<IActivityPubInboxResult> {
			const config = getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const localActorUrl = getActivityPubGroupActorUrls(config, group).actorUrl;
			const verification = await verifyInboundRequest(resolveRemoteActorKey, request);
			const remoteActorUrl = getRequiredActivityActor(request.body);

			assertSupportedInboxActivity(request.body);

			if (isFollowResponseActivity(request.body)) {
				const followActivity = getRequiredOutboundFollowResponseObject(request.body);
				assertOutboundFollowResponseObject(followActivity, localActorUrl, remoteActorUrl);
				const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
				const follow = await recordOutboundActivityPubFollowResponse(models, {
					localActorRecord: actorRecord,
					remoteActorUrl,
					activity: request.body,
					followActivityId: getOutboundFollowResponseObjectId(followActivity),
					state: getOutboundFollowResponseState(request.body),
					now: request.now
				});

				return getFollowResponseInboxResult(verification, follow, localActorUrl, remoteActorUrl, request.body);
			}
			if (isUndoActivity(request.body)) {
				const followActivity = getRequiredUndoFollowActivity(request.body);
				assertInboundFollowUndoObject(followActivity, remoteActorUrl, localActorUrl);
				const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
				const follow = await recordInboundActivityPubFollowUndo(models, {
					localActorRecord: actorRecord,
					remoteActorUrl,
					undoActivity: request.body,
					followActivity,
					now: request.now
				});

				return getFollowInboxResult(verification, follow, localActorUrl, remoteActorUrl, null, 'Undo');
			}
			if (isBlockActivity(request.body)) {
				assertInboundBlockObject(request.body, localActorUrl);
				const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
				const follow = await recordInboundActivityPubBlock(models, {
					localActorRecord: actorRecord,
					remoteActorUrl,
					activity: request.body,
					now: request.now
				});

				return getBlockInboxResult(verification, follow, localActorUrl, remoteActorUrl);
			}
			if (isFlagActivity(request.body)) {
				const flagTarget = await getRequiredInboundFlagTarget(models, request.body, localActorUrl);
				const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
				assertInboundFlagTargetActorMatches(flagTarget, actorRecord);
				const flag = await recordInboundActivityPubFlag(models, {
					localActorRecord: actorRecord,
					remoteActorUrl,
					activity: request.body,
					objectId: flagTarget.objectId
				});

				return getFlagInboxResult(verification, flag, localActorUrl, remoteActorUrl);
			}

			assertInboundFollowObject(request.body, localActorUrl);
			const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
			const follow = await recordInboundActivityPubFollow(models, {
				group,
				localActorRecord: actorRecord,
				remoteActorUrl,
				activity: request.body,
				now: request.now
			});
			const delivery = await enqueueActivityPubFollowAcceptDelivery(models, {
				config,
				group,
				localActorRecord: actorRecord,
				followRecord: follow,
				followActivity: request.body,
				now: request.now
			});

			return getFollowInboxResult(verification, follow, localActorUrl, remoteActorUrl, delivery);
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

		async handleSharedInboxRequest(request: IActivityPubInboundRequest): Promise<IActivityPubInboxResult> {
			getResolvedActivityPubConfig(app);
			const verification = await verifyInboundRequest(resolveRemoteActorKey, request);
			const remoteActorUrl = getRequiredActivityActor(request.body);
			const remoteActorRecord = await getRemoteActorRecordByActorUrl(models, remoteActorUrl);
			if (!remoteActorRecord) {
				throwActivityPubError('activitypub_remote_actor_required', 400);
			}
			if (isDeleteActivity(request.body)) {
				const objectRecord = await tombstoneRemoteActivityPubObject(models, {
					remoteActorRecord,
					activity: request.body
				});
				const localPostDeleted = await deleteActivityPubRemoteObjectPost(app, objectRecord);
				await resetActivityPubObjectReviewState(models, objectRecord);

				return getSharedInboxDeleteResult(verification, remoteActorUrl, objectRecord, localPostDeleted);
			}
			if (isUndoActivity(request.body)) {
				const object = getRequiredSharedInboxUndoCreateObject(request.body, remoteActorUrl);
				const objectRecord = await tombstoneRemoteActivityPubObject(models, {
					remoteActorRecord,
					activity: request.body,
					objectId: getRequiredObjectId(object, 'activitypub_undo_create_object_id_required'),
					objectNotFoundMessage: 'activitypub_undo_create_object_not_found',
					actorMismatchMessage: 'activitypub_undo_create_object_actor_mismatch'
				});
				const localPostDeleted = await deleteActivityPubRemoteObjectPost(app, objectRecord);
				await resetActivityPubObjectReviewState(models, objectRecord);

				return getSharedInboxUndoResult(verification, remoteActorUrl, objectRecord, localPostDeleted);
			}
			if (isUpdateActivity(request.body)) {
				const object = getRequiredSharedInboxUpdateObject(request.body);
				assertActivityPubObjectActorMatches(object, remoteActorUrl, 'activitypub_update_object_actor_mismatch');
				const objectRecord = await updateRemoteActivityPubObject(models, {
					remoteActorRecord,
					activity: request.body,
					object
				});
				await resetActivityPubObjectReviewState(models, objectRecord);

				return getSharedInboxUpdateResult(verification, remoteActorUrl, objectRecord);
			}
			const object = getRequiredSharedInboxCreateObject(request.body);
			const target = await getRequiredSharedInboxCreateTarget(models, request.body, object);
			assertActivityPubObjectActorMatches(object, remoteActorUrl);
			const objectRecord = await syncRemoteActivityPubObject(models, {
				remoteActorRecord,
				targetObjectRecord: target.objectRecord,
				localActorRecord: target.actorRecord,
				activity: request.body,
				object
			});

			return getSharedInboxCreateResult(verification, remoteActorUrl, objectRecord, target.inReplyTo);
		}

		async flushDatabase() {
			await models.ActivityPubDelivery.destroy({where: {}});
			await models.ActivityPubFlag.destroy({where: {}});
			await models.ActivityPubObjectReview.destroy({where: {}});
			await models.ActivityPubObject.destroy({where: {}});
			await models.ActivityPubFollow.destroy({where: {}});
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

async function syncLocalPostActivityPubObjects(models, options: {
	config: IResolvedActivityPubConfig;
	group: IGroup;
	posts: IPost[];
	contentsByPostId: Map<number, IContentData[]>;
	localActorRecord: any;
}) {
	await Promise.all(options.posts.map((post) => syncLocalPostActivityPubObject(models, {
		config: options.config,
		group: options.group,
		post,
		contents: getPostContentsFromMap(options.contentsByPostId, post),
		localActorRecord: options.localActorRecord
	})));
}

async function getPostContents(app: IGeesomeApp, post: IPost, config: IResolvedActivityPubConfig): Promise<IContentData[]> {
	return app.ms.group.getPostContentDataWithUrl(post, getContentBaseUrl(config));
}

function getPostContentsFromMap(contentsByPostId: Map<number, IContentData[]>, post: IPost): IContentData[] {
	if (!post?.id) {
		return [];
	}
	return contentsByPostId.get(post.id) || [];
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

async function getGroupFollowerActorUrls(app: IGeesomeApp, models, actorRecord, listParams: IListParams) {
	const preparedListParams = {
		...listParams
	};
	app.ms.database.setDefaultListParamsValues(preparedListParams, activityPubFollowerListParams);
	const followerPage = await models.ActivityPubFollow.findAndCountAll({
		where: {
			localActorId: actorRecord.id,
			direction: ActivityPubFollowDirection.Inbound,
			state: ActivityPubFollowState.Accepted
		},
		order: [[preparedListParams.sortBy, getListSortDirection(preparedListParams)]],
		limit: preparedListParams.limit,
		offset: preparedListParams.offset
	});
	const remoteActors = await getRemoteActorRecordsByIds(models, followerPage.rows.map((follow) => follow.remoteActorId));
	const actorUrlById = getRemoteActorUrlById(remoteActors);

	return {
		actorUrls: followerPage.rows.map((follow) => actorUrlById.get(Number(follow.remoteActorId))).filter(Boolean),
		total: getListPageCount(followerPage.count)
	};
}

async function getGroupFollowingActorUrls(app: IGeesomeApp, models, actorRecord, listParams: IListParams) {
	const preparedListParams = {
		...listParams
	};
	app.ms.database.setDefaultListParamsValues(preparedListParams, activityPubFollowerListParams);
	const followingPage = await models.ActivityPubFollow.findAndCountAll({
		where: {
			localActorId: actorRecord.id,
			direction: ActivityPubFollowDirection.Outbound,
			state: ActivityPubFollowState.Accepted
		},
		order: [[preparedListParams.sortBy, getListSortDirection(preparedListParams)]],
		limit: preparedListParams.limit,
		offset: preparedListParams.offset
	});
	const remoteActors = await getRemoteActorRecordsByIds(models, followingPage.rows.map((follow) => follow.remoteActorId));
	const actorUrlById = getRemoteActorUrlById(remoteActors);

	return {
		actorUrls: followingPage.rows.map((follow) => actorUrlById.get(Number(follow.remoteActorId))).filter(Boolean),
		total: getListPageCount(followingPage.count)
	};
}

async function getRemoteActorRecordsByIds(models, remoteActorIds) {
	const ids = helpers.normalizeUniqueIds(remoteActorIds);
	if (!ids.length) {
		return [];
	}
	return models.ActivityPubRemoteActor.findAll({
		where: {
			id: {
				[Op.in]: ids
			}
		}
	});
}

async function getRemoteActorRecordByActorUrl(models, actorUrl: string) {
	return models.ActivityPubRemoteActor.findOne({
		where: {
			actorUrl
		}
	});
}

function getRemoteActorUrlById(remoteActors) {
	return new Map(remoteActors.map((remoteActor) => [Number(remoteActor.id), remoteActor.actorUrl]));
}

async function getActivityPubFlagReportWithRemoteActor(models, flag): Promise<IActivityPubFlagReport> {
	const remoteActors = await getRemoteActorRecordsByIds(models, [flag.remoteActorId]);
	return getActivityPubFlagReport(flag, getRemoteActorById(remoteActors));
}

async function getGroupFlagReportList(app: IGeesomeApp, models, actorRecord, filters: IActivityPubFlagReportFilters, listParams: IListParams): Promise<IActivityPubFlagReportListResponse> {
	const preparedListParams = {
		...listParams
	};
	app.ms.database.setDefaultListParamsValues(preparedListParams, activityPubFlagReportListParams);
	const reportPage = await models.ActivityPubFlag.findAndCountAll({
		where: getActivityPubFlagReportWhere(actorRecord, filters),
		order: [[preparedListParams.sortBy, getListSortDirection(preparedListParams)]],
		limit: preparedListParams.limit,
		offset: preparedListParams.offset
	});
	const remoteActors = await getRemoteActorRecordsByIds(models, reportPage.rows.map((flag) => flag.remoteActorId));
	const remoteActorById = getRemoteActorById(remoteActors);

	return {
		list: reportPage.rows.map((flag) => getActivityPubFlagReport(flag, remoteActorById)),
		total: getListPageCount(reportPage.count)
	};
}

async function getGroupRemoteObjectList(app: IGeesomeApp, models, actorRecord, filters: IActivityPubRemoteObjectFilters, listParams: IListParams): Promise<IActivityPubRemoteObjectListResponse> {
	const preparedListParams = {
		...listParams
	};
	app.ms.database.setDefaultListParamsValues(preparedListParams, activityPubRemoteObjectListParams);
	const where = await getActivityPubRemoteObjectWhere(models, actorRecord, filters);
	const objectPage = await models.ActivityPubObject.findAndCountAll({
		where,
		order: [[preparedListParams.sortBy, getListSortDirection(preparedListParams)]],
		limit: preparedListParams.limit,
		offset: preparedListParams.offset
	});
	const remoteActors = await getRemoteActorRecordsByIds(models, objectPage.rows.map((object) => object.remoteActorId));
	const remoteActorById = getRemoteActorById(remoteActors);
	const reviews = await getActivityPubObjectReviewRecordsByObjectIds(models, objectPage.rows.map((object) => object.id));
	const reviewByObjectId = getActivityPubObjectReviewByObjectId(reviews);

	return {
		list: objectPage.rows.map((object) => getActivityPubRemoteObjectReport(object, remoteActorById, reviewByObjectId)),
		total: getListPageCount(objectPage.count)
	};
}

async function getGroupRemoteObjectRecord(models, actorRecord, remoteObjectId) {
	const id = helpers.normalizeUniqueIds(remoteObjectId)[0];
	if (!id) {
		return null;
	}
	return models.ActivityPubObject.findOne({
		where: {
			id,
			localActorId: actorRecord.id,
			origin: ActivityPubObjectOrigin.Remote
		}
	});
}

function getActivityPubFlagReportWhere(actorRecord, filters: IActivityPubFlagReportFilters = {}) {
	const where: any = {
		localActorId: actorRecord.id
	};
	if (isKnownActivityPubFlagState(filters.state)) {
		where.state = filters.state;
	}
	if (typeof filters.objectId === 'string' && filters.objectId) {
		where.objectId = filters.objectId;
	}
	const remoteActorId = helpers.normalizeUniqueIds(filters.remoteActorId)[0];
	if (remoteActorId) {
		where.remoteActorId = remoteActorId;
	}
	return where;
}

async function getActivityPubRemoteObjectWhere(models, actorRecord, filters: IActivityPubRemoteObjectFilters = {}) {
	const where: any = {
		localActorId: actorRecord.id,
		origin: ActivityPubObjectOrigin.Remote
	};
	if (typeof filters.objectId === 'string' && filters.objectId) {
		where.objectId = filters.objectId;
	}
	if (typeof filters.objectType === 'string' && filters.objectType) {
		where.objectType = filters.objectType;
	}
	if (isKnownActivityPubObjectVisibility(filters.visibility)) {
		where.visibility = filters.visibility;
	}
	const reviewStateObjectIdWhere = await getActivityPubObjectReviewStateObjectIdWhere(models, filters.reviewState);
	if (reviewStateObjectIdWhere) {
		where.id = reviewStateObjectIdWhere;
	}
	const remoteActorId = helpers.normalizeUniqueIds(filters.remoteActorId)[0];
	if (remoteActorId) {
		where.remoteActorId = remoteActorId;
	}
	return where;
}

async function getGroupFlagReportRecord(models, actorRecord, flagId) {
	const id = helpers.normalizeUniqueIds(flagId)[0];
	if (!id) {
		return null;
	}
	return models.ActivityPubFlag.findOne({
		where: {
			id,
			localActorId: actorRecord.id
		}
	});
}

function getActivityPubFlagReport(flag, remoteActorById: Map<number, any>): IActivityPubFlagReport {
	const remoteActor = remoteActorById.get(Number(flag.remoteActorId));

	return {
		id: flag.id,
		localActorId: flag.localActorId,
		remoteActorId: flag.remoteActorId,
		remoteActor: getActivityPubFlagRemoteActorReport(remoteActor),
		activityId: flag.activityId,
		objectId: flag.objectId,
		state: flag.state,
		activity: parseActivityPubFlagActivity(flag.rawActivityJson),
		createdAt: flag.createdAt,
		updatedAt: flag.updatedAt
	};
}

function getActivityPubRemoteObjectReport(object, remoteActorById: Map<number, any>, reviewByObjectId: Map<number, any>): IActivityPubRemoteObjectReport {
	const remoteActor = remoteActorById.get(Number(object.remoteActorId));
	const review = reviewByObjectId.get(Number(object.id));
	const parsedObject = parseActivityPubJson(object.rawJson);

	return {
		id: object.id,
		localActorId: object.localActorId,
		localPostId: object.localPostId,
		remoteActorId: object.remoteActorId,
		remoteActor: getActivityPubRemoteActorReport(remoteActor),
		remoteObjectUrl: object.remoteObjectUrl,
		activityId: object.activityId,
		objectId: object.objectId,
		objectType: object.objectType,
		visibility: object.visibility,
		reviewState: getActivityPubObjectReviewState(review),
		reviewedAt: review?.reviewedAt || undefined,
		reviewedByUserId: review?.reviewedByUserId || undefined,
		publishedAt: object.publishedAt,
		object: parsedObject,
		preview: getActivityPubRemoteObjectPreview(parsedObject),
		createdAt: object.createdAt,
		updatedAt: object.updatedAt
	};
}

async function getActivityPubRemoteObjectReportWithRemoteActor(models, object): Promise<IActivityPubRemoteObjectReport> {
	const [remoteActors, reviews] = await Promise.all([
		getRemoteActorRecordsByIds(models, [object.remoteActorId]),
		getActivityPubObjectReviewRecordsByObjectIds(models, [object.id])
	]);
	return getActivityPubRemoteObjectReport(object, getRemoteActorById(remoteActors), getActivityPubObjectReviewByObjectId(reviews));
}

async function getActivityPubRemoteObjectPostDraft(models, actorRecord, remoteObject: IActivityPubRemoteObjectReport): Promise<IActivityPubRemoteObjectPostDraft> {
	const preview = remoteObject.preview;
	const reasons = getActivityPubRemoteObjectPostDraftReasons(remoteObject);
	const draft: IActivityPubRemoteObjectPostDraft = {
		remoteObject,
		canCreatePost: reasons.length === 0,
		reasons,
		source: getActivityPubRemoteObjectPostDraftSource(remoteObject)
	};
	if (preview?.name) {
		draft.title = preview.name;
	}
	if (preview?.contentText) {
		draft.contentText = preview.contentText;
	}
	if (preview?.contentRichText) {
		draft.contentRichText = preview.contentRichText;
	}
	if (preview?.summaryText) {
		draft.summaryText = preview.summaryText;
	}
	const replyToPostId = await getActivityPubRemoteObjectReplyToPostId(models, actorRecord, remoteObject);
	if (replyToPostId) {
		draft.replyToPostId = replyToPostId;
	}
	return draft;
}

function assertActivityPubRemoteObjectPostDraftCreatable(postDraft: IActivityPubRemoteObjectPostDraft): void {
	if (postDraft.canCreatePost) {
		return;
	}
	throwActivityPubError(postDraft.reasons[0] || 'activitypub_remote_object_post_draft_not_ready', 400);
}

async function createActivityPubRemoteObjectPostContent(app: IGeesomeApp, userId: number, postDraft: IActivityPubRemoteObjectPostDraft): Promise<IContent> {
	return app.ms.content.saveData(
		userId,
		JSON.stringify(postDraft.contentRichText),
		getActivityPubRemoteObjectPostContentFileName(postDraft),
		{
			mimeType: RICH_TEXT_MIME_TYPE,
			properties: {
				source: 'activityPub',
				activityPub: postDraft.source
			}
		}
	);
}

function getActivityPubRemoteObjectPostData(group: IGroup, remoteObject: IActivityPubRemoteObjectReport, postDraft: IActivityPubRemoteObjectPostDraft, content: IContent) {
	const postData: any = {
		groupId: group.id,
		status: PostStatus.Published,
		source: 'activityPub',
		sourceChannelId: getActivityPubRemoteObjectPostSourceChannelId(remoteObject),
		sourcePostId: getActivityPubRemoteObjectPostSourcePostId(remoteObject),
		sourceDate: remoteObject.publishedAt || undefined,
		propertiesJson: JSON.stringify(getActivityPubRemoteObjectPostProperties(remoteObject, postDraft)),
		contents: [{id: content.id}]
	};
	if (postDraft.replyToPostId) {
		postData['replyToId'] = postDraft.replyToPostId;
	}
	return postData;
}

function getActivityPubRemoteObjectPostProperties(remoteObject: IActivityPubRemoteObjectReport, postDraft: IActivityPubRemoteObjectPostDraft) {
	const properties: any = {
		activityPub: postDraft.source
	};
	const sourceLink = getActivityPubRemoteObjectPostSourceLink(remoteObject);
	if (sourceLink) {
		properties.sourceLink = sourceLink;
	}
	if (postDraft.title) {
		properties.title = postDraft.title;
	}
	if (postDraft.summaryText) {
		properties.summaryText = postDraft.summaryText;
	}
	return properties;
}

function getActivityPubRemoteObjectPreview(object): IActivityPubRemoteObjectPreview | undefined {
	if (!object || typeof object !== 'object') {
		return undefined;
	}

	const preview: IActivityPubRemoteObjectPreview = {};
	const name = getActivityPubRemoteObjectTextField(object, 'name', maxActivityPubRemoteObjectPreviewNameLength);
	if (name) {
		preview.name = name;
	}

	const contentHtml = getActivityPubRemoteObjectHtmlField(object, 'content');
	if (contentHtml) {
		preview.contentHtml = contentHtml;
		preview.contentText = getActivityPubRemoteObjectPreviewText(contentHtml);
		preview.contentRichText = getActivityPubRemoteObjectContentRichText(object, contentHtml);
	}

	const summaryHtml = getActivityPubRemoteObjectHtmlField(object, 'summary');
	if (summaryHtml) {
		preview.summaryHtml = summaryHtml;
		preview.summaryText = getActivityPubRemoteObjectPreviewText(summaryHtml);
	}

	const url = getActivityPubRemoteObjectSafeUrl(object);
	if (url) {
		preview.url = url;
	}

	if (!Object.keys(preview).length) {
		return undefined;
	}
	return preview;
}

function getActivityPubRemoteObjectHtmlField(object, fieldName: string): string {
	const fieldValue = getActivityPubRemoteObjectStringValue(object[fieldName]);
	if (!fieldValue) {
		return '';
	}
	const boundedHtml = truncateActivityPubRemoteObjectPreview(fieldValue, maxActivityPubRemoteObjectPreviewRawHtmlLength);
	return truncateActivityPubRemoteObjectPreview(sanitizeHtml(boundedHtml), maxActivityPubRemoteObjectPreviewHtmlLength);
}

function getActivityPubRemoteObjectContentRichText(object, contentHtml: string) {
	return htmlToRichText(contentHtml, {
		source: getActivityPubRemoteObjectRichTextSource(object, 'content')
	});
}

function getActivityPubRemoteObjectRichTextSource(object, fieldName: string) {
	const source: any = {
		protocol: 'activitypub',
		field: fieldName
	};
	const objectId = getActivityPubRemoteObjectStringValue(object?.id);
	if (objectId) {
		source.objectId = objectId;
	}
	return source;
}

function getActivityPubRemoteObjectTextField(object, fieldName: string, maxLength: number): string {
	const fieldValue = getActivityPubRemoteObjectStringValue(object[fieldName]);
	if (!fieldValue) {
		return '';
	}
	return truncateActivityPubRemoteObjectPreview(htmlToText(fieldValue), maxLength);
}

function getActivityPubRemoteObjectPreviewText(html: string): string {
	return truncateActivityPubRemoteObjectPreview(htmlToText(html), maxActivityPubRemoteObjectPreviewTextLength);
}

function getActivityPubRemoteObjectStringValue(value): string {
	if (typeof value !== 'string') {
		return '';
	}
	return value.trim();
}

function getActivityPubRemoteObjectSafeUrl(object): string {
	const url = getActivityPubRemoteObjectUrlValue(object?.url);
	if (!url) {
		return '';
	}
	return sanitizeAbsoluteHref(url);
}

function getActivityPubRemoteObjectUrlValue(value): string {
	if (typeof value === 'string') {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(item => getActivityPubRemoteObjectUrlValue(item)).find(Boolean) || '';
	}
	if (value && typeof value === 'object' && typeof value.href === 'string') {
		return value.href;
	}
	return '';
}

function truncateActivityPubRemoteObjectPreview(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}
	return `${value.slice(0, maxLength)}...`;
}

function getActivityPubRemoteObjectPostDraftReasons(remoteObject: IActivityPubRemoteObjectReport): string[] {
	const reasons: string[] = [];
	if (remoteObject.localPostId) {
		reasons.push('activitypub_remote_object_post_exists');
	}
	if (remoteObject.reviewState !== ActivityPubObjectReviewState.Accepted) {
		reasons.push('activitypub_remote_object_review_not_accepted');
	}
	if (remoteObject.objectType !== 'Note') {
		reasons.push('activitypub_remote_object_not_note');
	}
	if (remoteObject.visibility !== ActivityPubObjectVisibility.Public) {
		reasons.push('activitypub_remote_object_visibility_not_public');
	}
	if (!hasActivityPubRemoteObjectDraftContent(remoteObject)) {
		reasons.push('activitypub_remote_object_content_missing');
	}
	return reasons;
}

function getActivityPubRemoteObjectPostDraftSource(remoteObject: IActivityPubRemoteObjectReport): IActivityPubRemoteObjectPostDraftSource {
	const source: IActivityPubRemoteObjectPostDraftSource = {
		protocol: 'activitypub',
		objectId: remoteObject.objectId
	};
	if (remoteObject.activityId) {
		source.activityId = remoteObject.activityId;
	}
	if (remoteObject.remoteObjectUrl) {
		source.remoteObjectUrl = remoteObject.remoteObjectUrl;
	}
	if (remoteObject.remoteActor?.actorUrl) {
		source.remoteActorUrl = remoteObject.remoteActor.actorUrl;
	}
	return source;
}

function hasActivityPubRemoteObjectDraftContent(remoteObject: IActivityPubRemoteObjectReport): boolean {
	const blocks = remoteObject.preview?.contentRichText?.blocks;
	return Array.isArray(blocks) && blocks.length > 0;
}

async function getActivityPubRemoteObjectReplyToPostId(models, actorRecord, remoteObject: IActivityPubRemoteObjectReport): Promise<number | undefined> {
	const replyToObjectId = getActivityPubRemoteObjectReplyToObjectId(remoteObject);
	if (!replyToObjectId || !actorRecord?.id) {
		return undefined;
	}
	const localObject = await getLocalActivityPubObjectByObjectId(models, replyToObjectId);
	if (!isActivityPubRemoteObjectReplyTarget(actorRecord, localObject)) {
		return undefined;
	}
	return Number(localObject.localPostId);
}

function getActivityPubRemoteObjectReplyToObjectId(remoteObject: IActivityPubRemoteObjectReport): string {
	return getActivityPubObjectReferenceId(remoteObject.object?.inReplyTo);
}

function getActivityPubObjectReferenceId(value): string {
	if (typeof value === 'string') {
		return value.trim();
	}
	if (value && typeof value === 'object' && typeof value.id === 'string') {
		return value.id.trim();
	}
	return '';
}

function isActivityPubRemoteObjectReplyTarget(actorRecord, localObject): boolean {
	const localPostId = Number(localObject?.localPostId || 0);
	return Number(localObject?.localActorId || 0) === Number(actorRecord.id)
		&& Number.isFinite(localPostId)
		&& localPostId > 0;
}

function getActivityPubRemoteObjectPostContentFileName(postDraft: IActivityPubRemoteObjectPostDraft): string {
	return `activitypub-remote-object-${postDraft.remoteObject.id || 'post'}.json`;
}

function getActivityPubRemoteObjectPostSourceChannelId(remoteObject: IActivityPubRemoteObjectReport): string {
	if (remoteObject.remoteActorId) {
		return `remoteActor:${remoteObject.remoteActorId}`;
	}
	return `localActor:${remoteObject.localActorId || 'unknown'}`;
}

function getActivityPubRemoteObjectPostSourcePostId(remoteObject: IActivityPubRemoteObjectReport): string {
	return `remoteObject:${remoteObject.id}`;
}

function getActivityPubRemoteObjectPostSourceLink(remoteObject: IActivityPubRemoteObjectReport): string {
	return remoteObject.preview?.url || remoteObject.remoteObjectUrl || remoteObject.objectId || '';
}

async function updateActivityPubRemoteObjectLocalPostId(objectRecord, post: IPost): Promise<void> {
	if (Number(objectRecord.localPostId || 0) === Number(post.id || 0)) {
		return;
	}
	await objectRecord.update({localPostId: post.id});
}

async function deleteActivityPubRemoteObjectPost(app: IGeesomeApp, objectRecord): Promise<boolean> {
	const postId = Number(objectRecord?.localPostId || 0);
	if (!Number.isFinite(postId) || postId <= 0) {
		return false;
	}
	const post = await app.ms.group.getPostPure(postId);
	if (!isActivityPubRemoteObjectImportedPost(objectRecord, post)) {
		return false;
	}
	await app.ms.group.deletePostsPure(post.userId || null, [postId]);
	return true;
}

function isActivityPubRemoteObjectImportedPost(objectRecord, post): boolean {
	if (!post || post.isDeleted === true) {
		return false;
	}
	return post.isRemote === true
		&& post.source === 'activityPub'
		&& post.sourceChannelId === getActivityPubRemoteObjectPostSourceChannelId(objectRecord)
		&& post.sourcePostId === getActivityPubRemoteObjectPostSourcePostId(objectRecord);
}

function getActivityPubFlagRemoteActorReport(remoteActor) {
	return getActivityPubRemoteActorReport(remoteActor);
}

function getActivityPubRemoteActorReport(remoteActor) {
	if (!remoteActor) {
		return undefined;
	}
	return {
		id: remoteActor.id,
		actorUrl: remoteActor.actorUrl,
		preferredUsername: remoteActor.preferredUsername,
		domain: remoteActor.domain,
		inboxUrl: remoteActor.inboxUrl,
		sharedInboxUrl: remoteActor.sharedInboxUrl
	};
}

function isKnownActivityPubObjectVisibility(visibility): visibility is ActivityPubObjectVisibility {
	return Object.values(ActivityPubObjectVisibility).includes(visibility);
}

function getRemoteActorById(remoteActors) {
	return new Map(remoteActors.map((remoteActor) => [Number(remoteActor.id), remoteActor]));
}

function isKnownActivityPubFlagState(state): state is ActivityPubFlagState {
	return Object.values(ActivityPubFlagState).includes(state);
}

function getRequiredActivityPubFlagState(state): ActivityPubFlagState {
	if (isKnownActivityPubFlagState(state)) {
		return state;
	}
	throwActivityPubError('activitypub_flag_state_invalid', 400);
}

function parseActivityPubFlagActivity(rawActivityJson: string) {
	return parseActivityPubJson(rawActivityJson);
}

function parseActivityPubJson(rawJson: string) {
	try {
		return JSON.parse(rawJson);
	} catch (e) {
		return null;
	}
}

function getEmptyFlagReportList(): IActivityPubFlagReportListResponse {
	return {
		list: [],
		total: 0
	};
}

function getEmptyRemoteObjectList(): IActivityPubRemoteObjectListResponse {
	return {
		list: [],
		total: 0
	};
}

function getEmptyActorUrlPage() {
	return {
		actorUrls: [],
		total: 0
	};
}

function getListPageCount(count): number {
	if (typeof count === 'number') {
		return count;
	}
	const parsed = Number(count);
	if (Number.isFinite(parsed)) {
		return parsed;
	}
	return 0;
}

function getEmptyPostDeliveryResult() {
	return {
		queued: 0,
		deliveryIds: []
	};
}

function getListSortDirection(listParams: IListParams): string {
	if (String(listParams.sortDir).toUpperCase() === 'ASC') {
		return 'ASC';
	}
	return 'DESC';
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

function getOutboundFollowActivityId(config: IResolvedActivityPubConfig, group: IGroup, remoteActorRecord): string {
	return `${getActivityPubGroupActorUrls(config, group).actorUrl}/activities/follows/${remoteActorRecord.id}`;
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

function isFollowActivity(activity): boolean {
	return getActivityType(activity) === 'Follow';
}

function isUndoActivity(activity): boolean {
	return getActivityType(activity) === 'Undo';
}

function isAcceptActivity(activity): boolean {
	return getActivityType(activity) === 'Accept';
}

function isRejectActivity(activity): boolean {
	return getActivityType(activity) === 'Reject';
}

function isFollowResponseActivity(activity): boolean {
	return isAcceptActivity(activity) || isRejectActivity(activity);
}

function isDeleteActivity(activity): boolean {
	return getActivityType(activity) === 'Delete';
}

function isUpdateActivity(activity): boolean {
	return getActivityType(activity) === 'Update';
}

function isBlockActivity(activity): boolean {
	return getActivityType(activity) === 'Block';
}

function isFlagActivity(activity): boolean {
	return getActivityType(activity) === 'Flag';
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

function getObjectActor(object): string | undefined {
	if (typeof object?.attributedTo === 'string') {
		return object.attributedTo;
	}
	if (typeof object?.attributedTo?.id === 'string') {
		return object.attributedTo.id;
	}
	if (typeof object?.actor === 'string') {
		return object.actor;
	}
	if (typeof object?.actor?.id === 'string') {
		return object.actor.id;
	}
	return undefined;
}

function getRequiredActivityActor(activity): string {
	const actor = getActivityActor(activity);
	if (actor) {
		return actor;
	}
	throwActivityPubError('activitypub_activity_actor_required', 400);
}

function assertSupportedInboxActivity(activity): void {
	if (
		isFollowActivity(activity)
		|| isFollowResponseActivity(activity)
		|| isUndoActivity(activity)
		|| isBlockActivity(activity)
		|| isFlagActivity(activity)
	) {
		return;
	}
	throwActivityPubError('activitypub_activity_not_supported', 501);
}

function getRequiredOutboundFollowResponseObject(activity) {
	if (!isFollowResponseActivity(activity)) {
		throwActivityPubError('activitypub_activity_not_supported', 501);
	}
	if (typeof activity?.object === 'string' && activity.object) {
		return activity.object;
	}
	if (!activity?.object || typeof activity.object !== 'object' || Array.isArray(activity.object)) {
		throwActivityPubError('activitypub_follow_response_object_required', 400);
	}
	if (!isFollowActivity(activity.object)) {
		throwActivityPubError('activitypub_follow_response_object_not_supported', 501);
	}
	return activity.object;
}

function getRequiredUndoFollowActivity(activity) {
	if (!isUndoActivity(activity)) {
		throwActivityPubError('activitypub_activity_not_supported', 501);
	}
	if (!activity?.object || typeof activity.object !== 'object' || Array.isArray(activity.object)) {
		throwActivityPubError('activitypub_undo_follow_object_required', 400);
	}
	if (!isFollowActivity(activity.object)) {
		throwActivityPubError('activitypub_undo_follow_object_not_supported', 501);
	}
	return activity.object;
}

function getRequiredSharedInboxCreateObject(activity) {
	if (getActivityType(activity) !== 'Create') {
		throwActivityPubError('activitypub_activity_not_supported', 501);
	}
	if (!activity?.object || typeof activity.object !== 'object' || Array.isArray(activity.object)) {
		throwActivityPubError('activitypub_create_object_required', 400);
	}
	if (activity.object.type !== 'Note') {
		throwActivityPubError('activitypub_create_object_not_supported', 501);
	}
	return activity.object;
}

function getRequiredSharedInboxUpdateObject(activity) {
	if (!isUpdateActivity(activity)) {
		throwActivityPubError('activitypub_activity_not_supported', 501);
	}
	if (!activity?.object || typeof activity.object !== 'object' || Array.isArray(activity.object)) {
		throwActivityPubError('activitypub_update_object_required', 400);
	}
	if (activity.object.type !== 'Note') {
		throwActivityPubError('activitypub_update_object_not_supported', 501);
	}
	return activity.object;
}

async function getRequiredSharedInboxCreateTarget(models, activity, object) {
	const inReplyTo = getActivityObjectInReplyTo(object);
	if (inReplyTo) {
		const objectRecord = await getLocalActivityPubObjectByObjectId(models, inReplyTo);
		if (objectRecord) {
			return {
				objectRecord,
				inReplyTo
			};
		}
	}
	const actorRecord = await getLocalActivityPubActorByUrls(models, getSharedInboxCreateTargetActorUrls(activity, object));
	if (actorRecord) {
		return {
			actorRecord,
			inReplyTo
		};
	}
	throwActivityPubError('activitypub_object_target_not_found', 404);
}

function getRequiredSharedInboxUndoCreateObject(activity, remoteActorUrl: string) {
	const createActivity = getRequiredSharedInboxUndoCreateActivity(activity);
	if (getActivityActor(createActivity) !== remoteActorUrl) {
		throwActivityPubError('activitypub_undo_create_actor_mismatch', 400);
	}
	const object = getRequiredSharedInboxCreateObject(createActivity);
	assertActivityPubObjectActorMatches(object, remoteActorUrl);
	return object;
}

function getRequiredSharedInboxUndoCreateActivity(activity) {
	if (!isUndoActivity(activity)) {
		throwActivityPubError('activitypub_activity_not_supported', 501);
	}
	if (!activity?.object || typeof activity.object !== 'object' || Array.isArray(activity.object)) {
		throwActivityPubError('activitypub_undo_object_required', 400);
	}
	if (getActivityType(activity.object) !== 'Create') {
		throwActivityPubError('activitypub_undo_object_not_supported', 501);
	}
	return activity.object;
}

function getActivityObjectInReplyTo(object): string | undefined {
	if (typeof object?.inReplyTo === 'string' && object.inReplyTo) {
		return object.inReplyTo;
	}
	if (typeof object?.inReplyTo?.id === 'string' && object.inReplyTo.id) {
		return object.inReplyTo.id;
	}
	return undefined;
}

function getRequiredObjectId(object, message: string): string {
	if (typeof object?.id === 'string' && object.id) {
		return object.id;
	}
	throwActivityPubError(message, 400);
}

function assertActivityPubObjectActorMatches(object, remoteActorUrl: string, message = 'activitypub_create_object_actor_mismatch'): void {
	const objectActor = getObjectActor(object);
	if (!objectActor || objectActor === remoteActorUrl) {
		return;
	}
	throwActivityPubError(message, 400);
}

function assertInboundFollowUndoObject(followActivity, remoteActorUrl: string, localActorUrl: string): void {
	if (getActivityActor(followActivity) !== remoteActorUrl) {
		throwActivityPubError('activitypub_undo_follow_actor_mismatch', 400);
	}
	assertInboundFollowObject(followActivity, localActorUrl);
}

function assertOutboundFollowResponseObject(followActivity, localActorUrl: string, remoteActorUrl: string): void {
	if (typeof followActivity === 'string') {
		return;
	}
	if (getActivityActor(followActivity) !== localActorUrl) {
		throwActivityPubError('activitypub_follow_response_actor_mismatch', 400);
	}
	if (getActivityObjectId(followActivity) !== remoteActorUrl) {
		throwActivityPubError('activitypub_follow_response_object_mismatch', 400);
	}
}

function assertInboundFollowObject(activity, localActorUrl: string): void {
	if (getActivityObjectId(activity) === localActorUrl) {
		return;
	}
	throwActivityPubError('activitypub_follow_object_mismatch', 400);
}

function assertInboundBlockObject(activity, localActorUrl: string): void {
	if (getActivityObjectId(activity) === localActorUrl) {
		return;
	}
	throwActivityPubError('activitypub_block_object_mismatch', 400);
}

async function getRequiredInboundFlagTarget(models, activity, localActorUrl: string) {
	const objectIds = getInboundFlagObjectIds(activity);
	if (!objectIds.length) {
		throwActivityPubError('activitypub_flag_object_required', 400);
	}
	if (objectIds.includes(localActorUrl)) {
		return {
			objectId: localActorUrl,
			localActorId: null
		};
	}
	for (const objectId of objectIds) {
		const objectRecord = await getLocalActivityPubObjectByObjectId(models, objectId);
		if (objectRecord) {
			return {
				objectId: objectRecord.objectId,
				localActorId: objectRecord.localActorId
			};
		}
	}
	throwActivityPubError('activitypub_flag_object_mismatch', 400);
}

async function getLocalActivityPubActorByUrls(models, actorUrls: string[]) {
	if (!actorUrls.length) {
		return null;
	}
	return models.ActivityPubActor.findOne({
		where: {
			entityType: 'group',
			isEnabled: true,
			actorUrl: {
				[Op.in]: actorUrls
			}
		}
	});
}

function getSharedInboxCreateTargetActorUrls(activity, object): string[] {
	const actorUrls = [
		...getActivityReferenceIds(activity?.to),
		...getActivityReferenceIds(activity?.cc),
		...getActivityReferenceIds(activity?.target),
		...getActivityReferenceIds(object?.to),
		...getActivityReferenceIds(object?.cc),
		...getActivityReferenceIds(object?.tag),
		...getActivityHrefReferenceIds(object?.tag)
	];

	return [...new Set(actorUrls)];
}

function assertInboundFlagTargetActorMatches(flagTarget, localActorRecord): void {
	if (flagTarget.localActorId === null || Number(flagTarget.localActorId) === Number(localActorRecord.id)) {
		return;
	}
	throwActivityPubError('activitypub_flag_object_mismatch', 400);
}

function getActivityObjectId(activity): string | undefined {
	if (typeof activity?.object === 'string') {
		return activity.object;
	}
	if (typeof activity?.object?.id === 'string') {
		return activity.object.id;
	}
	return undefined;
}

function getOutboundFollowResponseObjectId(followActivity): string | undefined {
	if (typeof followActivity === 'string' && followActivity) {
		return followActivity;
	}
	if (typeof followActivity?.id === 'string' && followActivity.id) {
		return followActivity.id;
	}
	return undefined;
}

function getOutboundFollowResponseState(activity): ActivityPubFollowState.Accepted | ActivityPubFollowState.Rejected {
	if (isAcceptActivity(activity)) {
		return ActivityPubFollowState.Accepted;
	}
	return ActivityPubFollowState.Rejected;
}

function getInboundFlagObjectIds(activity): string[] {
	const objectIds = [
		...getActivityReferenceIds(activity?.object),
		...getActivityReferenceIds(activity?.target)
	];

	return [...new Set(objectIds)];
}

function getActivityReferenceIds(value): string[] {
	if (typeof value === 'string' && value) {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.flatMap(item => getActivityReferenceIds(item));
	}
	if (typeof value?.id === 'string' && value.id) {
		return [value.id];
	}
	return [];
}

function getActivityHrefReferenceIds(value): string[] {
	if (Array.isArray(value)) {
		return value.flatMap(item => getActivityHrefReferenceIds(item));
	}
	if (typeof value?.href === 'string' && value.href) {
		return [value.href];
	}
	return [];
}

function getFollowInboxResult(verification, follow, localActorUrl: string, remoteActorUrl: string, delivery, activityType = 'Follow'): IActivityPubInboxResult {
	const accepted = follow.state === ActivityPubFollowState.Accepted;

	return {
		...verification,
		ok: true,
		accepted,
		message: getFollowInboxMessage(follow),
		localActorUrl,
		activityType,
		actor: remoteActorUrl,
		followId: follow.id,
		followState: follow.state,
		deliveryId: delivery?.id
	};
}

function getFollowInboxMessage(follow): string {
	if (follow.state === ActivityPubFollowState.Pending) {
		return 'activitypub_follow_pending';
	}
	if (follow.state === ActivityPubFollowState.Cancelled) {
		return 'activitypub_follow_cancelled';
	}
	return 'activitypub_follow_accepted';
}

function getFollowResponseInboxResult(verification, follow, localActorUrl: string, remoteActorUrl: string, activity): IActivityPubInboxResult {
	return {
		...verification,
		ok: true,
		accepted: follow.state === ActivityPubFollowState.Accepted,
		message: getFollowResponseInboxMessage(follow),
		localActorUrl,
		activityType: getActivityType(activity),
		actor: remoteActorUrl,
		followId: follow.id,
		followState: follow.state
	};
}

function getFollowResponseInboxMessage(follow): string {
	if (follow.state === ActivityPubFollowState.Accepted) {
		return 'activitypub_outbound_follow_accepted';
	}
	return 'activitypub_outbound_follow_rejected';
}

function getOutboundFollowResult(
	config: IResolvedActivityPubConfig,
	group: IGroup,
	remoteActorRecord,
	follow,
	delivery
): IActivityPubOutboundFollowResult {
	return {
		ok: true,
		message: 'activitypub_follow_delivery_queued',
		localActorUrl: getActivityPubGroupActorUrls(config, group).actorUrl,
		remoteActorUrl: remoteActorRecord.actorUrl,
		followId: follow.id,
		followState: follow.state,
		deliveryId: delivery?.id
	};
}

function getBlockInboxResult(verification, follow, localActorUrl: string, remoteActorUrl: string): IActivityPubInboxResult {
	return {
		...verification,
		ok: true,
		accepted: true,
		message: 'activitypub_block_accepted',
		localActorUrl,
		activityType: 'Block',
		actor: remoteActorUrl,
		followId: follow.id,
		followState: follow.state
	};
}

function getFlagInboxResult(verification, flag, localActorUrl: string, remoteActorUrl: string): IActivityPubInboxResult {
	return {
		...verification,
		ok: true,
		accepted: true,
		message: 'activitypub_flag_recorded',
		localActorUrl,
		activityType: 'Flag',
		actor: remoteActorUrl,
		flagId: flag.id,
		flagState: flag.state,
		objectId: flag.objectId
	};
}

function getSharedInboxCreateResult(verification, remoteActorUrl: string, objectRecord, inReplyTo?: string): IActivityPubInboxResult {
	return {
		...verification,
		ok: true,
		accepted: true,
		message: 'activitypub_create_object_recorded',
		activityType: 'Create',
		actor: remoteActorUrl,
		activityPubObjectId: objectRecord.id,
		objectId: objectRecord.objectId,
		inReplyTo
	};
}

function getSharedInboxDeleteResult(verification, remoteActorUrl: string, objectRecord, localPostDeleted: boolean): IActivityPubInboxResult {
	return {
		...verification,
		ok: true,
		accepted: true,
		message: 'activitypub_delete_object_tombstoned',
		activityType: 'Delete',
		actor: remoteActorUrl,
		activityPubObjectId: objectRecord.id,
		objectId: objectRecord.objectId,
		localPostDeleted
	};
}

function getSharedInboxUndoResult(verification, remoteActorUrl: string, objectRecord, localPostDeleted: boolean): IActivityPubInboxResult {
	return {
		...verification,
		ok: true,
		accepted: true,
		message: 'activitypub_undo_create_object_tombstoned',
		activityType: 'Undo',
		actor: remoteActorUrl,
		activityPubObjectId: objectRecord.id,
		objectId: objectRecord.objectId,
		localPostDeleted
	};
}

function getSharedInboxUpdateResult(verification, remoteActorUrl: string, objectRecord): IActivityPubInboxResult {
	return {
		...verification,
		ok: true,
		accepted: true,
		message: 'activitypub_update_object_recorded',
		activityType: 'Update',
		actor: remoteActorUrl,
		activityPubObjectId: objectRecord.id,
		objectId: objectRecord.objectId
	};
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
