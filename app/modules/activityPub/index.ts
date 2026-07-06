import {Op} from 'sequelize';
import {IGeesomeApp} from '../../interface.js';
import helpers from '../../helpers.js';
import {htmlToText, sanitizeAbsoluteHref, sanitizeHtml} from '../../htmlSafety.js';
import {RICH_TEXT_MIME_TYPE, htmlToRichText} from '../../richText.js';
import {ContentView, CorePermissionName} from '../database/interface.js';
import type {IContent, IContentData, IListParams, IListParamsOptions} from '../database/interface.js';
import type {IGroup, IPost} from '../group/interface.js';
import {PostStatus} from '../group/interface.js';
import {createActivityPubMigrationPreview, type ActivityPubMigrationOwnershipMethod, type IActivityPubMigrationPreviewItem} from './migration.js';
import {
	evaluateRemoteContentModerationPolicy,
	getRemoteContentModerationSummary,
	isRemoteContentModerationDecisionImportable,
	normalizeRemoteContentModerationPolicy,
	type IRemoteContentModerationDecision,
	type IRemoteContentModerationPolicy,
	type IRemoteContentModerationPolicyInput
} from '../remoteContentModeration/helpers.js';
import IGeesomeActivityPubModule, {
	ActivityPubRemoteAttachmentImportMode,
	ActivityPubFollowDirection,
	ActivityPubFlagState,
	ActivityPubFollowState,
	ActivityPubObjectOrigin,
	ActivityPubObjectReviewState,
	ActivityPubObjectVisibility,
	ActivityPubSourceSubscriptionStatus,
	IActivityPubFlagReport,
	IActivityPubFlagReportFilters,
	IActivityPubFlagReportListResponse,
	IActivityPubFlagReportTarget,
	IActivityPubMigrationPreviewInput,
	IActivityPubMigrationPreviewResult,
	IActivityPubMigrationImportInput,
	IActivityPubMigrationImportQueueInput,
	IActivityPubMigrationImportQueueProcessOptions,
	IActivityPubMigrationImportQueueProcessResult,
	IActivityPubMigrationImportResult,
	IActivityPubMigrationRelationReconcileInput,
	IActivityPubMigrationRelationReconcileResult,
	IActivityPubMigrationRelationReconcileRow,
	IActivityPubRemoteObjectFilters,
	IActivityPubRemoteObjectListResponse,
	IActivityPubRemoteObjectPostCreateResult,
	IActivityPubRemoteAttachmentBackup,
	IActivityPubRemoteAttachmentBackupQueueOptions,
	IActivityPubRemoteAttachmentBackupQueueProcessOptions,
	IActivityPubRemoteAttachmentBackupRetryResult,
	IActivityPubRemoteAttachmentImportPolicy,
	IActivityPubRemoteObjectPostCreateOptions,
	IActivityPubRemoteObjectPostDraft,
	IActivityPubRemoteObjectPostDraftSource,
	IActivityPubRemoteObjectReport,
	IActivityPubRemoteObjectReviewStateInput,
	IActivityPubRemoteObjectAttachmentPreview,
	IActivityPubRemoteObjectPreview,
	IActivityPubSourceFeedFilters,
	IActivityPubSourceFeedResponse,
	IActivityPubSourceFollowInput,
	IActivityPubSourceFollowResult,
	IActivityPubSourceJsonFetcher,
	IActivityPubSourceReadInput,
	IActivityPubSourceRefreshPollOptions,
	IActivityPubSourceRefreshQueueInput,
	IActivityPubSourceRefreshQueueProcessOptions,
	IActivityPubSourceRefreshInput,
	IActivityPubSourceRefreshResult,
	IActivityPubSourceResolveInput,
	IActivityPubSourceResolveResult,
	IActivityPubSourceSubscriptionFilters,
	IActivityPubSourceSubscriptionInput,
	IActivityPubSourceSubscriptionListResponse,
	IActivityPubSourceSubscriptionReport,
	IActivityPubSourceSubscriptionUpdateInput,
	IActivityPubInboxResult,
	IActivityPubInboundRequest,
	IActivityPubDeliveryProcessOptions,
	IActivityPubOutboundFollowOptions,
	IActivityPubOutboundFollowResult,
	IActivityPubRemoteActorKeyResolver,
	IActivityPubWebFingerFetcher,
	IActivityPubDeliveryRequestSender,
	IActivityPubSignRequestOptions,
	IResolvedActivityPubConfig
} from './interface.js';
import {
	activityPubPublicCollection,
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
import {
	fetchActivityPubSourceCollectionItems,
	fetchActivityPubSourceCollectionItemsWithState,
	fetchActivityPubSourceJson,
	getActivityPubSourceRefreshUpdateData,
	refreshActivityPubSourceSubscription
} from './sourceRefresh.js';
import {isActivityPubReviewObjectType} from './reviewObjectTypes.js';

type IActivityPubModuleOptions = IActivityPubRemoteActorCacheOptions & {
	models?: any;
	resolveRemoteActorKey?: IActivityPubRemoteActorKeyResolver;
	fetchActivityPubWebFinger?: IActivityPubWebFingerFetcher;
	fetchActivityPubSourceJson?: IActivityPubSourceJsonFetcher;
	deliverActivityPubRequest?: IActivityPubDeliveryRequestSender;
};

type IActivityPubRemoteObjectPostContentResult = {
	contents: IContent[];
	attachmentBackups: IActivityPubRemoteAttachmentBackup[];
	attachmentImportMode: ActivityPubRemoteAttachmentImportMode;
};

type IActivityPubMigrationVisibleImportContext = {
	group: IGroup;
	actorRecord: any;
	moderationPolicy: IRemoteContentModerationPolicy;
	ownershipMethod: Exclude<ActivityPubMigrationOwnershipMethod, null>;
};
type IActivityPubRemoteAttachmentBackupJob = {
	type: 'remote-attachment-backup';
	groupName: string;
	remoteObjectId: number;
	attempts?: number;
};
type IActivityPubSourceRefreshJob = {
	type: 'source-refresh';
	sourceId: number;
	input: IActivityPubSourceRefreshInput;
};
type IActivityPubMigrationImportJob = {
	type: 'migration-import';
	input: IActivityPubMigrationImportQueueInput;
};
type IActivityPubRemoteAttachmentBackupFailure = {
	url: string;
	errorMessage: string;
};
type IActivityPubRemoteAttachmentBackupWithAttachment = {
	attachment: IActivityPubRemoteObjectAttachmentPreview;
	backup: IActivityPubRemoteAttachmentBackup;
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
const activityPubSourceSubscriptionListParams = {
	limit: 20,
	sortBy: 'updatedAt',
	sortDir: 'DESC',
	allowedSortBy: ['createdAt', 'updatedAt', 'id', 'displayName', 'status', 'lastReadAt', 'lastRefreshRequestedAt'],
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
const activityPubRemoteAttachmentBackupQueueModuleName = 'activitypub-attachment-backup';
const activityPubRemoteAttachmentBackupQueueKickBatchLimit = 3;
const activityPubRemoteAttachmentBackupQueueMaxAttempts = 5;
const activityPubSourceRefreshQueueModuleName = 'activitypub-source-refresh';
const activityPubSourceRefreshQueueKickBatchLimit = 3;
const activityPubMigrationImportQueueModuleName = 'activitypub-migration-import';
const activityPubMigrationImportQueueKickBatchLimit = 3;
const activityPubMigrationRelationReconcileListParams: IListParamsOptions = {
	sortBy: 'publishedAt',
	allowedSortBy: ['publishedAt', 'updatedAt', 'createdAt', 'id'],
	maxLimit: 100
};
const activityPubSourceRefreshPollDefaultLimit = 20;
const activityPubSourceRefreshPollDefaultStaleMs = 15 * 60 * 1000;
const activityPubMigrationPreviewDefaultLimit = 20;
const activityPubMigrationPreviewMaxLimit = 50;
const activityPubMigrationPreviewMaxPagesDefault = 1;
const activityPubMigrationPreviewMaxPagesLimit = 25;
const activityPubMigrationOwnershipProofTokenMinLength = 12;
const activityPubMigrationOwnershipProofTokenMaxLength = 512;
const activityPubMigrationOwnershipProofValueMaxLength = 5000;
const activityPubMigrationOwnershipProofValueMaxCount = 100;
const activityPubMigrationOwnershipProofMaxDepth = 4;
const activityPubBlueskyBridgeHost = 'bsky.brid.gy';
const activityPubBlueskyOfficialPreset = 'bluesky-official';
const activityPubBlueskyBridgeProvider = 'bridgy-bluesky';
const activityPubRemoteAttachmentImportPolicy: IActivityPubRemoteAttachmentImportPolicy = Object.freeze({
	mode: 'provenanceOnly',
	defaultMode: 'provenanceOnly',
	canImportRemoteBytes: true,
	supportedModes: ['provenanceOnly', 'backupOnCreate']
});
let activityPubRemoteAttachmentBackupQueueInProcess = false;

export default async (app: IGeesomeApp, options: any = {}) => {
	app.checkModules(['api', 'group', 'database', 'content', 'asyncOperation']);
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

		async resolveActivityPubSource(input: IActivityPubSourceResolveInput): Promise<IActivityPubSourceResolveResult> {
			getResolvedActivityPubConfig(app);
			return getActivityPubSourceResolveResult(models, input, options);
		}

		async getMigrationPreview(_userId: number, input: IActivityPubMigrationPreviewInput = {}): Promise<IActivityPubMigrationPreviewResult> {
			getResolvedActivityPubConfig(app);
			return getActivityPubMigrationPreview(input, options);
		}

		async importMigration(userId: number, input: IActivityPubMigrationImportInput = {}): Promise<IActivityPubMigrationImportResult> {
			const config = getResolvedActivityPubConfig(app);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (isActivityPubMigrationVisibleImport(input)) {
				assertActivityPubMigrationVisibleImportCanStart(input);
				if (isActivityPubMigrationVisibleImportAdminApproved(input)) {
					await app.checkUserCan(userId, CorePermissionName.AdminAll);
				}
			}
			return importActivityPubMigration(app, models, config, userId, input, options);
		}

		async queueMigrationImport(userId: number, userApiKeyId: number | null = null, input: IActivityPubMigrationImportQueueInput = {}) {
			getResolvedActivityPubConfig(app);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			if (isActivityPubMigrationVisibleImport(input)) {
				assertActivityPubMigrationVisibleImportCanStart(input);
				if (isActivityPubMigrationVisibleImportAdminApproved(input)) {
					await app.checkUserCan(userId, CorePermissionName.AdminAll);
				}
			}
			const queue = await app.ms.asyncOperation.addUniqueUserOperationQueue(
				userId,
				activityPubMigrationImportQueueModuleName,
				userApiKeyId,
				getActivityPubMigrationImportJobInput(input)
			);
			if (helpers.parseBoolean(input?.process, true)) {
				this.startMigrationImportQueueProcessing();
			}
			return queue;
		}

		startMigrationImportQueueProcessing(options: IActivityPubMigrationImportQueueProcessOptions = {}) {
			const limit = helpers.parsePositiveInteger(options.limit, activityPubMigrationImportQueueKickBatchLimit);
			void this.processMigrationImportQueue({limit}).catch((e) => {
				console.error('processActivityPubMigrationImportQueue error', e);
			});
		}

		async processMigrationImportQueue(options: IActivityPubMigrationImportQueueProcessOptions = {}): Promise<IActivityPubMigrationImportQueueProcessResult> {
			getResolvedActivityPubConfig(app);
			const limit = helpers.parsePositiveInteger(options.limit, Number.MAX_SAFE_INTEGER);
			return app.ms.asyncOperation.processModuleOperationQueue(activityPubMigrationImportQueueModuleName, {
				limit,
				getPayload: (waitingQueue) => parseActivityPubMigrationImportJob(waitingQueue.inputJson),
				getAsyncOperationData: (_waitingQueue, job) => ({
					name: 'import-activitypub-migration',
					channel: getActivityPubMigrationImportJobChannel(job),
					percent: 5
				}),
				run: (waitingQueue, _asyncOperation, job) => this.importMigration(waitingQueue.userId, job.input)
			});
		}

		async reconcileMigrationRelations(userId: number, input: IActivityPubMigrationRelationReconcileInput = {}): Promise<IActivityPubMigrationRelationReconcileResult> {
			getResolvedActivityPubConfig(app);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			const groupId = await getRequiredActivityPubMigrationRelationReconcileGroupId(app, userId, input);
			const listParams = getActivityPubMigrationRelationReconcileListParams(input);
			const postRefs = await app.ms.group.getGroupPostRefs(
				groupId,
				getActivityPubMigrationRelationReconcilePostFilters(input),
				listParams,
				{
					attributes: ['id', 'groupId', 'publishedAt', 'replyToId', 'repostOfId', 'source', 'sourceChannelId', 'sourcePostId', 'propertiesJson'],
					defaultListParams: activityPubMigrationRelationReconcileListParams,
					cursor: {
						valueField: 'publishedAt',
						idField: 'id'
					}
				}
			);
			return reconcileActivityPubMigrationPostRelations(app, models, userId, postRefs, input, listParams);
		}

		async getActivityPubSourceSubscriptions(userId: number, filters: IActivityPubSourceSubscriptionFilters = {}, listParams: IListParams = {}): Promise<IActivityPubSourceSubscriptionListResponse> {
			getResolvedActivityPubConfig(app);
			return getActivityPubSourceSubscriptionList(app, models, userId, filters, listParams);
		}

		async subscribeActivityPubSource(userId: number, input: IActivityPubSourceSubscriptionInput): Promise<IActivityPubSourceSubscriptionReport> {
			getResolvedActivityPubConfig(app);
			const resolution = await getActivityPubSourceResolution(models, input, options);
			const subscription = await upsertActivityPubSourceSubscription(models, userId, input, resolution);
			return getActivityPubSourceSubscriptionReportWithRemoteActor(models, subscription);
		}

		async updateActivityPubSourceSubscription(userId: number, sourceId: number | string, input: IActivityPubSourceSubscriptionUpdateInput): Promise<IActivityPubSourceSubscriptionReport> {
			getResolvedActivityPubConfig(app);
			const subscription = await getActivityPubSourceSubscriptionRecord(models, userId, sourceId);
			if (!subscription) {
				throwActivityPubError('activitypub_source_subscription_not_found', 404);
			}
			await updateActivityPubSourceSubscriptionRecord(subscription, getActivityPubSourceSubscriptionUpdateData(input));
			return getActivityPubSourceSubscriptionReportWithRemoteActor(models, subscription);
		}

		async removeActivityPubSourceSubscription(userId: number, sourceId: number | string): Promise<IActivityPubSourceSubscriptionReport> {
			getResolvedActivityPubConfig(app);
			const subscription = await getActivityPubSourceSubscriptionRecord(models, userId, sourceId);
			if (!subscription) {
				throwActivityPubError('activitypub_source_subscription_not_found', 404);
			}
			await updateActivityPubSourceSubscriptionRecord(subscription, {
				status: ActivityPubSourceSubscriptionStatus.Removed
			});
			return getActivityPubSourceSubscriptionReportWithRemoteActor(models, subscription);
		}

		async getActivityPubSourceFeed(userId: number, sourceId: number | string, filters: IActivityPubSourceFeedFilters = {}, listParams: IListParams = {}): Promise<IActivityPubSourceFeedResponse> {
			getResolvedActivityPubConfig(app);
			const subscription = await getActivityPubSourceSubscriptionRecord(models, userId, sourceId);
			if (!subscription) {
				throwActivityPubError('activitypub_source_subscription_not_found', 404);
			}
			return getActivityPubSourceFeed(app, models, subscription, filters, listParams);
		}

		async refreshActivityPubSource(userId: number, sourceId: number | string, input: IActivityPubSourceRefreshInput = {}): Promise<IActivityPubSourceRefreshResult> {
			getResolvedActivityPubConfig(app);
			const subscription = await getActivityPubSourceSubscriptionRecord(models, userId, sourceId);
			if (!subscription) {
				throwActivityPubError('activitypub_source_subscription_not_found', 404);
			}
			const result = await refreshActivityPubSourceSubscription(models, subscription, input, options);
			await updateActivityPubSourceSubscriptionRecord(subscription, getActivityPubSourceRefreshUpdateData(result.errors));

			return {
				...result,
				source: await getActivityPubSourceSubscriptionReportWithRemoteActor(models, subscription)
			};
		}

		async queueActivityPubSourceRefresh(userId: number, sourceId: number | string, userApiKeyId: number | null = null, input: IActivityPubSourceRefreshQueueInput = {}) {
			getResolvedActivityPubConfig(app);
			const subscription = await getActivityPubSourceSubscriptionRecord(models, userId, sourceId);
			if (!subscription) {
				throwActivityPubError('activitypub_source_subscription_not_found', 404);
			}

			const queue = await app.ms.asyncOperation.addUniqueUserOperationQueue(
				userId,
				activityPubSourceRefreshQueueModuleName,
				userApiKeyId,
				getActivityPubSourceRefreshJobInput(subscription, input)
			);
			if (helpers.parseBoolean(input?.process, true)) {
				this.startActivityPubSourceRefreshQueueProcessing();
			}
			return queue;
		}

		startActivityPubSourceRefreshQueueProcessing(options: IActivityPubSourceRefreshQueueProcessOptions = {}) {
			const limit = helpers.parsePositiveInteger(options.limit, activityPubSourceRefreshQueueKickBatchLimit);
			void this.processActivityPubSourceRefreshQueue({limit}).catch((e) => {
				console.error('processActivityPubSourceRefreshQueue error', e);
			});
		}

		async processActivityPubSourceRefreshQueue(options: IActivityPubSourceRefreshQueueProcessOptions = {}) {
			getResolvedActivityPubConfig(app);
			const limit = helpers.parsePositiveInteger(options.limit, Number.MAX_SAFE_INTEGER);
			return app.ms.asyncOperation.processModuleOperationQueue(activityPubSourceRefreshQueueModuleName, {
				limit,
				getPayload: (waitingQueue) => parseActivityPubSourceRefreshJob(waitingQueue.inputJson),
				getAsyncOperationData: (_waitingQueue, job) => ({
					name: 'refresh-activitypub-source',
					channel: getActivityPubSourceRefreshJobChannel(job),
					percent: 5
				}),
				run: (waitingQueue, _asyncOperation, job) => this.refreshActivityPubSource(waitingQueue.userId, job.sourceId, job.input)
			});
		}

		async queueDueActivityPubSourceRefreshes(options: IActivityPubSourceRefreshPollOptions = {}) {
			getResolvedActivityPubConfig(app);
			const subscriptions = await getDueActivityPubSourceRefreshSubscriptions(models, options);
			for (const subscription of subscriptions) {
				await app.ms.asyncOperation.addUniqueUserOperationQueue(
					subscription.userId,
					activityPubSourceRefreshQueueModuleName,
					null,
					getActivityPubSourceRefreshJobInput(subscription, options.refreshInput || {})
				);
			}
			return {
				queued: subscriptions.length
			};
		}

		async markActivityPubSourceRead(userId: number, sourceId: number | string, input: IActivityPubSourceReadInput = {}): Promise<IActivityPubSourceSubscriptionReport> {
			getResolvedActivityPubConfig(app);
			const subscription = await getActivityPubSourceSubscriptionRecord(models, userId, sourceId);
			if (!subscription) {
				throwActivityPubError('activitypub_source_subscription_not_found', 404);
			}
			await updateActivityPubSourceSubscriptionRecord(subscription, {
				lastReadAt: getActivityPubSourceReadAt(input)
			});
			return getActivityPubSourceSubscriptionReportWithRemoteActor(models, subscription);
		}

		async followActivityPubSource(userId: number, sourceId: number | string, input: IActivityPubSourceFollowInput = {}, followOptions: IActivityPubOutboundFollowOptions = {}): Promise<IActivityPubSourceFollowResult> {
			getResolvedActivityPubConfig(app);
			const subscription = await getActivityPubSourceSubscriptionRecord(models, userId, sourceId);
			if (!subscription) {
				throwActivityPubError('activitypub_source_subscription_not_found', 404);
			}
			const groupName = getRequiredActivityPubSourceFollowGroupName(input);
			const follow = await this.followRemoteActor(groupName, subscription.sourceActorUrl, followOptions);
			return {
				source: await getActivityPubSourceSubscriptionReportWithRemoteActor(models, subscription),
				follow
			};
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
			return createActivityPubRemoteObjectPostFromRecord(app, models, userId, group, actorRecord, objectRecord, options);
		}

		async queueGroupRemoteObjectAttachmentBackups(groupName: string, remoteObjectId: number | string, userId: number, userApiKeyId: number | null = null, options: IActivityPubRemoteAttachmentBackupQueueOptions = {}) {
			getResolvedActivityPubConfig(app);
			const group = await getFederatableGroup(app, groupName);
			const actorRecord = await getGroupActorRecord(models, group);
			const objectRecord = actorRecord ? await getGroupRemoteObjectRecord(models, actorRecord, remoteObjectId) : null;
			if (!objectRecord) {
				throwActivityPubError('activitypub_remote_object_not_found', 404);
			}
			if (!await getActivityPubRemoteObjectImportedPost(app, objectRecord)) {
				throwActivityPubError('activitypub_remote_object_post_not_created', 400);
			}

			const queue = await app.ms.asyncOperation.addUniqueUserOperationQueue(
				userId,
				activityPubRemoteAttachmentBackupQueueModuleName,
				userApiKeyId,
				getActivityPubRemoteAttachmentBackupJobInput(groupName, objectRecord)
			);
			if (options.process !== false) {
				this.startRemoteAttachmentBackupQueueProcessing(options);
			}
			return queue;
		}

		startRemoteAttachmentBackupQueueProcessing(options: IActivityPubRemoteAttachmentBackupQueueProcessOptions = {}) {
			const limit = helpers.parsePositiveInteger(options.limit, activityPubRemoteAttachmentBackupQueueKickBatchLimit);
			void this.processRemoteAttachmentBackupQueue({limit}).catch((e) => {
				console.error('processActivityPubRemoteAttachmentBackupQueue error', e);
			});
		}

		async processRemoteAttachmentBackupQueue(options: IActivityPubRemoteAttachmentBackupQueueProcessOptions = {}) {
			if (activityPubRemoteAttachmentBackupQueueInProcess) {
				return {processed: 0};
			}

			activityPubRemoteAttachmentBackupQueueInProcess = true;
			let processed = 0;
			const limit = helpers.parsePositiveInteger(options.limit, Number.MAX_SAFE_INTEGER);

			try {
				while (processed < limit) {
					const waitingQueue = await prepareNextActivityPubRemoteAttachmentBackupQueue(app);
					if (!waitingQueue) {
						return {processed};
					}

					await processActivityPubRemoteAttachmentBackupQueueItem(app, models, waitingQueue);
					processed += 1;
				}
				return {processed};
			} finally {
				activityPubRemoteAttachmentBackupQueueInProcess = false;
			}
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

async function getActivityPubSourceResolveResult(models, input: IActivityPubSourceResolveInput, options: IActivityPubModuleOptions): Promise<IActivityPubSourceResolveResult> {
	const resolution = await getActivityPubSourceResolution(models, input, options);
	return getActivityPubSourceResolveResultFromResolution(resolution);
}

async function getActivityPubMigrationPreview(input: IActivityPubMigrationPreviewInput, options: IActivityPubModuleOptions): Promise<IActivityPubMigrationPreviewResult> {
	const context = await getActivityPubMigrationPreviewContext(input, options);
	return {
		...context.preview,
		sourceActorUrl: context.actor,
		sourceResource: context.lookup.sourceResource,
		bridgeProvider: getActivityPubMigrationPreviewBridgeProvider(input, context.lookup.sourceResource, context.actor),
		fetched: context.fetched,
		pages: context.pages,
		maxPages: context.maxPages,
		hasMore: context.hasMore,
		errors: context.errors
	};
}

async function importActivityPubMigration(
	app: IGeesomeApp,
	models,
	config: IResolvedActivityPubConfig,
	userId: number,
	input: IActivityPubMigrationImportInput,
	options: IActivityPubModuleOptions
): Promise<IActivityPubMigrationImportResult> {
	const resolution = await getActivityPubSourceResolution(models, input, options);
	const actorDocument = parseActivityPubJson(resolution.remoteActorRecord.rawJson);
	if (!actorDocument || typeof actorDocument !== 'object' || Array.isArray(actorDocument)) {
		throwActivityPubError('activitypub_migration_actor_document_invalid', 401);
	}
	const visibleContext = await getActivityPubMigrationVisibleImportContext(app, models, config, input, actorDocument);
	const context = await getActivityPubMigrationPreviewContext(input, options, {
		actorUrl: resolution.sourceActorUrl,
		sourceResource: resolution.sourceResource,
		actorDocument
	}, {
		ownershipVerified: Boolean(visibleContext),
		ownershipMethod: visibleContext?.ownershipMethod || null
	});
	const remoteObjectIds: number[] = [];
	const postIds: number[] = [];
	const moderationDecisions: IRemoteContentModerationDecision[] = [];
	let skipped = 0;
	const errors = [...context.errors];

	for (let index = 0; index < context.items.length; index += 1) {
		const previewItem = context.preview.list[index];
		if (previewItem?.importKind !== 'localPost') {
			skipped += 1;
			continue;
		}
		try {
			if (!isActivityPubMigrationPreviewItemImportable(previewItem, context, visibleContext, moderationDecisions)) {
				skipped += 1;
				continue;
			}
			const cacheInput = getActivityPubMigrationObjectCacheInput(resolution.remoteActorRecord, context.items[index]);
			if (!cacheInput) {
				skipped += 1;
				continue;
			}
			if (visibleContext) {
				cacheInput.localActorRecord = visibleContext.actorRecord;
			}
			const objectRecord = await syncRemoteActivityPubObject(models, cacheInput);
			remoteObjectIds.push(objectRecord.id);
			const postId = await createActivityPubMigrationVisiblePost(app, models, userId, input, visibleContext, objectRecord);
			if (postId) {
				postIds.push(postId);
			}
		} catch (e) {
			skipped += 1;
			errors.push(getActivityPubMigrationPreviewErrorMessage(e));
		}
	}

	return {
		...context.preview,
		sourceActorUrl: context.actor,
		sourceResource: resolution.sourceResource,
		bridgeProvider: resolution.bridgeProvider,
		fetched: context.fetched,
		pages: context.pages,
		maxPages: context.maxPages,
		hasMore: context.hasMore,
		errors,
		cached: remoteObjectIds.length,
		created: postIds.length,
		moderation: visibleContext ? getRemoteContentModerationSummary(moderationDecisions) : undefined,
		postIds,
		skipped,
		remoteObjectIds
	};
}

async function getActivityPubMigrationVisibleImportContext(
	app: IGeesomeApp,
	models,
	config: IResolvedActivityPubConfig,
	input: IActivityPubMigrationImportInput,
	actorDocument
): Promise<IActivityPubMigrationVisibleImportContext | null> {
	if (!isActivityPubMigrationVisibleImport(input)) {
		return null;
	}
	const ownershipMethod = getActivityPubMigrationVisibleImportOwnershipMethod(input, actorDocument);
	const group = await getFederatableGroup(app, getActivityPubMigrationVisibleImportGroupName(input));
	const actorRecord = await getOrCreateGroupActorRecord(app, models, config, group);
	return {
		group,
		actorRecord,
		moderationPolicy: getActivityPubMigrationImportModerationPolicy(input),
		ownershipMethod
	};
}

function isActivityPubMigrationPreviewItemImportable(
	previewItem: IActivityPubMigrationPreviewItem | undefined,
	context,
	visibleContext: IActivityPubMigrationVisibleImportContext | null,
	moderationDecisions: IRemoteContentModerationDecision[]
): boolean {
	if (!visibleContext) {
		return true;
	}
	const decision = evaluateRemoteContentModerationPolicy(visibleContext.moderationPolicy, {
		text: getActivityPubMigrationPreviewItemModerationText(previewItem),
		source: getActivityPubMigrationPreviewItemModerationSources(context, previewItem),
		groupName: visibleContext.group.name
	});
	moderationDecisions.push(decision);
	return isRemoteContentModerationDecisionImportable(decision);
}

async function createActivityPubMigrationVisiblePost(
	app: IGeesomeApp,
	models,
	userId: number,
	input: IActivityPubMigrationImportInput,
	visibleContext: IActivityPubMigrationVisibleImportContext | null,
	objectRecord
): Promise<number | null> {
	if (!visibleContext) {
		return null;
	}
	if (Number(objectRecord.localPostId || 0) > 0) {
		return null;
	}
	await setActivityPubObjectReviewStateRecord(models, {
		objectRecord,
		state: ActivityPubObjectReviewState.Accepted,
		reviewedByUserId: userId
	});
	const result = await createActivityPubRemoteObjectPostFromRecord(
		app,
		models,
		userId,
		visibleContext.group,
		visibleContext.actorRecord,
		objectRecord,
		{importRemoteAttachments: input.importRemoteAttachments}
	);
	return Number(result.post?.id || 0) || null;
}

async function getActivityPubMigrationPreviewContext(
	input: IActivityPubMigrationPreviewInput,
	options: IActivityPubModuleOptions,
	resolvedInput: {actorUrl?: string; sourceResource?: string; actorDocument?: any} = {},
	previewOptions: {ownershipVerified?: boolean; ownershipMethod?: ActivityPubMigrationOwnershipMethod} = {}
) {
	const lookup = resolvedInput.actorUrl
		? {actorUrl: resolvedInput.actorUrl, sourceResource: resolvedInput.sourceResource}
		: await getActivityPubSourceLookup(input, options);
	const actorDocument = resolvedInput.actorDocument || await getActivityPubMigrationPreviewActorDocument(lookup.actorUrl, options);
	const actor = getActivityPubMigrationPreviewActorUrl(lookup.actorUrl, actorDocument);
	const items = await getActivityPubMigrationPreviewItems(actorDocument, input, options);
	const ownershipProof = getActivityPubMigrationOwnershipProof(input, actorDocument);
	return {
		lookup,
		actorDocument,
		actor,
		items: items.list,
		preview: createActivityPubMigrationPreview({
			actor,
			actorDocument,
			items: items.list,
			claimed: helpers.parseBoolean(input?.claimed, false),
			ownershipVerified: previewOptions.ownershipVerified || ownershipProof.verified,
			ownershipMethod: previewOptions.ownershipMethod || ownershipProof.method
		}),
		fetched: items.fetched,
		pages: items.pages,
		maxPages: getActivityPubMigrationPreviewMaxPages(input),
		hasMore: items.hasMore,
		errors: items.errors
	};
}

async function getActivityPubMigrationPreviewActorDocument(actorUrl: string, options: IActivityPubModuleOptions) {
	const actorDocument = await fetchActivityPubSourceJson(actorUrl, options);
	if (!actorDocument || typeof actorDocument !== 'object' || Array.isArray(actorDocument)) {
		throwActivityPubError('activitypub_migration_actor_document_invalid', 401);
	}
	return actorDocument;
}

function getActivityPubMigrationPreviewActorUrl(actorUrl: string, actorDocument): string {
	return getOptionalBoundedString(actorDocument?.id, 700) || actorUrl;
}

async function getActivityPubMigrationPreviewItems(actorDocument, input: IActivityPubMigrationPreviewInput, options: IActivityPubModuleOptions) {
	const targetUrls = getActivityPubMigrationPreviewTargetUrls(actorDocument, input);
	const limit = getActivityPubMigrationPreviewLimit(input);
	const maxPages = getActivityPubMigrationPreviewMaxPages(input);
	const result = getEmptyActivityPubMigrationPreviewItemsResult();
	if (!targetUrls.length) {
		result.errors.push('activitypub_migration_preview_collection_not_found');
		return result;
	}
	for (const targetUrl of targetUrls) {
		if (result.fetched >= limit) {
			break;
		}
		await appendActivityPubMigrationPreviewCollectionItems(result, targetUrl, limit, maxPages, options);
	}
	return result;
}

async function appendActivityPubMigrationPreviewCollectionItems(result, targetUrl: string, limit: number, maxPages: number, options: IActivityPubModuleOptions): Promise<void> {
	try {
		const collectionResult = await fetchActivityPubSourceCollectionItemsWithState(targetUrl, options, limit - result.fetched, {maxPages});
		result.pages += collectionResult.pages;
		result.hasMore = result.hasMore || collectionResult.hasMore;
		for (const item of collectionResult.items) {
			if (result.fetched >= limit) {
				break;
			}
			result.fetched += 1;
			await appendActivityPubMigrationPreviewItem(result, item, options);
		}
	} catch (e) {
		result.errors.push(getActivityPubMigrationPreviewErrorMessage(e));
	}
}

async function appendActivityPubMigrationPreviewItem(result, item, options: IActivityPubModuleOptions): Promise<void> {
	try {
		const resolvedItem = await getActivityPubMigrationPreviewResolvedItem(item, options, result.errors);
		if (!resolvedItem) {
			return;
		}
		result.list.push(resolvedItem);
	} catch (e) {
		result.errors.push(getActivityPubMigrationPreviewErrorMessage(e));
	}
}

async function getActivityPubMigrationPreviewResolvedItem(item, options: IActivityPubModuleOptions, errors: string[]) {
	const itemJson = await getActivityPubMigrationPreviewReferencedJson(item, options);
	if (!itemJson) {
		return null;
	}
	const activityType = getActivityType(itemJson);
	if (activityType === 'Create' || activityType === 'Announce') {
		return getActivityPubMigrationPreviewResolvedActivity(itemJson, options, errors);
	}
	return itemJson;
}

async function getActivityPubMigrationPreviewResolvedActivity(activity, options: IActivityPubModuleOptions, errors: string[]) {
	let referencedObject;
	try {
		referencedObject = await getActivityPubMigrationPreviewReferencedJson(activity?.object, options);
	} catch (e) {
		errors.push(getActivityPubMigrationPreviewErrorMessage(e));
		return activity;
	}
	if (!referencedObject) {
		return activity;
	}
	return {
		...activity,
		object: referencedObject
	};
}

async function getActivityPubMigrationPreviewReferencedJson(value, options: IActivityPubModuleOptions) {
	if (typeof value === 'string' && value) {
		return fetchActivityPubSourceJson(value, options);
	}
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value;
	}
	return null;
}

function getActivityPubMigrationPreviewTargetUrls(actorDocument, input: IActivityPubMigrationPreviewInput): string[] {
	const targetUrls: string[] = [];
	if (helpers.parseBoolean(input?.includeFeatured, true)) {
		addActivityPubMigrationPreviewTargetUrl(targetUrls, actorDocument?.featured);
	}
	if (helpers.parseBoolean(input?.includeOutbox, true)) {
		addActivityPubMigrationPreviewTargetUrl(targetUrls, actorDocument?.outbox);
	}
	return [...new Set(targetUrls)];
}

function addActivityPubMigrationPreviewTargetUrl(targetUrls: string[], value): void {
	const targetUrl = sanitizeAbsoluteHref(value);
	if (targetUrl) {
		targetUrls.push(targetUrl);
	}
}

function getActivityPubMigrationPreviewLimit(input: IActivityPubMigrationPreviewInput): number {
	return Math.min(
		helpers.parsePositiveInteger(input?.limit, activityPubMigrationPreviewDefaultLimit),
		activityPubMigrationPreviewMaxLimit
	);
}

function getActivityPubMigrationPreviewMaxPages(input: IActivityPubMigrationPreviewInput): number {
	return Math.min(
		helpers.parsePositiveInteger(input?.maxPages, activityPubMigrationPreviewMaxPagesDefault),
		activityPubMigrationPreviewMaxPagesLimit
	);
}

function getEmptyActivityPubMigrationPreviewItemsResult() {
	return {
		list: [],
		fetched: 0,
		pages: 0,
		hasMore: false,
		errors: []
	};
}

function getActivityPubMigrationPreviewBridgeProvider(input: IActivityPubSourceResolveInput, sourceResource: string | undefined, actorUrl: string): string | undefined {
	return getActivityPubSourceBridgeProvider(input, sourceResource, {
		domain: getActivityPubUrlHost(actorUrl)
	});
}

function getActivityPubUrlHost(value: string): string | undefined {
	try {
		return new URL(value).host.toLowerCase();
	} catch (e) {
		return undefined;
	}
}

function getActivityPubMigrationPreviewErrorMessage(error): string {
	return getOptionalBoundedString(error?.message || String(error), 500) || 'activitypub_migration_preview_error';
}

function getActivityPubMigrationRelationReconcileListParams(input: IActivityPubMigrationRelationReconcileInput): IListParams {
	return helpers.prepareListParams({
		limit: input.limit === undefined ? activityPubSourceRefreshPollDefaultLimit : input.limit,
		sortBy: 'publishedAt',
		sortDir: 'DESC'
	}, activityPubMigrationRelationReconcileListParams);
}

async function getRequiredActivityPubMigrationRelationReconcileGroupId(app: IGeesomeApp, userId: number, input: IActivityPubMigrationRelationReconcileInput): Promise<number> {
	const groupId = Number(input?.groupId);
	if (Number.isFinite(groupId) && groupId > 0) {
		return Number((await app.ms.group.getLocalGroup(userId, Math.floor(groupId))).id);
	}
	const groupName = getOptionalBoundedString(input?.groupName, 200);
	if (groupName) {
		const group = await app.ms.group.getGroupByParams({name: groupName});
		if (group?.id) {
			await app.ms.group.getLocalGroup(userId, group.id);
			return Number(group.id);
		}
	}
	throwActivityPubError('activitypub_migration_reconcile_group_required', 400);
}

function getActivityPubMigrationRelationReconcilePostFilters(input: IActivityPubMigrationRelationReconcileInput) {
	const filters: any = {
		source: 'activityPub',
		sourcePostIdNe: null,
		cursorPublishedAt: input.cursorPublishedAt,
		cursorId: input.cursorId
	};
	const sourceChannelId = getOptionalActivityPubString(input.sourceChannelId);
	if (sourceChannelId) {
		filters.sourceChannelId = sourceChannelId;
	}
	return filters;
}

async function reconcileActivityPubMigrationPostRelations(
	app: IGeesomeApp,
	models,
	userId: number,
	postRefs: IPost[],
	input: IActivityPubMigrationRelationReconcileInput,
	listParams: IListParams
): Promise<IActivityPubMigrationRelationReconcileResult> {
	const state = getEmptyActivityPubMigrationRelationReconcileState(input);
	for (const postRef of postRefs) {
		state.checked += 1;
		try {
			const row = await getActivityPubMigrationRelationReconcileRow(app, models, userId, postRef, input);
			state.rows.push(row);
			if (!row.changes || Object.keys(row.changes).length === 0) {
				state.skipped += 1;
				continue;
			}
			if (!state.dryRun) {
				await app.ms.group.updatePost(userId, postRef.id, row.changes);
			}
			state.updated += 1;
		} catch (e) {
			state.failed += 1;
			appendActivityPubMigrationRelationError(state.errors, getActivityPubMigrationRelationError(postRef, getErrorMessage(e)));
		}
	}
	return {
		...state,
		nextCursor: helpers.getNextCursorFromRows(postRefs, listParams.limit, {
			valueField: 'publishedAt',
			idField: 'id'
		})
	};
}

function getEmptyActivityPubMigrationRelationReconcileState(input: IActivityPubMigrationRelationReconcileInput) {
	return {
		checked: 0,
		updated: 0,
		skipped: 0,
		failed: 0,
		dryRun: helpers.parseBoolean(input.dryRun, false),
		rows: [] as IActivityPubMigrationRelationReconcileRow[],
		errors: []
	};
}

async function getActivityPubMigrationRelationReconcileRow(
	app: IGeesomeApp,
	models,
	userId: number,
	postRef: IPost,
	input: IActivityPubMigrationRelationReconcileInput
): Promise<IActivityPubMigrationRelationReconcileRow> {
	const relationState = getEmptyActivityPubMigrationRelationState(postRef);
	const objectRecord = await getActivityPubMigrationRelationPostObjectRecord(models, postRef);
	if (!objectRecord) {
		appendActivityPubMigrationRelationReason(relationState, 'activitypub_migration_relation_object_missing');
		return getActivityPubMigrationRelationReconcileRowResult(postRef, relationState);
	}
	const object = getActivityPubMigrationRelationObject(objectRecord);
	if (!object) {
		appendActivityPubMigrationRelationReason(relationState, 'activitypub_migration_relation_object_invalid');
		return getActivityPubMigrationRelationReconcileRowResult(postRef, relationState);
	}
	await appendActivityPubMigrationReplyRelationChange(app, models, userId, postRef, object, input, relationState);
	await appendActivityPubMigrationQuoteRelationChange(models, postRef, object, input, relationState);
	return getActivityPubMigrationRelationReconcileRowResult(postRef, relationState);
}

function getEmptyActivityPubMigrationRelationState(postRef: IPost) {
	return {
		changes: {} as {replyToId?: number | null; repostOfId?: number | null},
		reasons: [] as string[],
		originalReplyToId: getOptionalPositiveActivityPubInteger(postRef.replyToId),
		originalRepostOfId: getOptionalPositiveActivityPubInteger(postRef.repostOfId)
	};
}

async function appendActivityPubMigrationReplyRelationChange(
	app: IGeesomeApp,
	models,
	userId: number,
	postRef: IPost,
	object,
	input: IActivityPubMigrationRelationReconcileInput,
	relationState
): Promise<void> {
	if (!shouldReconcileActivityPubMigrationRelation(postRef.replyToId, input)) {
		return appendActivityPubMigrationRelationReason(relationState, 'activitypub_migration_reply_already_set');
	}
	const targetObjectId = getActivityPubMigrationReplyTargetId(object);
	if (!targetObjectId) {
		return appendActivityPubMigrationRelationReason(relationState, 'activitypub_migration_reply_target_missing');
	}
	const target = await getActivityPubMigrationRelationTarget(models, postRef, targetObjectId, input);
	if (!target.post) {
		return appendActivityPubMigrationRelationReason(relationState, target.reason);
	}
	if (!await app.ms.group.canReplyToPost(userId, target.post.id)) {
		return appendActivityPubMigrationRelationReason(relationState, 'activitypub_migration_reply_not_permitted');
	}
	relationState.changes.replyToId = target.post.id;
}

async function appendActivityPubMigrationQuoteRelationChange(
	models,
	postRef: IPost,
	object,
	input: IActivityPubMigrationRelationReconcileInput,
	relationState
): Promise<void> {
	if (!shouldReconcileActivityPubMigrationRelation(postRef.repostOfId, input)) {
		return appendActivityPubMigrationRelationReason(relationState, 'activitypub_migration_quote_already_set');
	}
	const targetObjectId = getActivityPubMigrationQuoteTargetId(object);
	if (!targetObjectId) {
		return appendActivityPubMigrationRelationReason(relationState, 'activitypub_migration_quote_target_missing');
	}
	const target = await getActivityPubMigrationRelationTarget(models, postRef, targetObjectId, input);
	if (!target.post) {
		return appendActivityPubMigrationRelationReason(relationState, target.reason);
	}
	relationState.changes.repostOfId = target.post.id;
}

async function getActivityPubMigrationRelationPostObjectRecord(models, postRef: IPost) {
	const remoteObjectId = getActivityPubMigrationRemoteObjectRecordId(postRef.sourcePostId);
	if (remoteObjectId) {
		const objectRecord = await models.ActivityPubObject.findOne({
			where: {
				id: remoteObjectId,
				origin: ActivityPubObjectOrigin.Remote
			}
		});
		if (objectRecord) {
			return objectRecord;
		}
	}
	const sourceObjectId = getOptionalActivityPubString(getPostActivityPubProperties(postRef)?.objectId);
	if (!sourceObjectId) {
		return null;
	}
	return models.ActivityPubObject.findOne({
		where: {
			objectId: sourceObjectId,
			origin: ActivityPubObjectOrigin.Remote
		}
	});
}

function getActivityPubMigrationRelationObject(objectRecord) {
	const rawObject = parseActivityPubJson(String(objectRecord?.rawJson || '{}'));
	if (!rawObject || typeof rawObject !== 'object' || Array.isArray(rawObject)) {
		return null;
	}
	if (rawObject.object && typeof rawObject.object === 'object' && !Array.isArray(rawObject.object)) {
		return rawObject.object;
	}
	return rawObject;
}

function shouldReconcileActivityPubMigrationRelation(existingPostId: number | string | null | undefined, input: IActivityPubMigrationRelationReconcileInput): boolean {
	return helpers.parseBoolean(input.force, false) || !getOptionalPositiveActivityPubInteger(existingPostId);
}

function getActivityPubMigrationReplyTargetId(object): string | null {
	return getActivityPubMigrationRelationReferenceId(object?.inReplyTo);
}

function getActivityPubMigrationQuoteTargetId(object): string | null {
	return getActivityPubMigrationRelationReferenceId(
		object?.quoteUrl,
		object?.quoteUri,
		object?.quote,
		object?._misskey_quote
	);
}

async function getActivityPubMigrationRelationTarget(models, postRef: IPost, targetObjectId: string, input: IActivityPubMigrationRelationReconcileInput) {
	const targetObjects = await getActivityPubMigrationRelationTargetObjects(models, targetObjectId);
	if (!targetObjects.length) {
		return {post: null, reason: 'activitypub_migration_relation_target_missing'};
	}
	const sameGroupTarget = await getSingleActivityPubMigrationRelationTarget(models, postRef, targetObjects, {sameGroup: true});
	if (sameGroupTarget.post || sameGroupTarget.reason === 'activitypub_migration_relation_target_ambiguous') {
		return sameGroupTarget;
	}
	if (!helpers.parseBoolean(input.allowCrossGroup, true)) {
		return {post: null, reason: 'activitypub_migration_relation_target_missing'};
	}
	return getSingleActivityPubMigrationRelationTarget(models, postRef, targetObjects, {sameGroup: false});
}

async function getActivityPubMigrationRelationTargetObjects(models, targetObjectId: string) {
	return models.ActivityPubObject.findAll({
		where: {
			objectId: targetObjectId
		},
		order: [['id', 'ASC']],
		limit: 20
	});
}

async function getSingleActivityPubMigrationRelationTarget(models, postRef: IPost, targetObjects: any[], options: {sameGroup: boolean}) {
	const where = getActivityPubMigrationRelationTargetWhere(postRef, targetObjects, options);
	if (!where) {
		return {post: null, reason: 'activitypub_migration_relation_target_missing'};
	}
	const targets = await models.Post.findAll({
		where,
		order: [['publishedAt', 'ASC'], ['id', 'ASC']],
		limit: 2
	});
	if (targets.length === 1) {
		return {post: targets[0], reason: null};
	}
	if (targets.length > 1) {
		return {post: null, reason: 'activitypub_migration_relation_target_ambiguous'};
	}
	return {post: null, reason: 'activitypub_migration_relation_target_missing'};
}

function getActivityPubMigrationRelationTargetWhere(postRef: IPost, targetObjects: any[], options: {sameGroup: boolean}) {
	const identityFilters = getActivityPubMigrationRelationTargetIdentityFilters(targetObjects);
	if (!identityFilters.length) {
		return null;
	}
	return {
		groupId: options.sameGroup ? postRef.groupId : {[Op.ne]: postRef.groupId},
		status: PostStatus.Published,
		isDeleted: false,
		[Op.and]: [
			{id: {[Op.ne]: postRef.id}},
			{[Op.or]: identityFilters}
		]
	};
}

function getActivityPubMigrationRelationTargetIdentityFilters(targetObjects: any[]) {
	const remoteSourcePostIds = targetObjects
		.filter(objectRecord => objectRecord?.origin === ActivityPubObjectOrigin.Remote)
		.map(objectRecord => getOptionalPositiveActivityPubInteger(objectRecord?.id))
		.filter(id => id)
		.map(id => `remoteObject:${id}`);
	const localPostIds = targetObjects
		.map(objectRecord => getOptionalPositiveActivityPubInteger(objectRecord?.localPostId))
		.filter(id => id);
	const filters: any[] = [];
	if (remoteSourcePostIds.length) {
		filters.push({
			source: 'activityPub',
			sourcePostId: {[Op.in]: remoteSourcePostIds}
		});
	}
	if (localPostIds.length) {
		filters.push({
			id: {[Op.in]: localPostIds}
		});
	}
	return filters;
}

function getActivityPubMigrationRelationReconcileRowResult(postRef: IPost, relationState): IActivityPubMigrationRelationReconcileRow {
	const changes = getNonEmptyActivityPubMigrationRelationChanges(relationState.changes);
	if (changes) {
		return {
			postId: Number(postRef.id),
			sourcePostId: getOptionalActivityPubString(postRef.sourcePostId),
			replyToId: relationState.originalReplyToId,
			repostOfId: relationState.originalRepostOfId,
			updated: true,
			changes
		};
	}
	return {
		postId: Number(postRef.id),
		sourcePostId: getOptionalActivityPubString(postRef.sourcePostId),
		replyToId: relationState.originalReplyToId,
		repostOfId: relationState.originalRepostOfId,
		skipped: true,
		reason: getActivityPubMigrationRelationSkipReason(relationState.reasons)
	};
}

function getNonEmptyActivityPubMigrationRelationChanges(changes: {replyToId?: number | null; repostOfId?: number | null}) {
	const result: any = {};
	if (changes.replyToId) {
		result.replyToId = changes.replyToId;
	}
	if (changes.repostOfId) {
		result.repostOfId = changes.repostOfId;
	}
	return Object.keys(result).length ? result : null;
}

function appendActivityPubMigrationRelationReason(relationState, reason: string): void {
	if (!relationState.reasons.includes(reason)) {
		relationState.reasons.push(reason);
	}
}

function getActivityPubMigrationRelationSkipReason(reasons: string[]): string {
	const actionableReason = reasons.find(reason => !reason.endsWith('_missing') && !reason.endsWith('_already_set'));
	return actionableReason || reasons[0] || 'activitypub_migration_relation_change_missing';
}

function getActivityPubMigrationRelationError(postRef: IPost, message: string) {
	return {
		postId: Number(postRef?.id) || undefined,
		sourcePostId: getOptionalActivityPubString(postRef?.sourcePostId),
		message
	};
}

function appendActivityPubMigrationRelationError(errors, error): void {
	if (errors.length < 20) {
		errors.push(error);
	}
}

function getActivityPubMigrationRemoteObjectRecordId(sourcePostId: any): number | null {
	const match = getOptionalActivityPubString(sourcePostId)?.match(/^remoteObject:(\d+)$/);
	if (!match) {
		return null;
	}
	const id = Number(match[1]);
	return Number.isFinite(id) && id > 0 ? id : null;
}

function getActivityPubMigrationRelationReferenceId(...values: any[]): string | null {
	for (const value of values) {
		const referenceId = getActivityPubMigrationRelationSingleReferenceId(value);
		if (referenceId) {
			return referenceId;
		}
	}
	return null;
}

function getActivityPubMigrationRelationSingleReferenceId(value: any): string | null {
	if (typeof value === 'string') {
		return getOptionalActivityPubString(value);
	}
	if (Array.isArray(value)) {
		return getActivityPubMigrationRelationReferenceId(...value);
	}
	if (value && typeof value === 'object') {
		return getActivityPubMigrationRelationReferenceId(value.id, value.href, value.url);
	}
	return null;
}

function getPostActivityPubProperties(post: IPost) {
	return parseActivityPubJson(String(post?.propertiesJson || '{}'))?.activityPub || {};
}

function getOptionalActivityPubString(value: any): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed || null;
}

function getOptionalPositiveActivityPubInteger(value: any): number | null {
	const id = Number(value);
	if (!Number.isFinite(id) || id <= 0) {
		return null;
	}
	return Math.floor(id);
}

function isActivityPubMigrationVisibleImport(input: IActivityPubMigrationImportInput | IActivityPubMigrationImportQueueInput): boolean {
	return helpers.parseBoolean(input?.createPosts, false);
}

function assertActivityPubMigrationVisibleImportCanStart(input: IActivityPubMigrationImportInput | IActivityPubMigrationImportQueueInput): void {
	if (!helpers.parseBoolean(input?.claimed, false)) {
		throwActivityPubError('activitypub_migration_visible_import_claim_required', 400);
	}
	getActivityPubMigrationVisibleImportGroupName(input);
	if (isActivityPubMigrationVisibleImportAdminApproved(input)) {
		return;
	}
	if (getActivityPubMigrationOwnershipProofToken(input)) {
		return;
	}
	if (input?.ownershipProofToken !== undefined) {
		throwActivityPubError('activitypub_migration_ownership_proof_token_invalid', 400);
	}
	throwActivityPubError('activitypub_migration_visible_import_ownership_required', 403);
}

function isActivityPubMigrationVisibleImportAdminApproved(input: IActivityPubMigrationImportInput | IActivityPubMigrationImportQueueInput): boolean {
	return helpers.parseBoolean(input?.ownershipApproved, false);
}

function getActivityPubMigrationVisibleImportOwnershipMethod(
	input: IActivityPubMigrationImportInput | IActivityPubMigrationImportQueueInput,
	actorDocument
): Exclude<ActivityPubMigrationOwnershipMethod, null> {
	assertActivityPubMigrationVisibleImportCanStart(input);
	if (isActivityPubMigrationVisibleImportAdminApproved(input)) {
		return 'admin';
	}
	if (isActivityPubMigrationOwnershipProofVerified(input, actorDocument)) {
		return 'profileToken';
	}
	throwActivityPubError('activitypub_migration_visible_import_ownership_required', 403);
}

function getActivityPubMigrationOwnershipProof(
	input: IActivityPubMigrationPreviewInput,
	actorDocument
): {verified: boolean; method: ActivityPubMigrationOwnershipMethod} {
	if (isActivityPubMigrationOwnershipProofVerified(input, actorDocument)) {
		return {verified: true, method: 'profileToken'};
	}
	return {verified: false, method: null};
}

function isActivityPubMigrationOwnershipProofVerified(input: IActivityPubMigrationPreviewInput, actorDocument): boolean {
	const token = getActivityPubMigrationOwnershipProofToken(input);
	if (!token) {
		return false;
	}
	return getActivityPubMigrationOwnershipProofValues(actorDocument).some((value) => value.includes(token));
}

function getActivityPubMigrationOwnershipProofToken(input: IActivityPubMigrationPreviewInput | IActivityPubMigrationImportQueueInput): string | null {
	const value = input?.ownershipProofToken;
	if (typeof value !== 'string') {
		return null;
	}
	const token = value.trim();
	if (!isValidActivityPubMigrationOwnershipProofToken(token)) {
		return null;
	}
	return token;
}

function isValidActivityPubMigrationOwnershipProofToken(token: string): boolean {
	return Boolean(
		token.length >= activityPubMigrationOwnershipProofTokenMinLength
		&& token.length <= activityPubMigrationOwnershipProofTokenMaxLength
		&& !/\s/.test(token)
	);
}

function getActivityPubMigrationOwnershipProofValues(actorDocument): string[] {
	const values: string[] = [];
	appendActivityPubMigrationOwnershipProofValue(values, actorDocument);
	return values;
}

function appendActivityPubMigrationOwnershipProofValue(values: string[], value, depth: number = 0): void {
	if (values.length >= activityPubMigrationOwnershipProofValueMaxCount) {
		return;
	}
	if (value === null || value === undefined) {
		return;
	}
	if (typeof value === 'string') {
		appendActivityPubMigrationOwnershipProofString(values, value);
		return;
	}
	if (depth >= activityPubMigrationOwnershipProofMaxDepth) {
		return;
	}
	if (Array.isArray(value)) {
		appendActivityPubMigrationOwnershipProofArray(values, value, depth);
		return;
	}
	if (typeof value === 'object') {
		appendActivityPubMigrationOwnershipProofObject(values, value, depth);
	}
}

function appendActivityPubMigrationOwnershipProofString(values: string[], value: string): void {
	const trimmed = value.trim();
	if (!trimmed) {
		return;
	}
	values.push(trimmed.slice(0, activityPubMigrationOwnershipProofValueMaxLength));
}

function appendActivityPubMigrationOwnershipProofArray(values: string[], list, depth: number): void {
	for (const item of list) {
		appendActivityPubMigrationOwnershipProofValue(values, item, depth + 1);
		if (values.length >= activityPubMigrationOwnershipProofValueMaxCount) {
			return;
		}
	}
}

function appendActivityPubMigrationOwnershipProofObject(values: string[], value, depth: number): void {
	for (const key of getActivityPubMigrationOwnershipProofObjectKeys()) {
		appendActivityPubMigrationOwnershipProofValue(values, value[key], depth + 1);
		if (values.length >= activityPubMigrationOwnershipProofValueMaxCount) {
			return;
		}
	}
}

function getActivityPubMigrationOwnershipProofObjectKeys(): string[] {
	return [
		'id',
		'url',
		'href',
		'name',
		'preferredUsername',
		'summary',
		'content',
		'value',
		'alsoKnownAs',
		'attachment',
		'tag'
	];
}

function getActivityPubMigrationVisibleImportGroupName(input: IActivityPubMigrationImportInput | IActivityPubMigrationImportQueueInput): string {
	const groupName = getOptionalBoundedString(input?.groupName, 200);
	if (!groupName) {
		throwActivityPubError('activitypub_migration_visible_import_group_name_required', 400);
	}
	return groupName;
}

function getActivityPubMigrationImportModerationPolicy(input: IActivityPubMigrationImportInput | IActivityPubMigrationImportQueueInput): IRemoteContentModerationPolicy {
	const policyInput = input?.moderationPolicy || {};
	return normalizeRemoteContentModerationPolicy({
		mode: input?.moderationMode ?? policyInput.mode,
		rules: input?.moderationRules ?? policyInput.rules
	});
}

function getActivityPubMigrationPreviewItemModerationText(previewItem: IActivityPubMigrationPreviewItem | undefined): string {
	const preview = previewItem?.preview || {};
	return [
		preview.name,
		preview.contentText,
		preview.summaryText,
		preview.url
	].filter(Boolean).join('\n');
}

function getActivityPubMigrationPreviewItemModerationSources(context, previewItem: IActivityPubMigrationPreviewItem | undefined): string[] {
	return [
		context?.actor,
		previewItem?.actor,
		previewItem?.attributedTo,
		previewItem?.activityId,
		previewItem?.objectId
	].filter(Boolean);
}

function getActivityPubMigrationObjectCacheInput(remoteActorRecord, item) {
	const cacheData = getActivityPubMigrationObjectCacheData(remoteActorRecord, item);
	if (!cacheData) {
		return null;
	}
	if (!isActivityPubMigrationCacheObjectFromActor(remoteActorRecord, cacheData.activity, cacheData.object)) {
		return null;
	}
	if (!isActivityPubMigrationCacheObjectPublic(cacheData.activity, cacheData.object)) {
		return null;
	}
	return {
		remoteActorRecord,
		activity: cacheData.activity,
		object: cacheData.object
	};
}

function getActivityPubMigrationObjectCacheData(remoteActorRecord, item) {
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		return null;
	}
	if (getActivityType(item) === 'Create') {
		const object = getActivityPubMigrationCacheObject(item.object);
		return object ? {activity: item, object} : null;
	}
	const object = getActivityPubMigrationCacheObject(item);
	if (!object) {
		return null;
	}
	return {
		activity: buildActivityPubMigrationCacheCreateActivity(remoteActorRecord, object),
		object
	};
}

function getActivityPubMigrationCacheObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	if (!isActivityPubReviewObjectType(value.type)) {
		return null;
	}
	return value;
}

function buildActivityPubMigrationCacheCreateActivity(remoteActorRecord, object) {
	const objectId = getRequiredObjectId(object, 'activitypub_migration_import_object_id_required');
	return {
		'@context': 'https://www.w3.org/ns/activitystreams',
		id: `${objectId}#geesome-migration-import-create`,
		type: 'Create',
		actor: remoteActorRecord.actorUrl,
		to: getActivityPubReferenceValues(object?.to),
		cc: getActivityPubReferenceValues(object?.cc),
		published: object.published,
		object
	};
}

function isActivityPubMigrationCacheObjectFromActor(remoteActorRecord, activity, object): boolean {
	const activityActor = getActivityActor(activity);
	if (activityActor && activityActor !== remoteActorRecord.actorUrl) {
		return false;
	}
	const objectActors = [
		...getActivityPubReferenceValues(object?.attributedTo),
		...getActivityPubReferenceValues(object?.actor)
	];
	if (objectActors.length) {
		return objectActors.includes(remoteActorRecord.actorUrl);
	}
	return activityActor === remoteActorRecord.actorUrl;
}

function isActivityPubMigrationCacheObjectPublic(activity, object): boolean {
	return [
		...getActivityPubReferenceValues(activity?.to),
		...getActivityPubReferenceValues(activity?.cc),
		...getActivityPubReferenceValues(object?.to),
		...getActivityPubReferenceValues(object?.cc)
	].includes(activityPubPublicCollection);
}

function getActivityPubReferenceValues(value): string[] {
	if (typeof value === 'string') {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.flatMap(item => getActivityPubReferenceValues(item));
	}
	if (typeof value?.id === 'string' && value.id) {
		return [value.id];
	}
	return [];
}

async function getActivityPubSourceSubscriptionList(app: IGeesomeApp, models, userId: number, filters: IActivityPubSourceSubscriptionFilters, listParams: IListParams): Promise<IActivityPubSourceSubscriptionListResponse> {
	const preparedListParams = {
		...listParams
	};
	app.ms.database.setDefaultListParamsValues(preparedListParams, activityPubSourceSubscriptionListParams);
	const subscriptionPage = await models.ActivityPubSourceSubscription.findAndCountAll({
		where: getActivityPubSourceSubscriptionWhere(userId, filters),
		order: [[preparedListParams.sortBy, getListSortDirection(preparedListParams)]],
		limit: preparedListParams.limit,
		offset: preparedListParams.offset
	});
	const remoteActors = await getRemoteActorRecordsByIds(models, subscriptionPage.rows.map((subscription) => subscription.remoteActorId));
	const remoteActorById = getRemoteActorById(remoteActors);

	return {
		list: subscriptionPage.rows.map((subscription) => getActivityPubSourceSubscriptionReport(subscription, remoteActorById)),
		total: getListPageCount(subscriptionPage.count)
	};
}

async function upsertActivityPubSourceSubscription(models, userId: number, input: IActivityPubSourceSubscriptionInput, resolution) {
	const subscriptionData = getActivityPubSourceSubscriptionData(userId, input, resolution);
	const existingSubscription = await getActivityPubSourceSubscriptionByRemoteActorId(models, userId, resolution.remoteActorRecord.id);
	if (existingSubscription) {
		await updateActivityPubSourceSubscriptionRecord(
			existingSubscription,
			getExistingActivityPubSourceSubscriptionUpdateData(subscriptionData, resolution)
		);
		return existingSubscription;
	}

	try {
		return await models.ActivityPubSourceSubscription.create(subscriptionData);
	} catch (e) {
		if (!isActivityPubSourceSubscriptionUniqueError(e)) {
			throw e;
		}
		const createdSubscription = await getActivityPubSourceSubscriptionByRemoteActorId(models, userId, resolution.remoteActorRecord.id);
		if (!createdSubscription) {
			throw e;
		}
		await updateActivityPubSourceSubscriptionRecord(
			createdSubscription,
			getExistingActivityPubSourceSubscriptionUpdateData(subscriptionData, resolution)
		);
		return createdSubscription;
	}
}

async function getActivityPubSourceFeed(app: IGeesomeApp, models, subscription, filters: IActivityPubSourceFeedFilters, listParams: IListParams): Promise<IActivityPubSourceFeedResponse> {
	const preparedListParams = {
		...listParams
	};
	app.ms.database.setDefaultListParamsValues(preparedListParams, activityPubRemoteObjectListParams);
	const where = await getActivityPubSourceFeedWhere(models, subscription, filters);
	const cursor = helpers.addCursorWhere(where, filters);
	const objectRows = await models.ActivityPubObject.findAll({
		where,
		order: helpers.getCursorListOrder(cursor, preparedListParams),
		limit: preparedListParams.limit,
		offset: helpers.getCursorListOffset(cursor, preparedListParams.offset)
	});
	const remoteActors = await getRemoteActorRecordsByIds(models, objectRows.map((object) => object.remoteActorId));
	const remoteActorById = getRemoteActorById(remoteActors);
	const reviews = await getActivityPubObjectReviewRecordsByObjectIds(models, objectRows.map((object) => object.id));
	const reviewByObjectId = getActivityPubObjectReviewByObjectId(reviews);
	const source = await getActivityPubSourceSubscriptionReportWithRemoteActor(models, subscription);

	return {
		source,
		list: objectRows.map((object) => getActivityPubSourceFeedItem(subscription, object, remoteActorById, reviewByObjectId)),
		total: helpers.shouldIncludeListTotal(preparedListParams, cursor) ? await models.ActivityPubObject.count({where}) : null,
		nextCursor: helpers.getNextListCursor(cursor, objectRows, preparedListParams.limit)
	};
}

async function getActivityPubSourceResolution(models, input: IActivityPubSourceResolveInput = {}, options: IActivityPubModuleOptions) {
	const lookup = await getActivityPubSourceLookup(input, options);
	const remoteActorRecord = await getActivityPubRemoteActorRecord(models, lookup.actorUrl, options);

	return {
		sourceResource: lookup.sourceResource,
		sourceActorUrl: remoteActorRecord.actorUrl,
		bridgeProvider: getActivityPubSourceBridgeProvider(input, lookup.sourceResource, remoteActorRecord),
		remoteActorRecord
	};
}

async function getActivityPubSourceLookup(input: IActivityPubSourceResolveInput, options: IActivityPubModuleOptions) {
	const actorUrl = getOptionalActivityPubSourceActorUrl(input);
	if (actorUrl) {
		return {
			actorUrl,
			sourceResource: getOptionalActivityPubSourceResource(input)
		};
	}

	const sourceResource = getRequiredActivityPubSourceResource(input);
	return {
		actorUrl: await getActivityPubSourceActorUrlByResource(sourceResource, options),
		sourceResource
	};
}

async function getActivityPubSourceActorUrlByResource(resource: string, options: IActivityPubModuleOptions): Promise<string> {
	const domain = getActivityPubSourceResourceDomain(resource);
	const webFinger = await fetchActivityPubSourceWebFinger(resource, domain, options);
	return getRequiredActivityPubWebFingerActorUrl(webFinger);
}

async function fetchActivityPubSourceWebFinger(resource: string, domain: string, options: IActivityPubModuleOptions): Promise<any> {
	if (options.fetchActivityPubWebFinger) {
		return options.fetchActivityPubWebFinger(resource, domain);
	}
	if (typeof globalThis.fetch !== 'function') {
		throwActivityPubError('activitypub_source_webfinger_fetch_unavailable', 501);
	}

	let response;
	try {
		response = await globalThis.fetch(`https://${domain}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`, {
			headers: {
				Accept: 'application/jrd+json, application/json'
			}
		});
	} catch (e) {
		throwActivityPubError('activitypub_source_webfinger_fetch_failed', 401);
	}
	if (!response.ok) {
		throwActivityPubError(`activitypub_source_webfinger_fetch_failed:${response.status}`, 401);
	}
	try {
		return await response.json();
	} catch (e) {
		throwActivityPubError('activitypub_source_webfinger_json_invalid', 401);
	}
}

function getActivityPubSourceResolveResultFromResolution(resolution): IActivityPubSourceResolveResult {
	const result: IActivityPubSourceResolveResult = {
		sourceActorUrl: resolution.sourceActorUrl,
		remoteActor: getActivityPubRemoteActorReport(resolution.remoteActorRecord)
	};
	if (resolution.sourceResource) {
		result.sourceResource = resolution.sourceResource;
	}
	if (resolution.bridgeProvider) {
		result.bridgeProvider = resolution.bridgeProvider;
	}
	return result;
}

function getActivityPubSourceSubscriptionData(userId: number, input: IActivityPubSourceSubscriptionInput, resolution) {
	return {
		userId,
		remoteActorId: resolution.remoteActorRecord.id,
		sourceResource: resolution.sourceResource || null,
		sourceActorUrl: resolution.sourceActorUrl,
		bridgeProvider: resolution.bridgeProvider || null,
		displayName: getActivityPubSourceDisplayName(input, resolution.remoteActorRecord),
		status: ActivityPubSourceSubscriptionStatus.Active,
		lastError: null
	};
}

function getExistingActivityPubSourceSubscriptionUpdateData(subscriptionData, resolution) {
	const updateData = {
		...subscriptionData
	};
	if (!resolution.sourceResource) {
		delete updateData.sourceResource;
	}
	if (!resolution.bridgeProvider) {
		delete updateData.bridgeProvider;
	}
	return updateData;
}

function getActivityPubSourceSubscriptionUpdateData(input: IActivityPubSourceSubscriptionUpdateInput) {
	const updateData = {} as any;
	const displayName = getOptionalBoundedString(input?.displayName, 200);
	if (displayName !== undefined) {
		updateData.displayName = displayName || null;
	}
	if (input?.status !== undefined) {
		updateData.status = getRequiredMutableActivityPubSourceSubscriptionStatus(input.status);
	}
	return updateData;
}

async function updateActivityPubSourceSubscriptionRecord(subscription, updateData): Promise<void> {
	const changedData = getChangedActivityPubSourceSubscriptionData(subscription, updateData);
	if (!Object.keys(changedData).length) {
		return;
	}
	await subscription.update(changedData);
}

function getChangedActivityPubSourceSubscriptionData(subscription, updateData) {
	const changedData = {};
	Object.keys(updateData).forEach((key) => {
		if (subscription[key] === updateData[key]) {
			return;
		}
		changedData[key] = updateData[key];
	});
	return changedData;
}

function getActivityPubSourceSubscriptionWhere(userId: number, filters: IActivityPubSourceSubscriptionFilters = {}) {
	const where: any = {
		userId
	};
	if (isKnownActivityPubSourceSubscriptionStatus(filters.status)) {
		where.status = filters.status;
	} else {
		where.status = {
			[Op.notIn]: [ActivityPubSourceSubscriptionStatus.Removed]
		};
	}
	const remoteActorId = helpers.normalizeUniqueIds(filters.remoteActorId)[0];
	if (remoteActorId) {
		where.remoteActorId = remoteActorId;
	}
	return where;
}

async function getActivityPubSourceSubscriptionRecord(models, userId: number, sourceId: number | string) {
	const id = helpers.normalizeUniqueIds(sourceId)[0];
	if (!id) {
		return null;
	}
	return models.ActivityPubSourceSubscription.findOne({
		where: {
			id,
			userId,
			status: {
				[Op.notIn]: [ActivityPubSourceSubscriptionStatus.Removed]
			}
		}
	});
}

async function getActivityPubSourceSubscriptionByRemoteActorId(models, userId: number, remoteActorId: number) {
	return models.ActivityPubSourceSubscription.findOne({
		where: {
			userId,
			remoteActorId
		}
	});
}

async function getActivityPubSourceSubscriptionReportWithRemoteActor(models, subscription): Promise<IActivityPubSourceSubscriptionReport> {
	const remoteActors = await getRemoteActorRecordsByIds(models, [subscription.remoteActorId]);
	return getActivityPubSourceSubscriptionReport(subscription, getRemoteActorById(remoteActors));
}

async function getDueActivityPubSourceRefreshSubscriptions(models, options: IActivityPubSourceRefreshPollOptions) {
	const limit = getActivityPubSourceRefreshPollLimit(options);
	const neverRefreshedSubscriptions = await getNeverRefreshedActivityPubSourceSubscriptions(models, limit);
	if (neverRefreshedSubscriptions.length >= limit) {
		return neverRefreshedSubscriptions;
	}
	const staleSubscriptions = await getStaleActivityPubSourceSubscriptions(models, options, limit - neverRefreshedSubscriptions.length);
	return [
		...neverRefreshedSubscriptions,
		...staleSubscriptions
	];
}

function getNeverRefreshedActivityPubSourceSubscriptions(models, limit: number) {
	return models.ActivityPubSourceSubscription.findAll({
		where: {
			status: ActivityPubSourceSubscriptionStatus.Active,
			lastRefreshRequestedAt: null
		},
		order: [['id', 'ASC']],
		limit
	});
}

function getStaleActivityPubSourceSubscriptions(models, options: IActivityPubSourceRefreshPollOptions, limit: number) {
	const cutoff = getActivityPubSourceRefreshPollCutoff(options);
	return models.ActivityPubSourceSubscription.findAll({
		where: {
			status: ActivityPubSourceSubscriptionStatus.Active,
			lastRefreshRequestedAt: {[Op.lt]: cutoff}
		},
		order: [['lastRefreshRequestedAt', 'ASC'], ['id', 'ASC']],
		limit
	});
}

function getActivityPubSourceRefreshPollCutoff(options: IActivityPubSourceRefreshPollOptions): Date {
	return new Date(getActivityPubSourceRefreshPollNow(options).getTime() - getActivityPubSourceRefreshPollStaleMs(options));
}

function getActivityPubSourceRefreshPollNow(options: IActivityPubSourceRefreshPollOptions): Date {
	if (options.now === undefined) {
		return new Date();
	}
	const now = new Date(options.now);
	if (Number.isNaN(now.getTime())) {
		throwActivityPubError('activitypub_source_refresh_poll_now_invalid', 400);
	}
	return now;
}

function getActivityPubSourceRefreshPollStaleMs(options: IActivityPubSourceRefreshPollOptions): number {
	return helpers.parsePositiveInteger(options.staleMs, activityPubSourceRefreshPollDefaultStaleMs);
}

function getActivityPubSourceRefreshPollLimit(options: IActivityPubSourceRefreshPollOptions): number {
	return helpers.parsePositiveInteger(options.limit, activityPubSourceRefreshPollDefaultLimit);
}

function getActivityPubSourceSubscriptionReport(subscription, remoteActorById: Map<number, any>): IActivityPubSourceSubscriptionReport {
	const remoteActor = remoteActorById.get(Number(subscription.remoteActorId));
	const report: IActivityPubSourceSubscriptionReport = {
		id: subscription.id,
		userId: subscription.userId,
		remoteActorId: subscription.remoteActorId,
		remoteActor: getActivityPubRemoteActorReport(remoteActor),
		sourceActorUrl: subscription.sourceActorUrl || remoteActor?.actorUrl || '',
		status: subscription.status,
		createdAt: subscription.createdAt,
		updatedAt: subscription.updatedAt
	};
	if (subscription.sourceResource) {
		report.sourceResource = subscription.sourceResource;
	}
	if (subscription.bridgeProvider) {
		report.bridgeProvider = subscription.bridgeProvider;
	}
	if (subscription.displayName) {
		report.displayName = subscription.displayName;
	}
	if (subscription.lastReadAt) {
		report.lastReadAt = subscription.lastReadAt;
	}
	if (subscription.lastRefreshRequestedAt) {
		report.lastRefreshRequestedAt = subscription.lastRefreshRequestedAt;
	}
	if (subscription.lastError) {
		report.lastError = subscription.lastError;
	}
	return report;
}

async function getActivityPubSourceFeedWhere(models, subscription, filters: IActivityPubSourceFeedFilters = {}) {
	const where: any = {
		remoteActorId: subscription.remoteActorId,
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
	return where;
}

function getActivityPubSourceFeedItem(subscription, object, remoteActorById: Map<number, any>, reviewByObjectId: Map<number, any>) {
	return {
		...getActivityPubRemoteObjectReport(object, remoteActorById, reviewByObjectId),
		sourceSubscriptionId: subscription.id,
		isUnread: isActivityPubSourceFeedObjectUnread(subscription, object)
	};
}

function isActivityPubSourceFeedObjectUnread(subscription, object): boolean {
	const readAt = getOptionalDateTime(subscription.lastReadAt);
	if (readAt === null) {
		return true;
	}
	const objectTime = getOptionalDateTime(object.publishedAt) ?? getOptionalDateTime(object.createdAt) ?? getOptionalDateTime(object.updatedAt);
	if (objectTime === null) {
		return true;
	}
	return objectTime > readAt;
}

function getActivityPubSourceReadAt(input: IActivityPubSourceReadInput): Date {
	if (input?.readAt === undefined) {
		return new Date();
	}
	const readAt = new Date(input.readAt);
	if (Number.isNaN(readAt.getTime())) {
		throwActivityPubError('activitypub_source_read_at_invalid', 400);
	}
	return readAt;
}

function getRequiredActivityPubSourceFollowGroupName(input: IActivityPubSourceFollowInput): string {
	const groupName = getOptionalBoundedString(input?.groupName, 200);
	if (!groupName) {
		throwActivityPubError('activitypub_source_follow_group_name_required', 400);
	}
	return groupName;
}

function getRequiredActivityPubWebFingerActorUrl(webFinger): string {
	const links = Array.isArray(webFinger?.links) ? webFinger.links : [];
	const activityPubLink = links.find((link) => {
		return link?.rel === 'self' && typeof link.href === 'string' && isActivityPubWebFingerSelfLink(link);
	});
	const selfLink = activityPubLink || links.find((link) => {
		return link?.rel === 'self' && typeof link.href === 'string';
	});
	if (!selfLink) {
		throwActivityPubError('activitypub_source_webfinger_actor_not_found', 401);
	}
	return selfLink.href;
}

function isActivityPubWebFingerSelfLink(link): boolean {
	const type = String(link.type || '').toLowerCase();
	return type.includes('activity+json')
		|| type.includes('application/ld+json')
		|| type.includes('activitystreams');
}

function getOptionalActivityPubSourceActorUrl(input: IActivityPubSourceResolveInput): string | null {
	const actorUrl = getOptionalBoundedString(input?.actorUrl, 700);
	return actorUrl || null;
}

function getOptionalActivityPubSourceResource(input: IActivityPubSourceResolveInput): string | null {
	if (input?.resource !== undefined || input?.handle !== undefined || input?.preset !== undefined) {
		return getRequiredActivityPubSourceResource(input);
	}
	return null;
}

function getRequiredActivityPubSourceResource(input: IActivityPubSourceResolveInput): string {
	if (input?.resource !== undefined) {
		return normalizeActivityPubSourceResource(input.resource);
	}
	if (input?.preset === activityPubBlueskyOfficialPreset) {
		return `acct:bsky.app@${activityPubBlueskyBridgeHost}`;
	}
	if (input?.handle !== undefined) {
		return getActivityPubSourceResourceByHandle(input.handle, input);
	}
	throwActivityPubError('activitypub_source_actor_required', 400);
}

function getActivityPubSourceResourceByHandle(rawHandle: string, input: IActivityPubSourceResolveInput): string {
	const handle = getActivityPubSourceHandle(rawHandle);
	if (handle.includes('@')) {
		return normalizeActivityPubSourceResource(`acct:${handle}`);
	}
	if (getActivityPubSourceBridgeProviderInput(input) === activityPubBlueskyBridgeProvider) {
		return normalizeActivityPubSourceResource(`acct:${handle}@${activityPubBlueskyBridgeHost}`);
	}
	throwActivityPubError('activitypub_source_handle_domain_required', 400);
}

function normalizeActivityPubSourceResource(value: string): string {
	const resource = getOptionalBoundedString(value, 500);
	if (!resource || !resource.toLowerCase().startsWith('acct:')) {
		throwActivityPubError('activitypub_source_resource_invalid', 400);
	}
	const atIndex = resource.lastIndexOf('@');
	if (atIndex <= 'acct:'.length) {
		throwActivityPubError('activitypub_source_resource_invalid', 400);
	}
	const localName = resource.slice(5, atIndex);
	const domain = resource.slice(atIndex + 1).toLowerCase();
	if (!localName || !isValidActivityPubSourceDomain(domain)) {
		throwActivityPubError('activitypub_source_resource_invalid', 400);
	}
	return `acct:${localName}@${domain}`;
}

function getActivityPubSourceResourceDomain(resource: string): string {
	return normalizeActivityPubSourceResource(resource).split('@').pop() as string;
}

function getActivityPubSourceHandle(rawHandle: string): string {
	const handle = getOptionalBoundedString(rawHandle, 300)?.replace(/^@/, '');
	if (!handle || /[\s/]/.test(handle)) {
		throwActivityPubError('activitypub_source_handle_invalid', 400);
	}
	return handle;
}

function getActivityPubSourceDisplayName(input: IActivityPubSourceSubscriptionInput, remoteActorRecord): string | null {
	const explicitName = getOptionalBoundedString(input?.displayName, 200);
	if (explicitName !== undefined) {
		return explicitName || null;
	}
	if (remoteActorRecord?.preferredUsername && remoteActorRecord?.domain) {
		return `${remoteActorRecord.preferredUsername}@${remoteActorRecord.domain}`;
	}
	return null;
}

function getActivityPubSourceBridgeProvider(input: IActivityPubSourceResolveInput, sourceResource: string | undefined, remoteActorRecord): string | undefined {
	const explicitProvider = getActivityPubSourceBridgeProviderInput(input);
	if (explicitProvider) {
		return explicitProvider;
	}
	if (isActivityPubBlueskyBridgeSource(sourceResource, remoteActorRecord)) {
		return activityPubBlueskyBridgeProvider;
	}
	return undefined;
}

function getActivityPubSourceBridgeProviderInput(input: IActivityPubSourceResolveInput): string | undefined {
	const provider = getOptionalBoundedString(input?.bridgeProvider, 100);
	if (!provider) {
		return undefined;
	}
	if (provider === 'bluesky') {
		return activityPubBlueskyBridgeProvider;
	}
	return provider;
}

function isActivityPubBlueskyBridgeSource(sourceResource: string | undefined, remoteActorRecord): boolean {
	return Boolean(
		sourceResource?.toLowerCase().endsWith(`@${activityPubBlueskyBridgeHost}`)
		|| remoteActorRecord?.domain === activityPubBlueskyBridgeHost
	);
}

function isKnownActivityPubSourceSubscriptionStatus(status): status is ActivityPubSourceSubscriptionStatus {
	return Object.values(ActivityPubSourceSubscriptionStatus).includes(status);
}

function getRequiredMutableActivityPubSourceSubscriptionStatus(status): ActivityPubSourceSubscriptionStatus {
	if (status === ActivityPubSourceSubscriptionStatus.Active || status === ActivityPubSourceSubscriptionStatus.Paused) {
		return status;
	}
	throwActivityPubError('activitypub_source_subscription_status_invalid', 400);
}

function isValidActivityPubSourceDomain(domain: string): boolean {
	return Boolean(domain && !/[\s/:]/.test(domain) && domain.includes('.'));
}

function getOptionalBoundedString(value, maxLength: number): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	return value.trim().slice(0, maxLength);
}

function getOptionalDateTime(value): number | null {
	if (!value) {
		return null;
	}
	const time = new Date(value).getTime();
	return Number.isNaN(time) ? null : time;
}

function isActivityPubSourceSubscriptionUniqueError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
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
		backups.push(await createActivityPubRemoteAttachmentBackupRecord(app, userId, postDraft, attachment));
	}
	return backups;
}

async function createActivityPubRemoteAttachmentBackupRecord(app: IGeesomeApp, userId: number, postDraft: IActivityPubRemoteObjectPostDraft, attachment: IActivityPubRemoteObjectAttachmentPreview): Promise<IActivityPubRemoteAttachmentBackup> {
	const content = await createActivityPubRemoteAttachmentBackupContent(app, userId, postDraft, attachment);
	return getActivityPubRemoteAttachmentBackup(attachment, content);
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

async function prepareNextActivityPubRemoteAttachmentBackupQueue(app: IGeesomeApp) {
	while (true) {
		const waitingQueue = await app.ms.asyncOperation.getWaitingOperationByModule(activityPubRemoteAttachmentBackupQueueModuleName);
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
			job = parseActivityPubRemoteAttachmentBackupJob(waitingQueue.inputJson);
		} catch (e) {
			await app.ms.asyncOperation.closeUserOperationQueue(waitingQueue.id);
			continue;
		}
		const hasFailure = waitingQueue.asyncOperation.errorType || waitingQueue.asyncOperation.errorMessage;
		if (!hasFailure) {
			await app.ms.asyncOperation.closeUserOperationQueue(waitingQueue.id);
			continue;
		}
		if (getActivityPubRemoteAttachmentBackupJobAttempts(job) >= activityPubRemoteAttachmentBackupQueueMaxAttempts) {
			await app.ms.asyncOperation.closeUserOperationQueue(waitingQueue.id);
			continue;
		}

		await app.ms.asyncOperation.updateUserOperationQueue(waitingQueue.id, {asyncOperationId: null});
		return waitingQueue;
	}
}

async function processActivityPubRemoteAttachmentBackupQueueItem(app: IGeesomeApp, models, waitingQueue): Promise<IActivityPubRemoteAttachmentBackupRetryResult | null> {
	const job = getNextActivityPubRemoteAttachmentBackupJobAttempt(parseActivityPubRemoteAttachmentBackupJob(waitingQueue.inputJson));
	await app.ms.asyncOperation.updateUserOperationQueue(waitingQueue.id, {
		inputJson: JSON.stringify(job),
		startedAt: new Date()
	});

	const asyncOperation = await app.ms.asyncOperation.addAsyncOperation(waitingQueue.userId, {
		userApiKeyId: waitingQueue.userApiKeyId,
		module: activityPubRemoteAttachmentBackupQueueModuleName,
		name: 'backup-activitypub-remote-attachments',
		channel: getActivityPubRemoteAttachmentBackupJobChannel(job),
		percent: 5
	});
	await app.ms.asyncOperation.setAsyncOperationToUserOperationQueue(waitingQueue.id, asyncOperation.id);

	try {
		const result = await runActivityPubRemoteAttachmentBackupJob(app, models, waitingQueue.userId, job);
		await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
		await app.ms.asyncOperation.finishAsyncOperation(waitingQueue.userId, asyncOperation.id, null, JSON.stringify(result));
		return result;
	} catch (e) {
		const rawErrorMessage = getErrorMessage(e);
		const errorMessage = getActivityPubRemoteAttachmentBackupJobFailureMessage(job, rawErrorMessage);
		await app.ms.asyncOperation.errorAsyncOperation(waitingQueue.userId, asyncOperation.id, errorMessage);
		if (getActivityPubRemoteAttachmentBackupJobAttempts(job) >= activityPubRemoteAttachmentBackupQueueMaxAttempts) {
			await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
			return null;
		}
		await app.ms.asyncOperation.updateUserOperationQueue(waitingQueue.id, {asyncOperationId: null});
		return null;
	}
}

async function runActivityPubRemoteAttachmentBackupJob(app: IGeesomeApp, models, userId: number, job: IActivityPubRemoteAttachmentBackupJob): Promise<IActivityPubRemoteAttachmentBackupRetryResult> {
	const group = await getFederatableGroup(app, job.groupName);
	const actorRecord = await getGroupActorRecord(models, group);
	const objectRecord = actorRecord ? await getGroupRemoteObjectRecord(models, actorRecord, job.remoteObjectId) : null;
	if (!objectRecord) {
		throwActivityPubError('activitypub_remote_object_not_found', 404);
	}
	const post = await getActivityPubRemoteObjectImportedPost(app, objectRecord);
	if (!post) {
		throwActivityPubError('activitypub_remote_object_post_not_created', 400);
	}

	const remoteObject = await getActivityPubRemoteObjectReportWithRemoteActor(models, objectRecord);
	const postDraft = await getActivityPubRemoteObjectPostDraft(models, actorRecord, remoteObject);
	return backupActivityPubRemotePostAttachments(app, getActivityPubRemotePostOwnerUserId(post, userId), objectRecord, post, postDraft);
}

async function backupActivityPubRemotePostAttachments(
	app: IGeesomeApp,
	userId: number,
	objectRecord,
	post: IPost,
	postDraft: IActivityPubRemoteObjectPostDraft
): Promise<IActivityPubRemoteAttachmentBackupRetryResult> {
	const existingBackups = getActivityPubRemotePostAttachmentBackups(post);
	const attachments = postDraft.attachments || [];
	const candidates = getActivityPubRemoteAttachmentBackupRetryCandidates(attachments, existingBackups);
	const backedUpAttachments: IActivityPubRemoteAttachmentBackupWithAttachment[] = [];
	const failures: IActivityPubRemoteAttachmentBackupFailure[] = [];

	for (const attachment of candidates) {
		try {
			backedUpAttachments.push({
				attachment,
				backup: await createActivityPubRemoteAttachmentBackupRecord(app, userId, postDraft, attachment)
			});
		} catch (e) {
			failures.push({
				url: attachment.url,
				errorMessage: getErrorMessage(e)
			});
		}
	}

	const newBackups = backedUpAttachments.map((item) => item.backup);
	const attachmentBackups = mergeActivityPubRemoteAttachmentBackups(existingBackups, newBackups);
	if (newBackups.length) {
		await updateActivityPubRemotePostAttachmentBackups(app, userId, post, postDraft, attachmentBackups, backedUpAttachments);
	}
	if (failures.length) {
		throw new Error(getActivityPubRemoteAttachmentBackupFailureMessage(failures));
	}

	return {
		postId: Number(post.id),
		remoteObjectId: Number(objectRecord.id),
		attempted: candidates.length,
		backedUp: newBackups.length,
		skipped: Math.max(0, attachments.length - candidates.length),
		attachmentBackups
	};
}

function getActivityPubRemoteAttachmentBackupJobInput(groupName: string, objectRecord): IActivityPubRemoteAttachmentBackupJob {
	return {
		type: 'remote-attachment-backup',
		groupName,
		remoteObjectId: Number(objectRecord.id),
		attempts: 0
	};
}

function getActivityPubSourceRefreshJobInput(subscription, input: IActivityPubSourceRefreshQueueInput): IActivityPubSourceRefreshJob {
	return {
		type: 'source-refresh',
		sourceId: Number(subscription.id),
		input: getActivityPubSourceRefreshJobRefreshInput(input)
	};
}

function getActivityPubMigrationImportJobInput(input: IActivityPubMigrationImportQueueInput): IActivityPubMigrationImportJob {
	return {
		type: 'migration-import',
		input: getActivityPubMigrationImportJobImportInput(input)
	};
}

function parseActivityPubMigrationImportJob(inputJson: string): IActivityPubMigrationImportJob {
	const job = parseActivityPubJson(String(inputJson || '{}'));
	if (job?.type !== 'migration-import') {
		throwActivityPubError('activitypub_migration_import_job_invalid', 400);
	}
	return {
		type: 'migration-import',
		input: getActivityPubMigrationImportJobImportInput(job.input || {})
	};
}

function getActivityPubMigrationImportJobImportInput(input: IActivityPubMigrationImportQueueInput): IActivityPubMigrationImportQueueInput {
	const importInput: IActivityPubMigrationImportQueueInput = {};
	const actorUrl = getOptionalActivityPubSourceActorUrl(input);
	if (actorUrl) {
		importInput.actorUrl = actorUrl;
	}
	const resource = getOptionalActivityPubSourceResource(input);
	if (resource) {
		importInput.resource = resource;
	}
	const handle = getOptionalBoundedString(input?.handle, 500);
	if (handle) {
		importInput.handle = handle;
	}
	const bridgeProvider = getOptionalBoundedString(input?.bridgeProvider, 100);
	if (bridgeProvider) {
		importInput.bridgeProvider = bridgeProvider;
	}
	const preset = getOptionalBoundedString(input?.preset, 100);
	if (preset) {
		importInput.preset = preset;
	}
	if (input?.claimed !== undefined) {
		importInput.claimed = helpers.parseBoolean(input.claimed, false);
	}
	if (input?.createPosts !== undefined) {
		importInput.createPosts = helpers.parseBoolean(input.createPosts, false);
	}
	const groupName = getOptionalBoundedString(input?.groupName, 200);
	if (groupName) {
		importInput.groupName = groupName;
	}
	if (input?.ownershipApproved !== undefined) {
		importInput.ownershipApproved = helpers.parseBoolean(input.ownershipApproved, false);
	}
	const ownershipProofToken = getActivityPubMigrationOwnershipProofToken(input);
	if (ownershipProofToken) {
		importInput.ownershipProofToken = ownershipProofToken;
	}
	if (input?.importRemoteAttachments !== undefined) {
		importInput.importRemoteAttachments = helpers.parseBoolean(input.importRemoteAttachments, false);
	}
	if (input?.moderationMode !== undefined || input?.moderationRules !== undefined || input?.moderationPolicy !== undefined) {
		importInput.moderationPolicy = getActivityPubMigrationImportJobModerationPolicy(input);
	}
	if (input?.limit !== undefined) {
		importInput.limit = getActivityPubMigrationPreviewLimit(input);
	}
	if (input?.maxPages !== undefined) {
		importInput.maxPages = getActivityPubMigrationPreviewMaxPages(input);
	}
	if (input?.includeFeatured !== undefined) {
		importInput.includeFeatured = helpers.parseBoolean(input.includeFeatured, true);
	}
	if (input?.includeOutbox !== undefined) {
		importInput.includeOutbox = helpers.parseBoolean(input.includeOutbox, true);
	}
	return importInput;
}

function getActivityPubMigrationImportJobModerationPolicy(input: IActivityPubMigrationImportQueueInput): IRemoteContentModerationPolicyInput {
	const policy = getActivityPubMigrationImportModerationPolicy(input);
	const jobPolicy: IRemoteContentModerationPolicyInput = {};
	if (input?.moderationMode !== undefined || input?.moderationPolicy?.mode !== undefined) {
		jobPolicy.mode = policy.mode;
	}
	if (input?.moderationRules !== undefined || input?.moderationPolicy?.rules !== undefined) {
		jobPolicy.rules = policy.rules;
	}
	return jobPolicy;
}

function parseActivityPubSourceRefreshJob(inputJson: string): IActivityPubSourceRefreshJob {
	const job = parseActivityPubJson(String(inputJson || '{}'));
	if (job?.type !== 'source-refresh') {
		throwActivityPubError('activitypub_source_refresh_job_invalid', 400);
	}
	const sourceId = Number(job.sourceId);
	if (!Number.isFinite(sourceId) || sourceId <= 0) {
		throwActivityPubError('activitypub_source_refresh_job_invalid', 400);
	}

	return {
		type: 'source-refresh',
		sourceId,
		input: getActivityPubSourceRefreshJobRefreshInput(job.input || {})
	};
}

function getActivityPubSourceRefreshJobRefreshInput(input: IActivityPubSourceRefreshQueueInput): IActivityPubSourceRefreshInput {
	const refreshInput: IActivityPubSourceRefreshInput = {};
	if (input?.limit !== undefined) {
		refreshInput.limit = input.limit;
	}
	if (input?.includeFeatured !== undefined) {
		refreshInput.includeFeatured = input.includeFeatured;
	}
	if (input?.includeOutbox !== undefined) {
		refreshInput.includeOutbox = input.includeOutbox;
	}
	return refreshInput;
}

function getActivityPubSourceRefreshJobChannel(job: IActivityPubSourceRefreshJob): string {
	return `${activityPubSourceRefreshQueueModuleName}:${job.sourceId}`;
}

function getActivityPubMigrationImportJobChannel(job: IActivityPubMigrationImportJob): string {
	const input = job.input || {};
	return `${activityPubMigrationImportQueueModuleName}:${input.actorUrl || input.resource || input.handle || input.preset || 'unknown'}`;
}

function parseActivityPubRemoteAttachmentBackupJob(inputJson: string): IActivityPubRemoteAttachmentBackupJob {
	const job = parseActivityPubJson(String(inputJson || '{}'));
	if (job?.type !== 'remote-attachment-backup') {
		throwActivityPubError('activitypub_attachment_backup_job_invalid', 400);
	}
	if (typeof job.groupName !== 'string' || !job.groupName.trim()) {
		throwActivityPubError('activitypub_attachment_backup_job_invalid', 400);
	}
	const remoteObjectId = Number(job.remoteObjectId);
	if (!Number.isFinite(remoteObjectId) || remoteObjectId <= 0) {
		throwActivityPubError('activitypub_attachment_backup_job_invalid', 400);
	}

	return {
		type: 'remote-attachment-backup',
		groupName: job.groupName,
		remoteObjectId,
		attempts: getActivityPubRemoteAttachmentBackupJobAttempts(job)
	};
}

function getNextActivityPubRemoteAttachmentBackupJobAttempt(job: IActivityPubRemoteAttachmentBackupJob): IActivityPubRemoteAttachmentBackupJob {
	return {
		...job,
		attempts: getActivityPubRemoteAttachmentBackupJobAttempts(job) + 1
	};
}

function getActivityPubRemoteAttachmentBackupJobAttempts(job: IActivityPubRemoteAttachmentBackupJob): number {
	return helpers.parsePositiveInteger(job?.attempts, 0);
}

function getActivityPubRemoteAttachmentBackupJobChannel(job: IActivityPubRemoteAttachmentBackupJob): string {
	return `${activityPubRemoteAttachmentBackupQueueModuleName}:${job.groupName}:${job.remoteObjectId}`;
}

function getActivityPubRemoteAttachmentBackupJobFailureMessage(job: IActivityPubRemoteAttachmentBackupJob, errorMessage: string): string {
	const attempts = getActivityPubRemoteAttachmentBackupJobAttempts(job);
	return `activitypub remote attachment backup attempt ${attempts} of ${activityPubRemoteAttachmentBackupQueueMaxAttempts} failed: ${errorMessage}`;
}

function getActivityPubRemotePostOwnerUserId(post: IPost, fallbackUserId: number): number {
	const userId = Number(post?.userId);
	if (Number.isFinite(userId) && userId > 0) {
		return userId;
	}
	return fallbackUserId;
}

function getActivityPubRemoteAttachmentBackupRetryCandidates(
	attachments: IActivityPubRemoteObjectAttachmentPreview[],
	existingBackups: IActivityPubRemoteAttachmentBackup[]
): IActivityPubRemoteObjectAttachmentPreview[] {
	const existingBackupUrls = new Set(existingBackups.map((backup) => backup.url));
	return attachments.filter((attachment) => {
		if (!isActivityPubRemoteAttachmentBackupSupported(attachment) || existingBackupUrls.has(attachment.url)) {
			return false;
		}
		existingBackupUrls.add(attachment.url);
		return true;
	});
}

function getActivityPubRemotePostAttachmentBackups(post: IPost): IActivityPubRemoteAttachmentBackup[] {
	const properties = parseActivityPubJson(String(post?.propertiesJson || '{}'));
	const backups = properties?.activityPub?.attachmentBackups;
	if (!Array.isArray(backups)) {
		return [];
	}
	return mergeActivityPubRemoteAttachmentBackups([], backups);
}

function mergeActivityPubRemoteAttachmentBackups(
	existingBackups: IActivityPubRemoteAttachmentBackup[],
	newBackups: IActivityPubRemoteAttachmentBackup[]
): IActivityPubRemoteAttachmentBackup[] {
	const backups: IActivityPubRemoteAttachmentBackup[] = [];
	const seenUrls = new Set<string>();
	for (const backup of [...existingBackups, ...newBackups]) {
		if (!backup?.url || seenUrls.has(backup.url)) {
			continue;
		}
		backups.push(backup);
		seenUrls.add(backup.url);
	}
	return backups;
}

async function updateActivityPubRemotePostAttachmentBackups(
	app: IGeesomeApp,
	userId: number,
	post: IPost,
	postDraft: IActivityPubRemoteObjectPostDraft,
	attachmentBackups: IActivityPubRemoteAttachmentBackup[],
	backedUpAttachments: IActivityPubRemoteAttachmentBackupWithAttachment[]
): Promise<void> {
	await app.ms.group.updateRemotePostByObject(userId, post.id, {
		contents: getActivityPubRemotePostContentRefsWithBackups(post, backedUpAttachments),
		propertiesJson: JSON.stringify(getActivityPubRemotePostPropertiesWithAttachmentBackups(post, postDraft, attachmentBackups))
	});
}

function getActivityPubRemotePostContentRefsWithBackups(post: IPost, backedUpAttachments: IActivityPubRemoteAttachmentBackupWithAttachment[]) {
	const refs = getActivityPubRemotePostContentRefs(post);
	for (const backedUpAttachment of backedUpAttachments) {
		refs.push(getActivityPubRemoteAttachmentBackupContentRef(backedUpAttachment));
	}
	return refs;
}

function getActivityPubRemotePostContentRefs(post: IPost) {
	return (post?.contents || [])
		.map((content) => getActivityPubRemotePostContentRef(content))
		.filter((content) => !!content);
}

function getActivityPubRemotePostContentRef(content: IContent) {
	const contentId = Number(content?.id);
	if (!Number.isFinite(contentId) || contentId <= 0) {
		return null;
	}
	const contentRef: any = {id: contentId};
	const view = (content as any).postsContents?.view || content.view;
	if (view) {
		contentRef.view = view;
	}
	return contentRef;
}

function getActivityPubRemoteAttachmentBackupContentRef(backedUpAttachment: IActivityPubRemoteAttachmentBackupWithAttachment) {
	return {
		id: backedUpAttachment.backup.contentId,
		view: getActivityPubRemoteAttachmentContentView(backedUpAttachment.attachment)
	};
}

function getActivityPubRemotePostPropertiesWithAttachmentBackups(
	post: IPost,
	postDraft: IActivityPubRemoteObjectPostDraft,
	attachmentBackups: IActivityPubRemoteAttachmentBackup[]
) {
	const properties = parseActivityPubJson(String(post?.propertiesJson || '{}')) || {};
	properties.activityPub = {...(properties.activityPub || {})};
	if (postDraft.attachments?.length) {
		properties.activityPub.attachments = postDraft.attachments;
	}
	if (postDraft.attachmentImportPolicy) {
		properties.activityPub.attachmentImportPolicy = postDraft.attachmentImportPolicy;
	}
	properties.activityPub.attachmentImportMode = 'backupOnCreate';
	properties.activityPub.attachmentBackups = attachmentBackups;
	return properties;
}

function getActivityPubRemoteAttachmentBackupFailureMessage(failures: IActivityPubRemoteAttachmentBackupFailure[]): string {
	return failures.map((failure) => `${failure.url}: ${failure.errorMessage}`).join('; ');
}

function getErrorMessage(error): string {
	if (error?.message) {
		return error.message;
	}
	return String(error);
}

async function createActivityPubRemoteObjectPostFromRecord(
	app: IGeesomeApp,
	models,
	userId: number,
	group: IGroup,
	actorRecord,
	objectRecord,
	options: IActivityPubRemoteObjectPostCreateOptions = {}
): Promise<IActivityPubRemoteObjectPostCreateResult> {
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
	return isActivityPubReviewObjectType(objectType);
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
