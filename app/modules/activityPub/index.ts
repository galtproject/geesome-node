import {Op} from 'sequelize';
import {IGeesomeApp} from '../../interface.js';
import helpers from '../../helpers.js';
import {htmlToText, sanitizeAbsoluteHref, sanitizeHtml} from '../../htmlSafety.js';
import {RICH_TEXT_MIME_TYPE, htmlToRichText} from '../../richText.js';
import {ContentView} from '../database/interface.js';
import type {IContent, IContentData, IListParams} from '../database/interface.js';
import type {IGroup, IPost} from '../group/interface.js';
import {PostStatus} from '../group/interface.js';
import IGeesomeActivityPubModule, {
	ActivityPubRemoteAttachmentImportMode,
	ActivityPubFollowDirection,
	ActivityPubFlagState,
	ActivityPubFollowState,
	ActivityPubObjectOrigin,
	ActivityPubObjectReviewState,
	ActivityPubObjectVisibility,
	IActivityPubFlagReport,
	IActivityPubFlagReportFilters,
	IActivityPubFlagReportListResponse,
	IActivityPubFlagReportTarget,
	IActivityPubRemoteObjectFilters,
	IActivityPubRemoteObjectListResponse,
	IActivityPubRemoteObjectPostCreateResult,
	IActivityPubRemoteAttachmentBackup,
	IActivityPubRemoteAttachmentImportPolicy,
	IActivityPubRemoteObjectPostCreateOptions,
	IActivityPubRemoteObjectPostDraft,
	IActivityPubRemoteObjectPostDraftSource,
	IActivityPubRemoteObjectReport,
	IActivityPubRemoteObjectReviewStateInput,
	IActivityPubRemoteObjectAttachmentPreview,
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
	buildActivityPubNodeInfoDiscoveryResponse,
	buildActivityPubNodeInfoResponse,
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

type IActivityPubRemoteObjectPostContentResult = {
	contents: IContent[];
	attachmentBackups: IActivityPubRemoteAttachmentBackup[];
	attachmentImportMode: ActivityPubRemoteAttachmentImportMode;
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
const maxActivityPubRemoteObjectPreviewAttachments = 8;
const maxActivityPubRemoteObjectPreviewAttachmentTextLength = 500;
const maxActivityPubRemoteObjectPreviewAttachmentTypeLength = 100;
const maxActivityPubRemoteObjectPreviewAttachmentDimension = 1000000;
const maxActivityPubRemoteObjectPreviewAttachmentBlurhashLength = 200;
const maxActivityPubRemoteObjectPreviewAttachmentDurationSeconds = 60 * 60 * 24 * 7;
const activityPubRemoteAttachmentImportPolicy: IActivityPubRemoteAttachmentImportPolicy = Object.freeze({
	mode: 'provenanceOnly',
	defaultMode: 'provenanceOnly',
	canImportRemoteBytes: true,
	supportedModes: ['provenanceOnly', 'backupOnCreate']
});
const activityPubSharedInboxReviewObjectTypes = new Set([
	'Note',
	'Article',
	'Page',
	'Image',
	'Video',
	'Audio',
	'Document',
	'Question',
	'Event'
]);

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

		async getNodeInfoDiscovery() {
			const config = getResolvedActivityPubConfig(app);
			return buildActivityPubNodeInfoDiscoveryResponse(config);
		}

		async getNodeInfo() {
			const config = getResolvedActivityPubConfig(app);
			return buildActivityPubNodeInfoResponse(config);
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

		async createGroupRemoteObjectPost(groupName: string, remoteObjectId: number | string, userId: number, options: IActivityPubRemoteObjectPostCreateOptions = {}): Promise<IActivityPubRemoteObjectPostCreateResult> {
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
			const contentResult = await createActivityPubRemoteObjectPostContents(app, userId, postDraft, options);
			const post = await app.ms.group.createRemotePostByObject(userId, getActivityPubRemoteObjectPostData(group, remoteObject, postDraft, contentResult));
			await updateActivityPubRemoteObjectLocalPostId(objectRecord, post);

			const result: IActivityPubRemoteObjectPostCreateResult = {
				post,
				remoteObject: await getActivityPubRemoteObjectReportWithRemoteActor(models, objectRecord)
			};
			if (contentResult.attachmentBackups.length) {
				result.attachmentBackups = contentResult.attachmentBackups;
			}
			return result;
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

			return getActivityPubFlagReportWithRemoteActor(models, actorRecord, flag);
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
				const localPostUpdated = await updateActivityPubRemoteObjectPostIfChanged(app, models, objectRecord);
				await resetActivityPubObjectReviewState(models, objectRecord);

				return getSharedInboxUpdateResult(verification, remoteActorUrl, objectRecord, localPostUpdated);
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

async function getActivityPubFlagReportWithRemoteActor(models, actorRecord, flag): Promise<IActivityPubFlagReport> {
	const [remoteActors, targetByObjectId] = await Promise.all([
		getRemoteActorRecordsByIds(models, [flag.remoteActorId]),
		getActivityPubFlagTargetByObjectId(models, actorRecord, [flag])
	]);
	return getActivityPubFlagReport(flag, getRemoteActorById(remoteActors), targetByObjectId);
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
	const [remoteActors, targetByObjectId] = await Promise.all([
		getRemoteActorRecordsByIds(models, reportPage.rows.map((flag) => flag.remoteActorId)),
		getActivityPubFlagTargetByObjectId(models, actorRecord, reportPage.rows)
	]);
	const remoteActorById = getRemoteActorById(remoteActors);

	return {
		list: reportPage.rows.map((flag) => getActivityPubFlagReport(flag, remoteActorById, targetByObjectId)),
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

function getActivityPubFlagReport(flag, remoteActorById: Map<number, any>, targetByObjectId: Map<string, IActivityPubFlagReportTarget> = new Map()): IActivityPubFlagReport {
	const remoteActor = remoteActorById.get(Number(flag.remoteActorId));

	return {
		id: flag.id,
		localActorId: flag.localActorId,
		remoteActorId: flag.remoteActorId,
		remoteActor: getActivityPubFlagRemoteActorReport(remoteActor),
		activityId: flag.activityId,
		objectId: flag.objectId,
		target: targetByObjectId.get(flag.objectId) || getUnknownActivityPubFlagTarget(flag.objectId),
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
	if (preview?.attachments?.length) {
		draft.attachments = preview.attachments;
		draft.attachmentImportPolicy = getActivityPubRemoteAttachmentImportPolicy();
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

async function createActivityPubRemoteObjectPostContents(app: IGeesomeApp, userId: number, postDraft: IActivityPubRemoteObjectPostDraft, options: IActivityPubRemoteObjectPostCreateOptions = {}): Promise<IActivityPubRemoteObjectPostContentResult> {
	const content = await createActivityPubRemoteObjectPostContent(app, userId, postDraft);
	const attachmentImportMode = getActivityPubRemoteAttachmentImportMode(options);
	const attachmentBackups = attachmentImportMode === 'backupOnCreate'
		? await createActivityPubRemoteAttachmentBackups(app, userId, postDraft)
		: [];
	return {
		contents: [content, ...attachmentBackups.map((backup) => ({id: backup.contentId} as IContent))],
		attachmentBackups,
		attachmentImportMode
	};
}

async function createActivityPubRemoteAttachmentBackups(app: IGeesomeApp, userId: number, postDraft: IActivityPubRemoteObjectPostDraft): Promise<IActivityPubRemoteAttachmentBackup[]> {
	const backups: IActivityPubRemoteAttachmentBackup[] = [];
	for (const attachment of postDraft.attachments || []) {
		if (!isActivityPubRemoteAttachmentBackupSupported(attachment)) {
			continue;
		}
		const content = await createActivityPubRemoteAttachmentBackupContent(app, userId, postDraft, attachment);
		backups.push(getActivityPubRemoteAttachmentBackup(attachment, content));
	}
	return backups;
}

async function createActivityPubRemoteAttachmentBackupContent(app: IGeesomeApp, userId: number, postDraft: IActivityPubRemoteObjectPostDraft, attachment: IActivityPubRemoteObjectAttachmentPreview): Promise<IContent> {
	const options = getActivityPubRemoteAttachmentSaveOptions(postDraft, attachment);
	const storagePath = getActivityPubRemoteAttachmentStoragePath(attachment.url);
	if (storagePath) {
		const stream = await app.ms.content.getFileStream(storagePath);
		return app.ms.content.saveData(userId, stream, getActivityPubRemoteAttachmentImportName(attachment), options);
	}
	return app.ms.content.saveDataByUrl(userId, attachment.url, options);
}

function getActivityPubRemoteObjectPostData(group: IGroup, remoteObject: IActivityPubRemoteObjectReport, postDraft: IActivityPubRemoteObjectPostDraft, contentResult: IActivityPubRemoteObjectPostContentResult) {
	const postData: any = {
		groupId: group.id,
		status: PostStatus.Published,
		source: 'activityPub',
		sourceChannelId: getActivityPubRemoteObjectPostSourceChannelId(remoteObject),
		sourcePostId: getActivityPubRemoteObjectPostSourcePostId(remoteObject),
		sourceDate: remoteObject.publishedAt || undefined,
		propertiesJson: JSON.stringify(getActivityPubRemoteObjectPostProperties(remoteObject, postDraft, contentResult)),
		contents: contentResult.contents.map((content) => ({id: content.id}))
	};
	if (postDraft.replyToPostId) {
		postData['replyToId'] = postDraft.replyToPostId;
	}
	return postData;
}

function getActivityPubRemoteObjectPostProperties(remoteObject: IActivityPubRemoteObjectReport, postDraft: IActivityPubRemoteObjectPostDraft, contentResult: IActivityPubRemoteObjectPostContentResult) {
	const properties: any = {
		activityPub: {...postDraft.source}
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
	if (postDraft.attachments?.length) {
		properties.activityPub.attachments = postDraft.attachments;
	}
	if (postDraft.attachmentImportPolicy) {
		properties.activityPub.attachmentImportPolicy = postDraft.attachmentImportPolicy;
	}
	if (postDraft.attachments?.length) {
		properties.activityPub.attachmentImportMode = contentResult.attachmentImportMode;
	}
	if (contentResult.attachmentBackups.length) {
		properties.activityPub.attachmentBackups = contentResult.attachmentBackups;
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

	const attachments = getActivityPubRemoteObjectAttachmentPreviews(object);
	if (attachments.length) {
		preview.attachments = attachments;
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

function getActivityPubRemoteObjectAttachmentPreviews(object): IActivityPubRemoteObjectAttachmentPreview[] {
	const previews: IActivityPubRemoteObjectAttachmentPreview[] = [];
	const seenUrls = new Set<string>();
	const attachmentValues = getActivityPubRemoteObjectArrayValue(object?.attachment);
	for (const attachmentValue of attachmentValues) {
		const preview = getActivityPubRemoteObjectAttachmentPreview(attachmentValue);
		if (!preview) {
			continue;
		}
		if (seenUrls.has(preview.url)) {
			continue;
		}
		previews.push(preview);
		seenUrls.add(preview.url);
		if (previews.length >= maxActivityPubRemoteObjectPreviewAttachments) {
			break;
		}
	}
	return previews;
}

function getActivityPubRemoteObjectAttachmentPreview(value): IActivityPubRemoteObjectAttachmentPreview | undefined {
	const url = getActivityPubRemoteObjectSafeUrlValue(value);
	if (!url) {
		return undefined;
	}

	const preview: IActivityPubRemoteObjectAttachmentPreview = {url};
	if (value && typeof value === 'object') {
		addActivityPubRemoteObjectAttachmentTextFields(preview, value);
		addActivityPubRemoteObjectAttachmentDimensions(preview, value);
		addActivityPubRemoteObjectAttachmentMediaFields(preview, value);
	}
	addActivityPubRemoteObjectAttachmentEmbedPolicy(preview);
	addActivityPubRemoteObjectAttachmentBackupFields(preview);
	return preview;
}

function addActivityPubRemoteObjectAttachmentTextFields(preview: IActivityPubRemoteObjectAttachmentPreview, value): void {
	const type = getActivityPubRemoteObjectTextField(value, 'type', maxActivityPubRemoteObjectPreviewAttachmentTypeLength);
	if (type) {
		preview.type = type;
	}
	const mediaType = getActivityPubRemoteObjectTextField(value, 'mediaType', maxActivityPubRemoteObjectPreviewAttachmentTypeLength);
	if (mediaType) {
		preview.mediaType = mediaType;
	}
	const name = getActivityPubRemoteObjectTextField(value, 'name', maxActivityPubRemoteObjectPreviewAttachmentTextLength);
	if (name) {
		preview.name = name;
	}
	const summaryText = getActivityPubRemoteObjectTextField(value, 'summary', maxActivityPubRemoteObjectPreviewAttachmentTextLength);
	if (summaryText) {
		preview.summaryText = summaryText;
	}
}

function addActivityPubRemoteObjectAttachmentDimensions(preview: IActivityPubRemoteObjectAttachmentPreview, value): void {
	const width = getActivityPubRemoteObjectPositiveInteger(value.width);
	if (width) {
		preview.width = width;
	}
	const height = getActivityPubRemoteObjectPositiveInteger(value.height);
	if (height) {
		preview.height = height;
	}
}

function addActivityPubRemoteObjectAttachmentMediaFields(preview: IActivityPubRemoteObjectAttachmentPreview, value): void {
	const mediaCategory = getActivityPubRemoteObjectAttachmentMediaCategory(preview);
	if (mediaCategory) {
		preview.mediaCategory = mediaCategory;
	}
	const altText = getActivityPubRemoteObjectAttachmentAltText(preview, mediaCategory);
	if (altText) {
		preview.altText = altText;
	}
	const durationSeconds = getActivityPubRemoteObjectDurationSeconds(value.duration);
	if (durationSeconds) {
		preview.durationSeconds = durationSeconds;
	}
	const blurhash = getActivityPubRemoteObjectTextField(value, 'blurhash', maxActivityPubRemoteObjectPreviewAttachmentBlurhashLength);
	if (blurhash) {
		preview.blurhash = blurhash;
	}
	const sensitive = getActivityPubRemoteObjectBoolean(value.sensitive);
	if (sensitive !== undefined) {
		preview.sensitive = sensitive;
	}
}

function addActivityPubRemoteObjectAttachmentBackupFields(preview: IActivityPubRemoteObjectAttachmentPreview): void {
	const unsupportedReason = getActivityPubRemoteAttachmentBackupUnsupportedReason(preview);
	preview.canBackupRemoteBytes = !unsupportedReason;
	if (unsupportedReason) {
		preview.backupUnsupportedReason = unsupportedReason;
	}
}

function addActivityPubRemoteObjectAttachmentEmbedPolicy(preview: IActivityPubRemoteObjectAttachmentPreview): void {
	preview.embedPolicy = getActivityPubRemoteAttachmentEmbedPolicy(preview);
}

function getActivityPubRemoteObjectPreviewText(html: string): string {
	return truncateActivityPubRemoteObjectPreview(htmlToText(html), maxActivityPubRemoteObjectPreviewTextLength);
}

function getActivityPubRemoteObjectAttachmentMediaCategory(preview: IActivityPubRemoteObjectAttachmentPreview): IActivityPubRemoteObjectAttachmentPreview['mediaCategory'] | undefined {
	const mediaType = String(preview.mediaType || '').toLowerCase();
	if (mediaType.startsWith('image/')) {
		return 'image';
	}
	if (mediaType.startsWith('video/')) {
		return 'video';
	}
	if (mediaType.startsWith('audio/')) {
		return 'audio';
	}
	const type = String(preview.type || '').toLowerCase();
	if (type === 'image') {
		return 'image';
	}
	if (type === 'video') {
		return 'video';
	}
	if (type === 'audio') {
		return 'audio';
	}
	if (type === 'link') {
		return 'link';
	}
	if (type === 'document') {
		return 'document';
	}
	return undefined;
}

function getActivityPubRemoteObjectAttachmentAltText(
	preview: IActivityPubRemoteObjectAttachmentPreview,
	mediaCategory: IActivityPubRemoteObjectAttachmentPreview['mediaCategory'] | undefined
): string {
	if (mediaCategory !== 'image' && mediaCategory !== 'video') {
		return '';
	}
	return preview.name || preview.summaryText || '';
}

function getActivityPubRemoteObjectArrayValue(value): any[] {
	if (Array.isArray(value)) {
		return value;
	}
	if (value === undefined || value === null) {
		return [];
	}
	return [value];
}

function getActivityPubRemoteObjectStringValue(value): string {
	if (typeof value !== 'string') {
		return '';
	}
	return value.trim();
}

function getActivityPubRemoteObjectBoolean(value): boolean | undefined {
	if (typeof value === 'boolean') {
		return value;
	}
	if (typeof value !== 'string') {
		return undefined;
	}
	const normalizedValue = value.trim().toLowerCase();
	if (normalizedValue === 'true') {
		return true;
	}
	if (normalizedValue === 'false') {
		return false;
	}
	return undefined;
}

function getActivityPubRemoteObjectSafeUrl(object): string {
	return getActivityPubRemoteObjectSafeUrlValue(object?.url);
}

function getActivityPubRemoteObjectSafeUrlValue(value): string {
	if (typeof value === 'string') {
		return sanitizeAbsoluteHref(value);
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			const url = getActivityPubRemoteObjectSafeUrlValue(item);
			if (url) {
				return url;
			}
		}
		return '';
	}
	if (value && typeof value === 'object') {
		const href = getActivityPubRemoteObjectStringValue(value.href);
		if (href) {
			const url = sanitizeAbsoluteHref(href);
			if (url) {
				return url;
			}
		}
		return getActivityPubRemoteObjectSafeUrlValue(value.url);
	}
	return '';
}

function getActivityPubRemoteObjectPositiveInteger(value): number | undefined {
	const number = Number(value);
	if (!Number.isFinite(number)) {
		return undefined;
	}
	if (number <= 0) {
		return undefined;
	}
	if (number > maxActivityPubRemoteObjectPreviewAttachmentDimension) {
		return undefined;
	}
	return Math.floor(number);
}

function getActivityPubRemoteObjectDurationSeconds(value): number | undefined {
	const rawValue = typeof value === 'string' ? value.trim() : value;
	const seconds = typeof rawValue === 'string' && rawValue.toUpperCase().startsWith('P')
		? parseActivityPubIsoDurationSeconds(rawValue)
		: Number(rawValue);
	if (!Number.isFinite(seconds)) {
		return undefined;
	}
	if (seconds <= 0) {
		return undefined;
	}
	if (seconds > maxActivityPubRemoteObjectPreviewAttachmentDurationSeconds) {
		return undefined;
	}
	return Math.round(seconds);
}

function parseActivityPubIsoDurationSeconds(value: string): number {
	const match = value.trim().toUpperCase().match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
	if (!match) {
		return Number.NaN;
	}
	const [, days, hours, minutes, seconds] = match;
	return Number(days || 0) * 24 * 60 * 60
		+ Number(hours || 0) * 60 * 60
		+ Number(minutes || 0) * 60
		+ Number(seconds || 0);
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

function getActivityPubRemoteAttachmentImportMode(options: IActivityPubRemoteObjectPostCreateOptions = {}): ActivityPubRemoteAttachmentImportMode {
	if (helpers.parseBoolean(options.importRemoteAttachments, false)) {
		return 'backupOnCreate';
	}
	return 'provenanceOnly';
}

function getActivityPubRemoteAttachmentImportPolicy(): IActivityPubRemoteAttachmentImportPolicy {
	return activityPubRemoteAttachmentImportPolicy;
}

function getActivityPubRemoteObjectPostUpdateOptions(post: IPost): IActivityPubRemoteObjectPostCreateOptions {
	const properties = parseActivityPubJson(String(post?.propertiesJson || '{}'));
	if (properties?.activityPub?.attachmentImportMode === 'backupOnCreate') {
		return {importRemoteAttachments: true};
	}
	return {};
}

function isActivityPubRemoteAttachmentBackupSupported(attachment: IActivityPubRemoteObjectAttachmentPreview): boolean {
	return !getActivityPubRemoteAttachmentBackupUnsupportedReason(attachment);
}

function getActivityPubRemoteAttachmentBackupUnsupportedReason(attachment: IActivityPubRemoteObjectAttachmentPreview): IActivityPubRemoteObjectAttachmentPreview['backupUnsupportedReason'] | '' {
	if (!isActivityPubRemoteAttachmentBackupCategorySupported(attachment)) {
		return 'activitypub_remote_attachment_backup_unsupported_category';
	}
	if (!isActivityPubRemoteAttachmentBackupUrlSupported(attachment.url)) {
		return 'activitypub_remote_attachment_backup_unsupported_url_scheme';
	}
	return '';
}

function isActivityPubRemoteAttachmentBackupCategorySupported(attachment: IActivityPubRemoteObjectAttachmentPreview): boolean {
	return ['image', 'video', 'audio', 'document'].includes(String(attachment.mediaCategory || ''));
}

function isActivityPubRemoteAttachmentBackupUrlSupported(urlValue: string): boolean {
	try {
		const url = new URL(urlValue);
		if (url.protocol === 'http:' || url.protocol === 'https:') {
			return true;
		}
		return Boolean(getActivityPubRemoteAttachmentUrlBackupPath(url));
	} catch (e) {
		return false;
	}
}

function getActivityPubRemoteAttachmentStoragePath(urlValue: string): string {
	try {
		return getActivityPubRemoteAttachmentUrlBackupPath(new URL(urlValue));
	} catch (e) {
		return '';
	}
}

function getActivityPubRemoteAttachmentUrlBackupPath(url: URL): string {
	if (url.protocol === 'http:' || url.protocol === 'https:') {
		return '';
	}
	if (url.protocol === 'ipfs:') {
		return getActivityPubRemoteAttachmentContentAddressPath(url);
	}
	if (url.protocol === 'ipns:') {
		const contentAddressPath = getActivityPubRemoteAttachmentContentAddressPath(url);
		return contentAddressPath ? `/ipns/${contentAddressPath}` : '';
	}
	return '';
}

function getActivityPubRemoteAttachmentContentAddressPath(url: URL): string {
	const root = url.host;
	if (!root) {
		return '';
	}
	return `${root}${url.pathname || ''}`;
}

function getActivityPubRemoteAttachmentEmbedPolicy(attachment: IActivityPubRemoteObjectAttachmentPreview): NonNullable<IActivityPubRemoteObjectAttachmentPreview['embedPolicy']> {
	const mediaCategory = String(attachment.mediaCategory || '');
	if (isActivityPubRemoteAttachmentInlineMediaCategory(mediaCategory)) {
		return getActivityPubRemoteAttachmentInlineMediaEmbedPolicy(attachment);
	}
	if (mediaCategory === 'document') {
		return getActivityPubRemoteAttachmentDocumentLinkEmbedPolicy(attachment);
	}
	if (mediaCategory === 'link') {
		return getActivityPubRemoteAttachmentExternalLinkEmbedPolicy();
	}
	return getActivityPubRemoteAttachmentProvenanceOnlyEmbedPolicy('activitypub_remote_attachment_embed_unsupported_category');
}

function getActivityPubRemoteAttachmentInlineMediaEmbedPolicy(attachment: IActivityPubRemoteObjectAttachmentPreview): NonNullable<IActivityPubRemoteObjectAttachmentPreview['embedPolicy']> {
	if (!isActivityPubRemoteAttachmentBackupUrlSupported(attachment.url)) {
		return getActivityPubRemoteAttachmentProvenanceOnlyEmbedPolicy('activitypub_remote_attachment_embed_unsupported_url_scheme');
	}
	if (attachment.sensitive === true) {
		return {
			mode: 'externalLink',
			canEmbedInline: false,
			requiresUserAction: true,
			unsupportedReason: 'activitypub_remote_attachment_embed_sensitive'
		};
	}
	return {
		mode: 'inlineMedia',
		canEmbedInline: true,
		requiresUserAction: false
	};
}

function getActivityPubRemoteAttachmentDocumentLinkEmbedPolicy(attachment: IActivityPubRemoteObjectAttachmentPreview): NonNullable<IActivityPubRemoteObjectAttachmentPreview['embedPolicy']> {
	if (!isActivityPubRemoteAttachmentBackupUrlSupported(attachment.url)) {
		return getActivityPubRemoteAttachmentProvenanceOnlyEmbedPolicy('activitypub_remote_attachment_embed_unsupported_url_scheme');
	}
	return {
		mode: 'documentLink',
		canEmbedInline: false,
		requiresUserAction: true
	};
}

function getActivityPubRemoteAttachmentExternalLinkEmbedPolicy(): NonNullable<IActivityPubRemoteObjectAttachmentPreview['embedPolicy']> {
	return {
		mode: 'externalLink',
		canEmbedInline: false,
		requiresUserAction: true
	};
}

function getActivityPubRemoteAttachmentProvenanceOnlyEmbedPolicy(unsupportedReason: NonNullable<IActivityPubRemoteObjectAttachmentPreview['embedPolicy']>['unsupportedReason']): NonNullable<IActivityPubRemoteObjectAttachmentPreview['embedPolicy']> {
	return {
		mode: 'provenanceOnly',
		canEmbedInline: false,
		requiresUserAction: true,
		unsupportedReason
	};
}

function isActivityPubRemoteAttachmentInlineMediaCategory(mediaCategory: string): boolean {
	return ['image', 'video', 'audio'].includes(mediaCategory);
}

function getActivityPubRemoteAttachmentSaveOptions(postDraft: IActivityPubRemoteObjectPostDraft, attachment: IActivityPubRemoteObjectAttachmentPreview) {
	return {
		mimeType: attachment.mediaType,
		name: getActivityPubRemoteAttachmentImportName(attachment),
		description: attachment.summaryText || attachment.altText,
		view: getActivityPubRemoteAttachmentContentView(attachment),
		properties: {
			source: 'activityPub',
			activityPub: {
				...postDraft.source,
				attachmentUrl: attachment.url,
				attachmentType: attachment.type,
				attachmentMediaType: attachment.mediaType,
				attachmentMediaCategory: attachment.mediaCategory
			}
		}
	};
}

function getActivityPubRemoteAttachmentBackup(attachment: IActivityPubRemoteObjectAttachmentPreview, content: IContent): IActivityPubRemoteAttachmentBackup {
	const backup: IActivityPubRemoteAttachmentBackup = {
		url: attachment.url,
		contentId: Number(content.id)
	};
	if (content.storageId) {
		backup.storageId = content.storageId;
	}
	if (attachment.mediaType) {
		backup.mediaType = attachment.mediaType;
	}
	if (attachment.mediaCategory) {
		backup.mediaCategory = attachment.mediaCategory;
	}
	if (attachment.name) {
		backup.name = attachment.name;
	}
	return backup;
}

function getActivityPubRemoteAttachmentImportName(attachment: IActivityPubRemoteObjectAttachmentPreview): string {
	return attachment.name || getActivityPubRemoteAttachmentUrlFileName(attachment.url) || 'activitypub-remote-attachment';
}

function getActivityPubRemoteAttachmentUrlFileName(url: string): string {
	try {
		return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
	} catch (e) {
		return '';
	}
}

function getActivityPubRemoteAttachmentContentView(attachment: IActivityPubRemoteObjectAttachmentPreview): ContentView {
	if (['image', 'video', 'audio'].includes(String(attachment.mediaCategory || ''))) {
		return ContentView.Media;
	}
	return ContentView.Attachment;
}

async function updateActivityPubRemoteObjectLocalPostId(objectRecord, post: IPost): Promise<void> {
	if (Number(objectRecord.localPostId || 0) === Number(post.id || 0)) {
		return;
	}
	await objectRecord.update({localPostId: post.id});
}

async function updateActivityPubRemoteObjectPost(app: IGeesomeApp, models, objectRecord): Promise<boolean> {
	const post = await getActivityPubRemoteObjectImportedPost(app, objectRecord);
	if (!post) {
		return false;
	}
	const remoteObject = await getActivityPubRemoteObjectReportWithRemoteActor(models, objectRecord);
	const postDraft = await getActivityPubRemoteObjectPostDraft(models, {id: remoteObject.localActorId}, remoteObject);
	if (!isActivityPubRemoteObjectPostDraftUpdateable(postDraft)) {
		return false;
	}
	if (!post.userId) {
		return false;
	}
	const contentResult = await createActivityPubRemoteObjectPostContents(app, post.userId, postDraft, getActivityPubRemoteObjectPostUpdateOptions(post));
	const group = post.group || await app.ms.group.getGroup(post.groupId);
	if (!group) {
		return false;
	}
	const postData = getActivityPubRemoteObjectPostUpdateData(group, remoteObject, postDraft, contentResult);
	await app.ms.group.updateRemotePostByObject(post.userId, post.id, postData);
	return true;
}

async function updateActivityPubRemoteObjectPostIfChanged(app: IGeesomeApp, models, objectRecord): Promise<boolean> {
	if (objectRecord?.activityPubObjectChanged !== true) {
		return false;
	}
	return updateActivityPubRemoteObjectPost(app, models, objectRecord);
}

async function deleteActivityPubRemoteObjectPost(app: IGeesomeApp, objectRecord): Promise<boolean> {
	const post = await getActivityPubRemoteObjectImportedPost(app, objectRecord);
	if (!post) {
		return false;
	}
	await app.ms.group.deletePostsPure(post.userId || null, [post.id]);
	return true;
}

async function getActivityPubRemoteObjectImportedPost(app: IGeesomeApp, objectRecord): Promise<IPost | null> {
	const postId = Number(objectRecord?.localPostId || 0);
	if (!Number.isFinite(postId) || postId <= 0) {
		return null;
	}
	const post = await app.ms.group.getPostPure(postId);
	if (!isActivityPubRemoteObjectImportedPost(objectRecord, post)) {
		return null;
	}
	return post;
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

function getActivityPubRemoteObjectPostUpdateData(group: IGroup, remoteObject: IActivityPubRemoteObjectReport, postDraft: IActivityPubRemoteObjectPostDraft, contentResult: IActivityPubRemoteObjectPostContentResult) {
	const postData = getActivityPubRemoteObjectPostData(group, remoteObject, postDraft, contentResult);
	if (!postDraft.replyToPostId) {
		postData.replyToId = null;
	}
	return postData;
}

function isActivityPubRemoteObjectPostDraftUpdateable(postDraft: IActivityPubRemoteObjectPostDraft): boolean {
	const blockingReasons = postDraft.reasons.filter((reason) => {
		return ![
			'activitypub_remote_object_post_exists',
			'activitypub_remote_object_review_not_accepted'
		].includes(reason);
	});
	return blockingReasons.length === 0;
}

function getActivityPubFlagRemoteActorReport(remoteActor) {
	return getActivityPubRemoteActorReport(remoteActor);
}

async function getActivityPubFlagTargetByObjectId(models, actorRecord, flags): Promise<Map<string, IActivityPubFlagReportTarget>> {
	const objectIds = getActivityPubFlagObjectIds(flags);
	const targetByObjectId = new Map<string, IActivityPubFlagReportTarget>();
	if (!actorRecord) {
		for (const objectId of objectIds) {
			targetByObjectId.set(objectId, getUnknownActivityPubFlagTarget(objectId));
		}
		return targetByObjectId;
	}
	for (const objectId of objectIds) {
		if (objectId === actorRecord.actorUrl) {
			targetByObjectId.set(objectId, getLocalActorActivityPubFlagTarget(actorRecord, objectId));
		}
	}

	const localObjectIds = objectIds.filter((objectId) => !targetByObjectId.has(objectId));
	const localObjects = localObjectIds.length
		? await models.ActivityPubObject.findAll({
			where: {
				localActorId: actorRecord.id,
				objectId: {
					[Op.in]: localObjectIds
				},
				origin: ActivityPubObjectOrigin.Local
			}
		})
		: [];
	for (const objectRecord of localObjects) {
		targetByObjectId.set(objectRecord.objectId, getLocalObjectActivityPubFlagTarget(objectRecord));
	}
	for (const objectId of objectIds) {
		if (!targetByObjectId.has(objectId)) {
			targetByObjectId.set(objectId, getUnknownActivityPubFlagTarget(objectId));
		}
	}
	return targetByObjectId;
}

function getActivityPubFlagObjectIds(flags): string[] {
	const objectIds = flags.map((flag) => String(flag?.objectId || '').trim()).filter(Boolean);
	return [...new Set(objectIds)];
}

function getLocalActorActivityPubFlagTarget(actorRecord, objectId: string): IActivityPubFlagReportTarget {
	return {
		objectId,
		type: 'localActor',
		localActorId: actorRecord.id
	};
}

function getLocalObjectActivityPubFlagTarget(objectRecord): IActivityPubFlagReportTarget {
	const target: IActivityPubFlagReportTarget = {
		objectId: objectRecord.objectId,
		type: 'localObject',
		localActorId: objectRecord.localActorId,
		activityPubObjectId: objectRecord.id
	};
	const localPostId = Number(objectRecord.localPostId || 0);
	if (Number.isFinite(localPostId) && localPostId > 0) {
		target.localPostId = localPostId;
	}
	if (objectRecord.objectType) {
		target.objectType = objectRecord.objectType;
	}
	return target;
}

function getUnknownActivityPubFlagTarget(objectId: string): IActivityPubFlagReportTarget {
	return {
		objectId,
		type: 'unknown'
	};
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
	return getRequiredSharedInboxReviewObject(
		activity?.object,
		'activitypub_create_object_required',
		'activitypub_create_object_not_supported'
	);
}

function getRequiredSharedInboxUpdateObject(activity) {
	if (!isUpdateActivity(activity)) {
		throwActivityPubError('activitypub_activity_not_supported', 501);
	}
	return getRequiredSharedInboxReviewObject(
		activity?.object,
		'activitypub_update_object_required',
		'activitypub_update_object_not_supported'
	);
}

function getRequiredSharedInboxReviewObject(object, requiredMessage: string, unsupportedMessage: string) {
	if (!object || typeof object !== 'object' || Array.isArray(object)) {
		throwActivityPubError(requiredMessage, 400);
	}
	if (!isActivityPubSharedInboxReviewObjectType(object.type)) {
		throwActivityPubError(unsupportedMessage, 501);
	}
	return object;
}

function isActivityPubSharedInboxReviewObjectType(objectType): boolean {
	return typeof objectType === 'string'
		&& activityPubSharedInboxReviewObjectTypes.has(objectType);
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

function getSharedInboxUpdateResult(verification, remoteActorUrl: string, objectRecord, localPostUpdated: boolean): IActivityPubInboxResult {
	return {
		...verification,
		ok: true,
		accepted: true,
		message: 'activitypub_update_object_recorded',
		activityType: 'Update',
		actor: remoteActorUrl,
		activityPubObjectId: objectRecord.id,
		objectId: objectRecord.objectId,
		localPostUpdated
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
