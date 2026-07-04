import {Buffer} from 'node:buffer';
import {IGeesomeApp} from '../../interface.js';
import {Op} from 'sequelize';
import helpers from '../../helpers.js';
import {ContentView, CorePermissionName, IContentData, IListParams, IListParamsOptions} from '../database/interface.js';
import {ISocNetDbChannel} from '../socNetImport/interface.js';
import {IPost, PostStatus} from '../group/interface.js';
import {RICH_TEXT_MIME_TYPE, isRichTextDocument, richTextToAtProtoTextWithFacets} from '../../richText.js';
import {BlueskyImportClient} from './importClient.js';
import {
	IRemoteContentModerationDecision,
	IRemoteContentModerationPolicy,
	IRemoteContentModerationPolicyInput,
	IRemoteContentModerationSummary,
	RemoteContentModerationMode,
	evaluateRemoteContentModerationPolicy,
	getRemoteContentModerationSummary,
	isRemoteContentModerationDecisionImportable,
	normalizeRemoteContentModerationPolicy
} from '../remoteContentModeration/helpers.js';
import {
	IBlueskyAuthorProjection,
	IBlueskyActorProfile,
	IBlueskyPostProjection,
	IBlueskyRecordCreateResult,
	IBlueskySession,
	blueskyFeedPostCollection,
	blueskyImageMaxCount,
	blueskyImageMaxInputSize,
	blueskyPostSource,
	blueskySocNet,
	buildBlueskyExternalEmbed,
	buildBlueskyImageEmbed,
	buildBlueskyFeedPostRecord,
	createBlueskyRecord,
	createBlueskySession,
	fetchBlueskyAuthorFeed,
	fetchBlueskyActorProfile,
	fetchBlueskyPostRecord,
	getBlueskyProjectionPreview,
	normalizeBlueskyActor,
	normalizeBlueskyAuthorFeedFilter,
	parseBlueskyPostAtUri,
	prepareBlueskyImageUploadData,
	uploadBlueskyBlob,
	projectBlueskyAuthorFeed
} from './helpers.js';
import IGeesomeBlueskyModule, {
	BlueskySourcePostReviewState,
	BlueskySourceSubscriptionStatus,
	IBlueskyAccountLoginInput,
	IBlueskyAccountVerifyInput,
	IBlueskyCrossPostInput,
	IBlueskyCrossPostResult,
	IBlueskyPublicAuthorFeedImportInput,
	IBlueskyPublicAuthorFeedPreviewInput,
	IBlueskySourceFeedFilters,
	IBlueskySourceRefreshInput,
	IBlueskySourceRefreshPollOptions,
	IBlueskySourceRefreshQueueInput,
	IBlueskySourceRefreshQueueProcessOptions,
	IBlueskySourceReviewFilters,
	IBlueskySourceReviewImportInput,
	IBlueskySourceReviewUpdateInput,
	IBlueskySourceSyncError,
	IBlueskySourceSyncInput,
	IBlueskySourceSubscriptionFilters,
	IBlueskySourceSubscriptionInput,
	IBlueskySourceSubscriptionUpdateInput
} from './interface.js';

const blueskySourceRefreshQueueModuleName = 'bluesky-source-refresh';
const blueskySourceRefreshQueueKickBatchLimit = 3;
const blueskySourceRefreshPollDefaultLimit = 20;
const blueskySourceRefreshPollDefaultStaleMs = 15 * 60 * 1000;
const blueskySourceSubscriptionListParams: IListParamsOptions = {
	sortBy: 'updatedAt',
	allowedSortBy: ['actor', 'status', 'createdAt', 'updatedAt', 'id'],
	maxLimit: 100
};
const blueskySourceSyncListParams: IListParamsOptions = {
	sortBy: 'publishedAt',
	allowedSortBy: ['publishedAt', 'updatedAt', 'createdAt', 'id'],
	maxLimit: 100
};
const blueskySourceReviewListParams: IListParamsOptions = {
	sortBy: 'publishedAt',
	allowedSortBy: ['publishedAt', 'updatedAt', 'createdAt', 'id'],
	maxLimit: 100
};
const blueskySourceSyncDefaultLimit = 20;
const blueskySourceSyncErrorLimit = 20;

interface IBlueskyCrossPostImageFallbackLink {
	uri: string;
	title: string;
	description: string;
}

interface IBlueskyCrossPostImageResult {
	embeds: any[];
	fallbackLinks: IBlueskyCrossPostImageFallbackLink[];
}

export default async (app: IGeesomeApp) => {
	app.checkModules(['api', 'database']);
	const models = await (await import('./models.js')).default(app.ms.database.sequelize);
	const module = getModule(app, {models});
	await (await import('./api.js')).default(app, module);
	(await import('./cron.js')).default(app, module);
	return module;
}

export function getModule(app: IGeesomeApp, options: any = {}): IGeesomeBlueskyModule {
	app.checkModules(['api']);
	const models = options.models || null;

	class BlueskyModule implements IGeesomeBlueskyModule {
		async getPublicAuthorFeedPreview(input: IBlueskyPublicAuthorFeedPreviewInput = {}) {
			const actor = getRequiredBlueskyActor(input);
			const feedResponse = await fetchBlueskyAuthorFeed({
				actor,
				filter: input.filter,
				cursor: getOptionalBlueskyPreviewCursor(input),
				limit: input.limit,
				origin: getBlueskyPublicApiOrigin(app),
				timeoutMs: getBlueskyPublicApiTimeoutMs(app),
				fetch: options.fetch
			});
			return {
				actor,
				cursor: getOptionalString(feedResponse?.cursor),
				list: projectBlueskyAuthorFeed(feedResponse)
			};
		}

		async importPublicAuthorFeed(userId: number, userApiKeyId: number | null, input: IBlueskyPublicAuthorFeedImportInput = {}) {
			app.checkModules(['asyncOperation', 'group', 'content', 'socNetImport']);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			const preview = await this.getPublicAuthorFeedPreview(input);
			const projections = preview.list;
			if (projections.length === 0) {
				throw new Error('bluesky_feed_empty');
			}
			const dbChannel = await this.importPublicAuthorChannel(userId, input, preview.actor, projections[0]);
			const asyncOperation = await app.ms.socNetImport.openImportAsyncOperation(userId, userApiKeyId, dbChannel);
			this.runPublicAuthorFeedImport(userId, dbChannel, getBlueskyImportProjectionOrder(projections), getBlueskyImportAdvancedSettings(input), asyncOperation);
			return {
				actor: preview.actor,
				cursor: preview.cursor,
				projectedPostsCount: projections.length,
				dbChannel: getBlueskyImportChannelResult(dbChannel),
				asyncOperation
			};
		}

		async importPublicAuthorChannel(userId: number, input: IBlueskyPublicAuthorFeedImportInput, actor: string, projection: IBlueskyPostProjection) {
			return app.ms.socNetImport.importChannelMetadata(
				userId,
				blueskySocNet,
				getBlueskyImportAccountId(input),
				getBlueskyAuthorChannelMetadata(actor, projection),
				getBlueskyAuthorChannelUpdateData(input)
			);
		}

		runPublicAuthorFeedImport(userId: number, dbChannel: ISocNetDbChannel, projections: IBlueskyPostProjection[], advancedSettings: any, asyncOperation): void {
			let processed = 0;
			(async () => {
				const client = new BlueskyImportClient(app, userId, dbChannel, projections, advancedSettings, async (m, _dbChannel, _post, type) => {
					if (type !== 'post' || !m) {
						return;
					}
					processed += 1;
					await app.ms.asyncOperation.handleOperationCancel(userId, asyncOperation.id);
					await app.ms.asyncOperation.updateAsyncOperation(userId, asyncOperation.id, getBlueskyImportProgress(processed, projections.length));
				});
				await app.ms.socNetImport.importChannelPosts(client);
			})()
				.then(() => app.ms.asyncOperation.closeImportAsyncOperation(userId, asyncOperation, null))
				.catch((e) => app.ms.asyncOperation.closeImportAsyncOperation(userId, asyncOperation, e));
		}

		async loginAccount(userId: number, input: IBlueskyAccountLoginInput = {}) {
			app.checkModules(['socNetAccount']);
			const session = await getBlueskyAccountSession(app, options, {
				identifier: getRequiredBlueskyAccountLoginIdentifier(input),
				password: getRequiredBlueskyAccountLoginPassword(input)
			});
			const profile = await getBlueskyAccountProfile(app, options, session);
			const account = await app.ms.socNetAccount.createOrUpdateAccount(userId, await getBlueskyAccountUpsertData(app, userId, input, session, profile));
			return getBlueskyAccountVerificationResult(account, profile, session);
		}

		async verifyAccount(userId: number, input: IBlueskyAccountVerifyInput = {}) {
			app.checkModules(['socNetAccount']);
			const account = await getBlueskyAccountRecord(app, userId, input.accountData);
			const session = await getBlueskyAccountSession(app, options, {
				identifier: getBlueskyAccountIdentifier(account, input),
				password: getBlueskyAccountPassword(account, input)
			});
			assertBlueskyAccountMatchesSession(account, session);
			const profile = await getBlueskyAccountProfile(app, options, session);
			return getBlueskyAccountVerificationResult(account, profile, session);
		}

		async crossPostPost(userId: number, postId: number | string, input: IBlueskyCrossPostInput = {}): Promise<IBlueskyCrossPostResult> {
			app.checkModules(['group', 'socNetAccount', 'storage']);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			const post = await app.ms.group.getPost(userId, postId);
			await assertCanCrossPostBlueskyPost(app, userId, post);
			const account = await getBlueskyAccountRecord(app, userId, input.accountData);
			const session = await getBlueskyAccountSession(app, options, {
				identifier: getBlueskyAccountIdentifier(account, input),
				password: getBlueskyAccountPassword(account, input)
			});
			assertBlueskyAccountMatchesSession(account, session);
			const profile = await getBlueskyAccountProfile(app, options, session);
			const existingRecord = getExistingBlueskyCrossPostRecord(post, session.did);
			if (existingRecord && !helpers.parseBoolean(input.force, false)) {
				return getBlueskyCrossPostResult(post, account, profile, session, existingRecord, true);
			}
			const recordInput = await getBlueskyCrossPostRecordInput(app, options, post, input, session);
			const record = await createBlueskyRecord({
				repo: session.did,
				collection: blueskyFeedPostCollection,
				record: buildBlueskyFeedPostRecord(recordInput),
				origin: getBlueskyAuthApiOrigin(app),
				timeoutMs: getBlueskyAuthApiTimeoutMs(app),
				fetch: options.fetch,
				accessJwt: session.accessJwt
			});
			const updatedPost = await storeBlueskyCrossPostRecord(app, userId, post, account, profile, session, record);
			return getBlueskyCrossPostResult(updatedPost, account, profile, session, record, false);
		}

		async getSourceSubscriptions(userId: number, filters: IBlueskySourceSubscriptionFilters = {}, listParams?: IListParams) {
			assertBlueskyModels(models);
			const preparedListParams = getBlueskySourceSubscriptionListParams(listParams);
			const subscriptionPage = await models.BlueskySourceSubscription.findAndCountAll({
				where: getBlueskySourceSubscriptionWhere(userId, filters),
				order: [[preparedListParams.sortBy, preparedListParams.sortDir]],
				limit: preparedListParams.limit,
				offset: preparedListParams.offset
			});
			return {
				list: subscriptionPage.rows.map(subscription => getBlueskySourceSubscriptionReport(subscription)),
				total: getListPageCount(subscriptionPage.count)
			};
		}

		async getSourceFeed(userId: number, sourceId: number | string, filters: IBlueskySourceFeedFilters = {}, listParams?: IListParams) {
			app.checkModules(['socNetImport', 'group']);
			assertBlueskyModels(models);
			const subscription = await getBlueskySourceSubscriptionRecord(models, userId, sourceId);
			const dbChannel = await getBlueskySourceFeedDbChannel(app, userId, subscription);
			return {
				source: getBlueskySourceSubscriptionReport(subscription),
				dbChannel: getBlueskyImportChannelResult(dbChannel),
				posts: await app.ms.group.getGroupPosts(
					dbChannel.groupId,
					helpers.sanitizePublicPostFilters(filters),
					listParams
				)
			};
		}

		async getSourceReviews(userId: number, sourceId: number | string, filters: IBlueskySourceReviewFilters = {}, listParams?: IListParams) {
			assertBlueskyReviewModels(models);
			const subscription = await getBlueskySourceSubscriptionRecord(models, userId, sourceId);
			const preparedListParams = getBlueskySourceReviewListParams(listParams);
			const reviewPage = await models.BlueskySourcePostReview.findAndCountAll({
				where: getBlueskySourceReviewWhere(userId, subscription, filters),
				order: [[preparedListParams.sortBy, preparedListParams.sortDir]],
				limit: preparedListParams.limit,
				offset: preparedListParams.offset
			});
			return {
				source: getBlueskySourceSubscriptionReport(subscription),
				list: reviewPage.rows.map(reviewRecord => getBlueskySourceReviewReport(reviewRecord)),
				total: getListPageCount(reviewPage.count)
			};
		}

		async syncSourceSubscriptionPosts(userId: number, sourceId: number | string, input: IBlueskySourceSyncInput = {}) {
			app.checkModules(['socNetImport', 'group', 'content']);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			assertBlueskyModels(models);
			const subscription = await getBlueskySourceSubscriptionRecord(models, userId, sourceId);
			const dbChannel = await getBlueskySourceFeedDbChannel(app, userId, subscription);
			const listParams = getBlueskySourceSyncListParams(input);
			const postRefs = await app.ms.group.getGroupPostRefs(
				dbChannel.groupId,
				getBlueskySourceSyncPostFilters(dbChannel, input),
				listParams,
				{
					attributes: ['id', 'publishedAt', 'source', 'sourceChannelId', 'sourcePostId', 'propertiesJson'],
					defaultListParams: blueskySourceSyncListParams
				}
			);
			const syncState = getEmptyBlueskySourceSyncState();
			const updateProjections: IBlueskyPostProjection[] = [];
			const deletePostIds: number[] = [];
			const moderationPolicy = getBlueskySourceModerationPolicy(subscription, input);
			const moderationDecisions: IRemoteContentModerationDecision[] = [];
			const moderationContext = getBlueskySourceSyncModerationContext(subscription, dbChannel);

			for (const postRef of postRefs) {
				const syncDecision = await getBlueskySourcePostSyncDecision(
					app,
					postRef,
					dbChannel,
					input,
					moderationPolicy,
					moderationDecisions,
					moderationContext,
					options.fetch
				);
				syncState.checked += 1;
				if (syncDecision.error) {
					appendBlueskySourceSyncError(syncState.errors, syncDecision.error);
					syncState.failed += 1;
					continue;
				}
				if (syncDecision.deletePostId) {
					deletePostIds.push(syncDecision.deletePostId);
					continue;
				}
				if (syncDecision.updateProjection) {
					updateProjections.push(syncDecision.updateProjection);
					continue;
				}
				syncState.skipped += 1;
			}

			if (updateProjections.length) {
				syncState.updated = await importBlueskyPublicAuthorFeedProjections(
					app,
					userId,
					dbChannel,
					getBlueskyImportProjectionOrder(updateProjections),
					{force: true}
				);
			}
			if (deletePostIds.length) {
				await app.ms.group.deletePosts(userId, deletePostIds);
				syncState.deleted = deletePostIds.length;
			}

			return {
				source: getBlueskySourceSubscriptionReport(subscription),
				dbChannel: getBlueskyImportChannelResult(dbChannel),
				...syncState,
				moderation: getRemoteContentModerationSummary(moderationDecisions),
				nextCursor: helpers.getNextCursorFromRows(postRefs, listParams.limit, {
					valueField: 'publishedAt',
					idField: 'id'
				})
			};
		}

		async subscribeSource(userId: number, input: IBlueskySourceSubscriptionInput = {}) {
			assertBlueskyModels(models);
			const subscriptionData = getBlueskySourceSubscriptionCreateData(userId, input);
			const existingSubscription = await models.BlueskySourceSubscription.findOne({
				where: {
					userId,
					actor: subscriptionData.actor
				}
			});
			if (existingSubscription) {
				await updateBlueskySourceSubscriptionRecord(existingSubscription, getExistingBlueskySourceSubscriptionUpdateData(subscriptionData));
				return getBlueskySourceSubscriptionReport(existingSubscription);
			}
			try {
				return getBlueskySourceSubscriptionReport(await models.BlueskySourceSubscription.create(subscriptionData));
			} catch (e) {
				if (!isBlueskySourceSubscriptionUniqueError(e)) {
					throw e;
				}
				const createdSubscription = await models.BlueskySourceSubscription.findOne({where: {userId, actor: subscriptionData.actor}});
				if (!createdSubscription) {
					throw e;
				}
				await updateBlueskySourceSubscriptionRecord(createdSubscription, getExistingBlueskySourceSubscriptionUpdateData(subscriptionData));
				return getBlueskySourceSubscriptionReport(createdSubscription);
			}
		}

		async updateSourceSubscription(userId: number, sourceId: number | string, input: IBlueskySourceSubscriptionUpdateInput = {}) {
			assertBlueskyModels(models);
			const subscription = await getBlueskySourceSubscriptionRecord(models, userId, sourceId);
			await updateBlueskySourceSubscriptionRecord(subscription, getBlueskySourceSubscriptionUpdateData(input, subscription));
			return getBlueskySourceSubscriptionReport(subscription);
		}

		async removeSourceSubscription(userId: number, sourceId: number | string) {
			assertBlueskyModels(models);
			const subscription = await getBlueskySourceSubscriptionRecord(models, userId, sourceId);
			await updateBlueskySourceSubscriptionRecord(subscription, {status: BlueskySourceSubscriptionStatus.Removed});
			return getBlueskySourceSubscriptionReport(subscription);
		}

		async updateSourceReviewState(userId: number, sourceId: number | string, reviewId: number | string, input: IBlueskySourceReviewUpdateInput = {}) {
			assertBlueskyReviewModels(models);
			await app.checkUserCan(userId, CorePermissionName.AdminAll);
			const subscription = await getBlueskySourceSubscriptionRecord(models, userId, sourceId);
			const reviewRecord = await getBlueskySourceReviewRecord(models, userId, subscription, reviewId);
			await updateBlueskySourceReviewRecord(reviewRecord, getBlueskySourceReviewStateUpdateData(input, userId));
			return getBlueskySourceReviewReport(reviewRecord);
		}

		async importSourceReviewPost(userId: number, sourceId: number | string, reviewId: number | string, input: IBlueskySourceReviewImportInput = {}) {
			app.checkModules(['group', 'content', 'socNetImport']);
			await app.checkUserCan(userId, CorePermissionName.AdminAll);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			assertBlueskyReviewModels(models);
			const subscription = await getBlueskySourceSubscriptionRecord(models, userId, sourceId);
			const reviewRecord = await getBlueskySourceReviewRecord(models, userId, subscription, reviewId);
			const projection = getBlueskySourceReviewProjection(reviewRecord);
			assertBlueskySourceReviewImportable(reviewRecord);

			try {
				const dbChannel = await this.importPublicAuthorChannel(userId, getBlueskySourceReviewImportInput(subscription, input), subscription.actor, projection);
				const imported = await importBlueskyPublicAuthorFeedProjections(
					app,
					userId,
					dbChannel,
					[getBlueskyModeratedProjection(projection, parseBlueskySourceReviewDecision(reviewRecord))],
					getBlueskySourceReviewAdvancedSettings(input)
				);
				await updateBlueskySourceSubscriptionRecord(subscription, getBlueskySourceRefreshSuccessData({
					dbChannel,
					imported,
					refreshedAt: getNow(options)
				}));
				await updateBlueskySourceReviewRecord(reviewRecord, getBlueskySourceReviewImportedData(userId));
				return {
					source: getBlueskySourceSubscriptionReport(subscription),
					review: getBlueskySourceReviewReport(reviewRecord),
					dbChannel: getBlueskyImportChannelResult(dbChannel),
					imported
				};
			} catch (e) {
				await updateBlueskySourceReviewRecord(reviewRecord, {lastError: getErrorMessage(e)});
				throw e;
			}
		}

		async refreshSourceSubscription(userId: number, sourceId: number | string, input: IBlueskySourceRefreshInput = {}, refreshOptions: any = {}) {
			app.checkModules(['asyncOperation', 'group', 'content', 'socNetImport']);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			assertBlueskyModels(models);
			const subscription = await getBlueskySourceSubscriptionRecord(models, userId, sourceId);
			const refreshedAt = getNow(options);

			try {
				const refreshInput = getBlueskySourceRefreshImportInput(subscription, input);
				const preview = await this.getPublicAuthorFeedPreview(refreshInput);
				const projections = preview.list;
				if (!projections.length) {
					await updateBlueskySourceSubscriptionRecord(subscription, getBlueskySourceRefreshSuccessData({
						cursor: preview.cursor,
						imported: 0,
						refreshedAt
					}));
					return getBlueskySourceRefreshResult(subscription, preview.actor, preview.cursor, projections.length, 0, null, getEmptyRemoteContentModerationSummary());
				}
				const moderation = getBlueskyModeratedSourceProjections(preview.actor, subscription, refreshInput, projections);
				await storeBlueskySourceReviewProjections(models, userId, subscription, moderation.reviewProjections, refreshedAt);
				if (!moderation.projections.length) {
					await updateBlueskySourceSubscriptionRecord(subscription, getBlueskySourceRefreshSuccessData({
						cursor: preview.cursor,
						imported: 0,
						refreshedAt
					}));
					return getBlueskySourceRefreshResult(subscription, preview.actor, preview.cursor, projections.length, 0, null, moderation.summary);
				}

				const dbChannel = await this.importPublicAuthorChannel(userId, refreshInput, preview.actor, moderation.projections[0]);
				const imported = await importBlueskyPublicAuthorFeedProjections(
					app,
					userId,
					dbChannel,
					getBlueskyImportProjectionOrder(moderation.projections),
					getBlueskyImportAdvancedSettings(refreshInput),
					refreshOptions.asyncOperation
				);
				await updateBlueskySourceSubscriptionRecord(subscription, getBlueskySourceRefreshSuccessData({
					dbChannel,
					cursor: preview.cursor,
					imported,
					refreshedAt
				}));
				return getBlueskySourceRefreshResult(subscription, preview.actor, preview.cursor, projections.length, imported, dbChannel, moderation.summary);
			} catch (e) {
				await updateBlueskySourceSubscriptionRecord(subscription, {
					lastRefreshRequestedAt: refreshedAt,
					lastError: getErrorMessage(e)
				});
				throw e;
			}
		}

		async queueSourceSubscriptionRefresh(userId: number, sourceId: number | string, userApiKeyId: number | null = null, input: IBlueskySourceRefreshQueueInput = {}) {
			app.checkModules(['asyncOperation']);
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			assertBlueskyModels(models);
			const subscription = await getBlueskySourceSubscriptionRecord(models, userId, sourceId);
			const queue = await app.ms.asyncOperation.addUniqueUserOperationQueue(
				userId,
				blueskySourceRefreshQueueModuleName,
				userApiKeyId,
				getBlueskySourceRefreshJobInput(subscription, input)
			);
			await updateBlueskySourceSubscriptionRecord(subscription, {lastRefreshRequestedAt: getNow(options)});
			if (helpers.parseBoolean(input?.process, true)) {
				this.startSourceSubscriptionRefreshQueueProcessing();
			}
			return queue;
		}

		startSourceSubscriptionRefreshQueueProcessing(options: IBlueskySourceRefreshQueueProcessOptions = {}) {
			const limit = helpers.parsePositiveInteger(options.limit, blueskySourceRefreshQueueKickBatchLimit);
			void this.processSourceSubscriptionRefreshQueue({limit}).catch((e) => {
				console.error('processBlueskySourceRefreshQueue error', e);
			});
		}

		async processSourceSubscriptionRefreshQueue(options: IBlueskySourceRefreshQueueProcessOptions = {}) {
			app.checkModules(['asyncOperation']);
			const limit = helpers.parsePositiveInteger(options.limit, Number.MAX_SAFE_INTEGER);
			return app.ms.asyncOperation.processModuleOperationQueue(blueskySourceRefreshQueueModuleName, {
				limit,
				getPayload: (waitingQueue) => parseBlueskySourceRefreshJob(waitingQueue.inputJson),
				getAsyncOperationData: (_waitingQueue, job) => ({
					name: 'refresh-bluesky-source',
					channel: getBlueskySourceRefreshJobChannel(job),
					percent: 5
				}),
				run: (waitingQueue, asyncOperation, job) => this.refreshSourceSubscription(waitingQueue.userId, job.sourceId, job.input, {asyncOperation})
			});
		}

		async queueDueSourceSubscriptionRefreshes(options: IBlueskySourceRefreshPollOptions = {}) {
			app.checkModules(['asyncOperation']);
			assertBlueskyModels(models);
			const subscriptions = await getDueBlueskySourceRefreshSubscriptions(models, options);
			for (const subscription of subscriptions) {
				await app.ms.asyncOperation.addUniqueUserOperationQueue(
					subscription.userId,
					blueskySourceRefreshQueueModuleName,
					null,
					getBlueskySourceRefreshJobInput(subscription, options.refreshInput || {})
				);
				await updateBlueskySourceSubscriptionRecord(subscription, {lastRefreshRequestedAt: getNow(options)});
			}
			return {
				queued: subscriptions.length
			};
		}
	}

	return new BlueskyModule();
}

function getRequiredBlueskyActor(input: IBlueskyPublicAuthorFeedPreviewInput): string {
	return normalizeBlueskyActor(input?.actor || '');
}

function getOptionalBlueskyPreviewCursor(input: IBlueskyPublicAuthorFeedPreviewInput): string | undefined {
	const cursor = getOptionalString(input?.cursor);
	if (!cursor) {
		return undefined;
	}
	return cursor;
}

function getBlueskyPublicApiOrigin(app: IGeesomeApp): string | undefined {
	return app.config?.blueskyConfig?.publicApiOrigin;
}

function getBlueskyPublicApiTimeoutMs(app: IGeesomeApp): number | undefined {
	return app.config?.blueskyConfig?.publicApiTimeoutMs;
}

function getBlueskyAuthApiOrigin(app: IGeesomeApp): string | undefined {
	return app.config?.blueskyConfig?.authApiOrigin;
}

function getBlueskyAuthApiTimeoutMs(app: IGeesomeApp): number | undefined {
	return app.config?.blueskyConfig?.authApiTimeoutMs;
}

async function getBlueskyAccountSession(
	app: IGeesomeApp,
	options: any,
	input: {identifier: string; password: string}
): Promise<IBlueskySession> {
	return createBlueskySession({
		identifier: input.identifier,
		password: input.password,
		origin: getBlueskyAuthApiOrigin(app),
		timeoutMs: getBlueskyAuthApiTimeoutMs(app),
		fetch: options.fetch
	});
}

async function getBlueskyAccountProfile(app: IGeesomeApp, options: any, session: IBlueskySession): Promise<IBlueskyActorProfile> {
	return fetchBlueskyActorProfile({
		actor: session.did,
		origin: getBlueskyAuthApiOrigin(app),
		timeoutMs: getBlueskyAuthApiTimeoutMs(app),
		accessJwt: session.accessJwt,
		fetch: options.fetch
	});
}

async function getBlueskyAccountUpsertData(
	app: IGeesomeApp,
	userId: number,
	input: IBlueskyAccountLoginInput,
	session: IBlueskySession,
	profile: IBlueskyActorProfile
) {
	const existingAccount = await getExistingBlueskyAccountForLogin(app, userId, input, session, profile);
	const accountData: any = {
		socNet: blueskySocNet,
		accountId: session.did,
		username: profile.handle || session.handle || getRequiredBlueskyAccountLoginIdentifier(input),
		fullName: profile.displayName || profile.handle || session.handle || null,
		apiKey: getBlueskyAccountApiKeyForStorage(input),
		isEncrypted: helpers.parseBoolean(input.isEncrypted, false)
	};
	if (existingAccount?.id) {
		accountData.id = existingAccount.id;
	}
	return accountData;
}

async function getExistingBlueskyAccountForLogin(
	app: IGeesomeApp,
	userId: number,
	input: IBlueskyAccountLoginInput,
	session: IBlueskySession,
	profile: IBlueskyActorProfile
) {
	if (input.accountData?.id) {
		return getBlueskyAccountRecord(app, userId, input.accountData);
	}
	const byDid = await app.ms.socNetAccount.getAccount(userId, blueskySocNet, {accountId: session.did});
	if (byDid) {
		return byDid;
	}
	const handle = profile.handle || session.handle;
	if (!handle) {
		return null;
	}
	return app.ms.socNetAccount.getAccount(userId, blueskySocNet, {username: handle});
}

async function getBlueskyAccountRecord(app: IGeesomeApp, userId: number, accountData: any = {}) {
	const where = getBlueskyAccountWhere(accountData);
	const account = await app.ms.socNetAccount.getAccount(userId, blueskySocNet, where);
	if (!account) {
		throw new Error('bluesky_account_not_found');
	}
	return account;
}

function getBlueskyAccountWhere(accountData: any = {}) {
	const accountId = getNullablePositiveInteger(accountData?.id);
	if (accountId) {
		return {id: accountId};
	}
	const did = getOptionalString(accountData?.accountId);
	if (did) {
		return {accountId: did};
	}
	const username = getOptionalString(accountData?.username);
	if (username) {
		return {username: normalizeBlueskyActor(username)};
	}
	throw new Error('bluesky_account_id_required');
}

function getBlueskyAccountIdentifier(account, input: IBlueskyAccountVerifyInput): string {
	const explicitIdentifier = getOptionalString(input.accountData?.username) || getOptionalString(input.accountData?.accountId);
	if (explicitIdentifier) {
		return normalizeBlueskyActor(explicitIdentifier);
	}
	if (account.username) {
		return normalizeBlueskyActor(account.username);
	}
	if (account.accountId) {
		return account.accountId;
	}
	throw new Error('bluesky_account_identifier_required');
}

function getBlueskyAccountPassword(account, input: IBlueskyAccountVerifyInput): string {
	const password = getOptionalBlueskyAccountPassword(input);
	if (password) {
		return password;
	}
	if (account.isEncrypted) {
		throw new Error('bluesky_account_password_required');
	}
	if (account.apiKey) {
		return account.apiKey;
	}
	throw new Error('bluesky_account_password_required');
}

function getRequiredBlueskyAccountLoginIdentifier(input: IBlueskyAccountLoginInput): string {
	return normalizeBlueskyActor(input.identifier || input.accountData?.username || input.accountData?.accountId || '');
}

function getRequiredBlueskyAccountLoginPassword(input: IBlueskyAccountLoginInput): string {
	const password = getOptionalBlueskyAccountPassword(input);
	if (!password) {
		throw new Error('bluesky_account_password_required');
	}
	return password;
}

function getOptionalBlueskyAccountPassword(input: {password?: string; appPassword?: string; apiKey?: string} = {}): string | null {
	return getOptionalString(input.appPassword) || getOptionalString(input.password) || getOptionalString(input.apiKey);
}

function getBlueskyAccountApiKeyForStorage(input: IBlueskyAccountLoginInput): string {
	if (!helpers.parseBoolean(input.isEncrypted, false)) {
		return getRequiredBlueskyAccountLoginPassword(input);
	}
	const encryptedApiKey = getOptionalString(input.encryptedApiKey);
	if (!encryptedApiKey) {
		throw new Error('bluesky_account_encrypted_api_key_required');
	}
	return encryptedApiKey;
}

function assertBlueskyAccountMatchesSession(account, session: IBlueskySession): void {
	if (account.accountId) {
		if (account.accountId !== session.did) {
			throw new Error('bluesky_account_identity_mismatch');
		}
		return;
	}
	if (!account.username || !session.handle) {
		return;
	}
	if (normalizeBlueskyActor(account.username) !== normalizeBlueskyActor(session.handle)) {
		throw new Error('bluesky_account_identity_mismatch');
	}
}

function getBlueskyAccountVerificationResult(account, profile: IBlueskyActorProfile, session: IBlueskySession) {
	return {
		account: getBlueskyAccountReport(account),
		profile,
		did: session.did,
		handle: profile.handle || session.handle
	};
}

function getBlueskyAccountReport(account) {
	const accountObject = account?.toJSON ? account.toJSON() : account;
	return {
		id: accountObject.id,
		userId: accountObject.userId,
		socNet: accountObject.socNet,
		accountId: accountObject.accountId || null,
		username: accountObject.username || null,
		fullName: accountObject.fullName || null,
		hasApiKey: !!accountObject.apiKey,
		hasAccessToken: !!accountObject.accessToken,
		hasSessionKey: !!accountObject.sessionKey,
		isEncrypted: !!accountObject.isEncrypted
	};
}

async function assertCanCrossPostBlueskyPost(app: IGeesomeApp, userId: number, post: IPost): Promise<void> {
	if (!post?.id) {
		throw new Error('bluesky_cross_post_post_not_found');
	}
	if (post.status !== PostStatus.Published || post.isDeleted) {
		throw new Error('bluesky_cross_post_post_not_published');
	}
	if (post.isEncrypted || post.group?.isEncrypted) {
		throw new Error('bluesky_cross_post_encrypted_post_not_supported');
	}
	if (post.isRemote || getOptionalString(post.source)) {
		throw new Error('bluesky_cross_post_remote_post_not_supported');
	}
	if (!post.group?.isPublic) {
		throw new Error('bluesky_cross_post_group_not_public');
	}
	const canEditPost = await app.ms.group.canEditPostInGroup(userId, post.groupId, post.id);
	if (!canEditPost) {
		throw new Error('bluesky_cross_post_post_not_editable');
	}
}

async function getBlueskyCrossPostRecordInput(
	app: IGeesomeApp,
	options: any,
	post: IPost,
	input: IBlueskyCrossPostInput,
	session: IBlueskySession
) {
	const contents = await app.ms.group.getPostContentData(post, '', {
		includeText: true,
		includeJson: true
	});
	const primaryContent = getBlueskyCrossPostPrimaryContent(contents);
	if (!primaryContent) {
		throw new Error('bluesky_cross_post_text_required');
	}
	const imageContents = getBlueskyCrossPostImageContents(contents, primaryContent);
	const unsupportedContents = getBlueskyCrossPostUnsupportedContents(contents, primaryContent, imageContents);
	if (unsupportedContents.length > 0) {
		throw new Error('bluesky_cross_post_attachments_unsupported');
	}
	const imageResult = await getBlueskyCrossPostImageResult(app, options, session, imageContents);
	const textWithFacets = appendBlueskyCrossPostFallbackLinks(
		getBlueskyCrossPostAtProtoText(primaryContent),
		imageResult.fallbackLinks
	);
	if (!textWithFacets.text.trim()) {
		throw new Error('bluesky_cross_post_text_required');
	}
	return {
		text: textWithFacets.text,
		facets: textWithFacets.facets,
		langs: getBlueskyCrossPostLangs(input, primaryContent),
		createdAt: input.createdAt,
		embed: getBlueskyCrossPostEmbed(imageResult)
	};
}

function getBlueskyCrossPostPrimaryContent(contents: IContentData[]): IContentData | null {
	return contents.find((content) => {
		if (!isBlueskyCrossPostBodyContent(content)) {
			return false;
		}
		const textWithFacets = getBlueskyCrossPostAtProtoText(content);
		return !!textWithFacets.text.trim();
	}) || null;
}

function getBlueskyCrossPostImageContents(contents: IContentData[], primaryContent: IContentData): IContentData[] {
	const imageContents = contents.filter((content) => {
		if (content === primaryContent) {
			return false;
		}
		return isBlueskyCrossPostImageContent(content);
	});
	if (imageContents.length > blueskyImageMaxCount) {
		throw new Error('bluesky_cross_post_too_many_images');
	}
	return imageContents;
}

function getBlueskyCrossPostUnsupportedContents(
	contents: IContentData[],
	primaryContent: IContentData,
	imageContents: IContentData[]
): IContentData[] {
	const supportedContents = new Set([primaryContent, ...imageContents]);
	return contents.filter((content) => {
		if (supportedContents.has(content)) {
			return false;
		}
		return hasBlueskyCrossPostContentPayload(content);
	});
}

function isBlueskyCrossPostBodyContent(content: IContentData): boolean {
	return content?.view === ContentView.Contents;
}

function hasBlueskyCrossPostContentPayload(content: IContentData): boolean {
	if (!content) {
		return false;
	}
	if (content.text || content.json || content.storageId || content.manifestId || content.id) {
		return true;
	}
	return false;
}

async function getBlueskyCrossPostImageResult(
	app: IGeesomeApp,
	options: any,
	session: IBlueskySession,
	contents: IContentData[]
): Promise<IBlueskyCrossPostImageResult> {
	const result: IBlueskyCrossPostImageResult = {
		embeds: [],
		fallbackLinks: []
	};
	for (const content of contents) {
		const item = await getBlueskyCrossPostImageEmbedOrFallback(app, options, session, content);
		if (item.embed) {
			result.embeds.push(item.embed);
		}
		if (item.fallbackLink) {
			result.fallbackLinks.push(item.fallbackLink);
		}
	}
	return result;
}

async function getBlueskyCrossPostImageEmbedOrFallback(
	app: IGeesomeApp,
	options: any,
	session: IBlueskySession,
	content: IContentData
): Promise<{embed?: any; fallbackLink?: IBlueskyCrossPostImageFallbackLink}> {
	try {
		return {
			embed: await getBlueskyCrossPostImageEmbed(app, options, session, content)
		};
	} catch (e) {
		const fallbackLink = getBlueskyCrossPostImageFallbackLink(app, content);
		if (!fallbackLink) {
			throw e;
		}
		return {fallbackLink};
	}
}

async function getBlueskyCrossPostImageEmbed(app: IGeesomeApp, options: any, session: IBlueskySession, content: IContentData): Promise<any> {
	assertBlueskyCrossPostImageStorage(content);
	const preparedImage = await prepareBlueskyImageUploadData({
		data: await app.ms.storage.getFileData(content.storageId),
		mimeType: content.mimeType
	});
	const blob = await uploadBlueskyBlob({
		data: preparedImage.data,
		mimeType: preparedImage.mimeType,
		origin: getBlueskyAuthApiOrigin(app),
		timeoutMs: getBlueskyAuthApiTimeoutMs(app),
		fetch: options.fetch,
		accessJwt: session.accessJwt
	});
	return {
		image: blob,
		alt: getBlueskyCrossPostImageAlt(content),
		aspectRatio: preparedImage.aspectRatio
	};
}

function assertBlueskyCrossPostImageStorage(content: IContentData): void {
	if (!content.storageId) {
		throw new Error('bluesky_cross_post_image_storage_required');
	}
	const contentSize = getNullablePositiveInteger(content.size);
	if (contentSize && contentSize > blueskyImageMaxInputSize) {
		throw new Error('bluesky_cross_post_image_too_large');
	}
}

function isBlueskyCrossPostImageContent(content: IContentData): boolean {
	if (!content) {
		return false;
	}
	const mimeType = getOptionalString(content.mimeType)?.toLowerCase() || '';
	if (mimeType.startsWith('image/')) {
		return true;
	}
	return content.type === 'image';
}

function getBlueskyCrossPostEmbed(imageResult: IBlueskyCrossPostImageResult): any {
	if (imageResult.embeds.length > 0) {
		return buildBlueskyImageEmbed(imageResult.embeds);
	}
	if (imageResult.fallbackLinks.length === 1) {
		const fallbackLink = imageResult.fallbackLinks[0];
		return buildBlueskyExternalEmbed({
			uri: fallbackLink.uri,
			title: fallbackLink.title,
			description: fallbackLink.description
		});
	}
	return undefined;
}

function getBlueskyCrossPostAtProtoText(content: IContentData): {text: string; facets: any[]} {
	if (content.mimeType === RICH_TEXT_MIME_TYPE && isRichTextDocument(content.json)) {
		return richTextToAtProtoTextWithFacets(content.json);
	}
	if (typeof content.text === 'string') {
		return {
			text: content.text,
			facets: []
		};
	}
	return {
		text: '',
		facets: []
	};
}

function getBlueskyCrossPostLangs(input: IBlueskyCrossPostInput, primaryContent: IContentData): string[] {
	const inputLangs = getOptionalStringArray(input.langs, 3);
	if (inputLangs.length > 0) {
		return inputLangs;
	}
	if (isRichTextDocument(primaryContent.json) && primaryContent.json.lang) {
		return [primaryContent.json.lang];
	}
	return [];
}

function appendBlueskyCrossPostFallbackLinks(
	textWithFacets: {text: string; facets: any[]},
	fallbackLinks: IBlueskyCrossPostImageFallbackLink[]
): {text: string; facets: any[]} {
	const result = {
		text: textWithFacets.text,
		facets: [...textWithFacets.facets]
	};
	fallbackLinks.forEach((link) => {
		appendBlueskyCrossPostFallbackLink(result, link.uri);
	});
	return result;
}

function appendBlueskyCrossPostFallbackLink(textWithFacets: {text: string; facets: any[]}, uri: string): void {
	const separator = textWithFacets.text.endsWith('\n') || textWithFacets.text.length === 0 ? '' : '\n';
	const textBeforeLink = `${textWithFacets.text}${separator}`;
	const byteStart = Buffer.byteLength(textBeforeLink, 'utf8');
	const byteEnd = byteStart + Buffer.byteLength(uri, 'utf8');
	textWithFacets.text = `${textBeforeLink}${uri}`;
	textWithFacets.facets.push({
		$type: 'app.bsky.richtext.facet',
		index: {
			byteStart,
			byteEnd
		},
		features: [{
			$type: 'app.bsky.richtext.facet#link',
			uri
		}]
	});
}

function getBlueskyCrossPostImageAlt(content: IContentData): string {
	return getOptionalString(content.description) || getOptionalString(content.name) || '';
}

function getBlueskyCrossPostImageFallbackLink(app: IGeesomeApp, content: IContentData): IBlueskyCrossPostImageFallbackLink | null {
	if (!content.storageId) {
		return null;
	}
	const baseUrl = getBlueskyCrossPostContentBaseUrl(app);
	if (!baseUrl) {
		return null;
	}
	return {
		uri: `${baseUrl}${content.storageId}`,
		title: getBlueskyCrossPostImageAlt(content) || 'GeeSome image',
		description: 'GeeSome image attachment'
	};
}

function getBlueskyCrossPostContentBaseUrl(app: IGeesomeApp): string | null {
	const publicUrl = getOptionalString(app.config?.blueskyConfig?.publicUrl) ||
		getOptionalString(app.config?.activityPubConfig?.publicUrl);
	if (!publicUrl) {
		return null;
	}
	return `${normalizeBlueskyCrossPostPublicUrl(publicUrl)}/ipfs/`;
}

function normalizeBlueskyCrossPostPublicUrl(value: string): string {
	try {
		const parsedUrl = new URL(value);
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			throw new Error('bluesky_public_url_invalid');
		}
		parsedUrl.search = '';
		parsedUrl.hash = '';
		const path = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname.replace(/\/+$/, '');
		return `${parsedUrl.origin}${path}`;
	} catch (e) {
		if (e?.message === 'bluesky_public_url_invalid') {
			throw e;
		}
		throw new Error('bluesky_public_url_invalid');
	}
}

function getExistingBlueskyCrossPostRecord(post: IPost, did: string): IBlueskyRecordCreateResult | null {
	const existingRecord = getPostBlueskyProperties(post).crossPosts?.[did];
	if (!existingRecord?.uri || !existingRecord?.cid) {
		return null;
	}
	return {
		uri: existingRecord.uri,
		cid: existingRecord.cid
	};
}

async function storeBlueskyCrossPostRecord(
	app: IGeesomeApp,
	userId: number,
	post: IPost,
	account,
	profile: IBlueskyActorProfile,
	session: IBlueskySession,
	record: IBlueskyRecordCreateResult
): Promise<IPost> {
	const properties = parseBlueskyPropertiesJson(post.propertiesJson);
	const blueskyProperties = getPlainObject(properties.bluesky);
	blueskyProperties.crossPosts = {
		...getPlainObject(blueskyProperties.crossPosts),
		[session.did]: getBlueskyCrossPostRecordProperties(account, profile, session, record)
	};
	properties.bluesky = blueskyProperties;
	return app.ms.group.updatePost(userId, post.id, {
		propertiesJson: JSON.stringify(properties)
	});
}

function getBlueskyCrossPostRecordProperties(account, profile: IBlueskyActorProfile, session: IBlueskySession, record: IBlueskyRecordCreateResult) {
	return {
		uri: record.uri,
		cid: record.cid,
		did: session.did,
		handle: profile.handle || session.handle || null,
		accountId: account?.id || null,
		collection: blueskyFeedPostCollection,
		postedAt: new Date().toISOString()
	};
}

function getBlueskyCrossPostResult(
	post: IPost,
	account,
	profile: IBlueskyActorProfile,
	session: IBlueskySession,
	record: IBlueskyRecordCreateResult,
	alreadyExists: boolean
): IBlueskyCrossPostResult {
	return {
		account: getBlueskyAccountReport(account),
		profile,
		did: session.did,
		handle: profile.handle || session.handle,
		post: {
			id: post.id,
			groupId: post.groupId,
			status: post.status
		},
		record,
		alreadyExists
	};
}

function getBlueskyImportProjectionOrder(projections: IBlueskyPostProjection[]): IBlueskyPostProjection[] {
	return [...projections].reverse();
}

function getBlueskyImportAdvancedSettings(input: IBlueskyPublicAuthorFeedImportInput): any {
	const advancedSettings = {...input.advancedSettings};
	if (input.force !== undefined) {
		advancedSettings.force = !!input.force;
	}
	if (input.mergeSeconds !== undefined) {
		advancedSettings.mergeSeconds = input.mergeSeconds;
	}
	return advancedSettings;
}

function getBlueskyImportAccountId(input: IBlueskyPublicAuthorFeedImportInput): number | null {
	const accountId = Number(input.accountId);
	if (!Number.isFinite(accountId) || accountId <= 0) {
		return null;
	}
	return Math.floor(accountId);
}

function getBlueskyAuthorChannelMetadata(actor: string, projection: IBlueskyPostProjection) {
	const author = projection.author || {} as IBlueskyAuthorProjection;
	const id = projection.sourceIdentity.sourceChannelId;
	return {
		id,
		username: author.handle || actor || id,
		title: author.displayName || author.handle || actor || id,
		about: '',
		lang: projection.langs[0] || 'en'
	};
}

function getBlueskyAuthorChannelUpdateData(input: IBlueskyPublicAuthorFeedImportInput): any {
	const updateData = {};
	const groupName = getOptionalString(input.groupName);
	if (groupName) {
		updateData['name'] = groupName;
	}
	return updateData;
}

function getBlueskyImportChannelResult(dbChannel: ISocNetDbChannel) {
	return {
		id: dbChannel.id,
		groupId: dbChannel.groupId,
		channelId: dbChannel.channelId,
		title: dbChannel.title,
		socNet: dbChannel.socNet
	};
}

async function getBlueskySourceFeedDbChannel(app: IGeesomeApp, userId: number, subscription) {
	if (!subscription.dbChannelId) {
		throw new Error('bluesky_source_feed_not_ready');
	}
	const dbChannel = await app.ms.socNetImport.getDbChannel(userId, {id: subscription.dbChannelId});
	if (!dbChannel) {
		throw new Error('bluesky_source_feed_not_ready');
	}
	return dbChannel;
}

function getBlueskyImportProgress(processed: number, total: number): number {
	if (total <= 0) {
		return -1;
	}
	return Math.min(99, Math.floor((processed / total) * 100));
}

function getOptionalString(value: any): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	if (!value) {
		return null;
	}
	return value;
}

function getOptionalStringArray(value: any, limit: number): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map(item => getOptionalString(item))
		.filter(Boolean)
		.slice(0, limit) as string[];
}

function getPlainObject(value: any): any {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	return {...value};
}

async function importBlueskyPublicAuthorFeedProjections(app: IGeesomeApp, userId: number, dbChannel: ISocNetDbChannel, projections: IBlueskyPostProjection[], advancedSettings: any, asyncOperation: any = null): Promise<number> {
	let imported = 0;
	const client = new BlueskyImportClient(app, userId, dbChannel, projections, advancedSettings, async (m, _dbChannel, _post, type) => {
		if (type !== 'post' || !m) {
			return;
		}
		imported += 1;
		if (asyncOperation?.id) {
			await app.ms.asyncOperation.handleOperationCancel(userId, asyncOperation.id);
			await app.ms.asyncOperation.updateAsyncOperation(userId, asyncOperation.id, getBlueskyImportProgress(imported, projections.length));
		}
	});
	await app.ms.socNetImport.importChannelPosts(client);
	return imported;
}

function assertBlueskyModels(models): void {
	if (!models?.BlueskySourceSubscription) {
		throw new Error('bluesky_models_unavailable');
	}
}

function getBlueskySourceSubscriptionListParams(listParams?: IListParams): IListParams {
	return helpers.prepareListParams(listParams, blueskySourceSubscriptionListParams);
}

function getBlueskySourceSyncListParams(input: IBlueskySourceSyncInput): IListParams {
	return helpers.prepareListParams({
		limit: input.limit === undefined ? blueskySourceSyncDefaultLimit : input.limit,
		sortBy: 'publishedAt',
		sortDir: 'DESC'
	}, blueskySourceSyncListParams);
}

function getBlueskySourceReviewListParams(listParams?: IListParams): IListParams {
	return helpers.prepareListParams(listParams, blueskySourceReviewListParams);
}

function getBlueskySourceSyncPostFilters(dbChannel: ISocNetDbChannel, input: IBlueskySourceSyncInput = {}) {
	return {
		source: blueskyPostSource,
		sourceChannelId: dbChannel.channelId,
		sourcePostIdNe: null,
		cursorPublishedAt: input.cursorPublishedAt,
		cursorId: input.cursorId
	};
}

function getEmptyBlueskySourceSyncState() {
	return {
		checked: 0,
		updated: 0,
		deleted: 0,
		skipped: 0,
		failed: 0,
		errors: [] as IBlueskySourceSyncError[]
	};
}

async function getBlueskySourcePostSyncDecision(
	app: IGeesomeApp,
	postRef,
	dbChannel: ISocNetDbChannel,
	input: IBlueskySourceSyncInput,
	moderationPolicy: IRemoteContentModerationPolicy,
	moderationDecisions: IRemoteContentModerationDecision[],
	moderationContext: {actor?: string | null; groupName?: string | null},
	fetchImpl
) {
	const sourcePostId = getOptionalString(postRef?.sourcePostId);
	if (!sourcePostId || !parseBlueskyPostAtUri(sourcePostId)) {
		return {
			error: getBlueskySourceSyncError(postRef, 'bluesky_post_uri_invalid')
		};
	}
	try {
		const record = await fetchBlueskyPostRecord({
			uri: sourcePostId,
			origin: getBlueskyPublicApiOrigin(app),
			timeoutMs: getBlueskyPublicApiTimeoutMs(app),
			fetch: fetchImpl
		});
		if (!record.exists) {
			return {deletePostId: postRef.id};
		}
		if (!record.projection) {
			return {};
		}
		if (!isBlueskyProjectionForDbChannel(record.projection, dbChannel)) {
			return {
				error: getBlueskySourceSyncError(postRef, 'bluesky_source_identity_mismatch')
			};
		}
		const moderationDecision = getBlueskyProjectionModerationDecision(record.projection, moderationPolicy, moderationContext);
		moderationDecisions.push(moderationDecision);
		if (!isRemoteContentModerationDecisionImportable(moderationDecision)) {
			return {deletePostId: postRef.id};
		}
		if (!shouldUpdateBlueskyImportedPost(postRef, record.projection, input)) {
			return {};
		}
		return {
			updateProjection: getBlueskyModeratedProjection(record.projection, moderationDecision)
		};
	} catch (e) {
		return {
			error: getBlueskySourceSyncError(postRef, getErrorMessage(e))
		};
	}
}

function isBlueskyProjectionForDbChannel(projection: IBlueskyPostProjection, dbChannel: ISocNetDbChannel): boolean {
	return projection.sourceIdentity.source === blueskyPostSource &&
		projection.sourceIdentity.sourceChannelId === dbChannel.channelId;
}

function shouldUpdateBlueskyImportedPost(postRef, projection: IBlueskyPostProjection, input: IBlueskySourceSyncInput): boolean {
	if (helpers.parseBoolean(input.force, false)) {
		return true;
	}
	const existingBlueskyProperties = getPostBlueskyProperties(postRef);
	return (existingBlueskyProperties.cid || null) !== (projection.cid || null);
}

function getPostBlueskyProperties(postRef): any {
	const properties = parseBlueskyPropertiesJson(postRef?.propertiesJson);
	return properties.bluesky || {};
}

function parseBlueskyPropertiesJson(propertiesJson: string | null | undefined): any {
	if (!propertiesJson) {
		return {};
	}
	try {
		return JSON.parse(propertiesJson);
	} catch (_e) {
		return {};
	}
}

function getBlueskySourceSyncError(postRef, message: string): IBlueskySourceSyncError {
	return {
		postId: postRef?.id,
		sourcePostId: getOptionalString(postRef?.sourcePostId),
		message
	};
}

function appendBlueskySourceSyncError(errors: IBlueskySourceSyncError[], error: IBlueskySourceSyncError): void {
	if (errors.length >= blueskySourceSyncErrorLimit) {
		return;
	}
	errors.push(error);
}

function getBlueskySourceSubscriptionWhere(userId: number, filters: IBlueskySourceSubscriptionFilters = {}) {
	const where: any = {
		userId
	};
	if (isKnownBlueskySourceSubscriptionStatus(filters.status)) {
		where.status = filters.status;
	} else {
		where.status = {
			[Op.notIn]: [BlueskySourceSubscriptionStatus.Removed]
		};
	}
	if (filters.actor) {
		where.actor = normalizeBlueskyActor(filters.actor);
	}
	return where;
}

function getBlueskySourceSubscriptionCreateData(userId: number, input: IBlueskySourceSubscriptionInput) {
	const moderationPolicy = getBlueskyInputModerationPolicy(input);
	return {
		userId,
		actor: getRequiredBlueskySourceActor(input),
		filter: getOptionalBlueskySourceFilter(input.filter),
		displayName: getOptionalBoundedString(input.displayName, 200) || null,
		status: BlueskySourceSubscriptionStatus.Active,
		groupName: getOptionalBoundedString(input.groupName, 200) || null,
		accountId: getNullablePositiveInteger(input.accountId),
		importLimit: getNullableImportLimit(input.importLimit),
		moderationMode: moderationPolicy.mode,
		moderationRulesJson: getBlueskyModerationRulesJson(moderationPolicy.rules),
		lastError: null
	};
}

function getExistingBlueskySourceSubscriptionUpdateData(subscriptionData) {
	return {
		filter: subscriptionData.filter,
		displayName: subscriptionData.displayName,
		status: BlueskySourceSubscriptionStatus.Active,
		groupName: subscriptionData.groupName,
		accountId: subscriptionData.accountId,
		importLimit: subscriptionData.importLimit,
		moderationMode: subscriptionData.moderationMode,
		moderationRulesJson: subscriptionData.moderationRulesJson,
		lastError: null
	};
}

function getBlueskySourceSubscriptionUpdateData(input: IBlueskySourceSubscriptionUpdateInput, subscription) {
	const updateData = {} as any;
	if (input.filter !== undefined) {
		updateData.filter = getOptionalBlueskySourceFilter(input.filter);
	}
	if (input.displayName !== undefined) {
		updateData.displayName = getOptionalBoundedString(input.displayName, 200) || null;
	}
	if (input.status !== undefined) {
		updateData.status = getRequiredMutableBlueskySourceSubscriptionStatus(input.status);
	}
	if (input.groupName !== undefined) {
		updateData.groupName = getOptionalBoundedString(input.groupName, 200) || null;
	}
	if (input.accountId !== undefined) {
		updateData.accountId = getNullablePositiveInteger(input.accountId);
	}
	if (input.importLimit !== undefined) {
		updateData.importLimit = getNullableImportLimit(input.importLimit);
	}
	if (input.moderationMode !== undefined || input.moderationRules !== undefined) {
		const moderationPolicy = getBlueskyInputModerationPolicy(input, getBlueskySubscriptionModerationPolicyInput(subscription));
		updateData.moderationMode = moderationPolicy.mode;
		updateData.moderationRulesJson = getBlueskyModerationRulesJson(moderationPolicy.rules);
	}
	return updateData;
}

function getBlueskySourceRefreshImportInput(subscription, input: IBlueskySourceRefreshInput): IBlueskyPublicAuthorFeedImportInput {
	return {
		actor: subscription.actor,
		filter: getOptionalBlueskySourceFilter(input.filter || subscription.filter),
		cursor: getBlueskySourceRefreshCursor(subscription, input),
		limit: getBlueskySourceRefreshLimit(subscription, input),
		accountId: subscription.accountId || null,
		groupName: subscription.groupName || undefined,
		advancedSettings: input.advancedSettings || {},
		force: input.force === undefined ? undefined : helpers.parseBoolean(input.force, false),
		mergeSeconds: getNullablePositiveInteger(input.mergeSeconds) || undefined,
		moderationPolicy: input.moderationPolicy
	};
}

function getBlueskySourceRefreshCursor(subscription, input: IBlueskySourceRefreshInput): string | undefined {
	if (Object.prototype.hasOwnProperty.call(input, 'cursor')) {
		return getOptionalString(input.cursor) || undefined;
	}
	return getOptionalString(subscription.lastCursor) || undefined;
}

function getBlueskySourceRefreshLimit(subscription, input: IBlueskySourceRefreshInput): number | undefined {
	if (input.limit !== undefined) {
		return getNullableImportLimit(input.limit) || undefined;
	}
	return subscription.importLimit || undefined;
}

function getBlueskySourceRefreshSuccessData(options: {dbChannel?: ISocNetDbChannel | null; cursor?: string | null; imported: number; refreshedAt: Date}) {
	const updateData: any = {
		lastRefreshRequestedAt: options.refreshedAt,
		lastError: null
	};
	if (options.cursor !== undefined) {
		updateData.lastCursor = options.cursor || null;
	}
	if (options.dbChannel) {
		updateData.dbChannelId = options.dbChannel.id;
	}
	if (options.imported > 0) {
		updateData.lastImportedAt = options.refreshedAt;
	}
	return updateData;
}

function getBlueskySourceRefreshResult(
	subscription,
	actor: string,
	cursor: string | null,
	fetched: number,
	imported: number,
	dbChannel: ISocNetDbChannel | null,
	moderation: IRemoteContentModerationSummary = getEmptyRemoteContentModerationSummary()
) {
	return {
		source: getBlueskySourceSubscriptionReport(subscription),
		actor,
		cursor,
		fetched,
		imported,
		moderation,
		dbChannel: dbChannel ? getBlueskyImportChannelResult(dbChannel) : null
	};
}

function getBlueskySourceRefreshJobInput(subscription, input: IBlueskySourceRefreshQueueInput = {}) {
	return {
		type: 'source-refresh',
		sourceId: subscription.id,
		input: getBlueskySourceRefreshJobInputData(input)
	};
}

function getBlueskySourceRefreshJobInputData(input: IBlueskySourceRefreshQueueInput): IBlueskySourceRefreshInput {
	const jobInput: IBlueskySourceRefreshInput = {};
	if (Object.prototype.hasOwnProperty.call(input, 'cursor')) {
		jobInput.cursor = getOptionalString(input.cursor);
	}
	if (input.filter !== undefined) {
		jobInput.filter = getOptionalBlueskySourceFilter(input.filter);
	}
	if (input.limit !== undefined) {
		jobInput.limit = getNullableImportLimit(input.limit);
	}
	if (input.force !== undefined) {
		jobInput.force = helpers.parseBoolean(input.force, false);
	}
	if (input.mergeSeconds !== undefined) {
		jobInput.mergeSeconds = getNullablePositiveInteger(input.mergeSeconds);
	}
	if (input.advancedSettings !== undefined) {
		jobInput.advancedSettings = input.advancedSettings || {};
	}
	if (input.moderationPolicy !== undefined) {
		jobInput.moderationPolicy = getBlueskySourceRefreshJobModerationPolicy(input.moderationPolicy);
	}
	return jobInput;
}

function getBlueskyModeratedSourceProjections(
	actor: string,
	subscription,
	input: IBlueskyPublicAuthorFeedImportInput,
	projections: IBlueskyPostProjection[]
) {
	const policy = getBlueskySourceModerationPolicy(subscription, input);
	const decisions: IRemoteContentModerationDecision[] = [];
	const reviewProjections: {projection: IBlueskyPostProjection; decision: IRemoteContentModerationDecision}[] = [];
	const moderatedProjections = projections
		.map((projection) => {
			const decision = getBlueskyProjectionModerationDecision(projection, policy, {
				actor,
				groupName: input.groupName || subscription.groupName
			});
			decisions.push(decision);
			if (!isRemoteContentModerationDecisionImportable(decision)) {
				reviewProjections.push({projection, decision});
				return null;
			}
			return getBlueskyModeratedProjection(projection, decision);
		})
		.filter(Boolean) as IBlueskyPostProjection[];
	return {
		projections: moderatedProjections,
		reviewProjections,
		summary: getRemoteContentModerationSummary(decisions)
	};
}

async function storeBlueskySourceReviewProjections(models, userId: number, subscription, reviewProjections, refreshedAt: Date): Promise<void> {
	if (!reviewProjections.length) {
		return;
	}
	assertBlueskyReviewModels(models);
	for (const reviewProjection of reviewProjections) {
		await upsertBlueskySourceReviewRecord(models, getBlueskySourceReviewData(userId, subscription, reviewProjection, refreshedAt));
	}
}

async function upsertBlueskySourceReviewRecord(models, reviewData) {
	const existingReview = await models.BlueskySourcePostReview.findOne({
		where: {
			sourceSubscriptionId: reviewData.sourceSubscriptionId,
			uri: reviewData.uri
		}
	});
	if (existingReview) {
		return updateBlueskySourceReviewRecord(existingReview, getExistingBlueskySourceReviewUpdateData(existingReview, reviewData));
	}

	try {
		return await models.BlueskySourcePostReview.create(reviewData);
	} catch (e) {
		if (!isBlueskySourceReviewUniqueError(e)) {
			throw e;
		}
		const createdReview = await models.BlueskySourcePostReview.findOne({
			where: {
				sourceSubscriptionId: reviewData.sourceSubscriptionId,
				uri: reviewData.uri
			}
		});
		if (!createdReview) {
			throw e;
		}
		return updateBlueskySourceReviewRecord(createdReview, getExistingBlueskySourceReviewUpdateData(createdReview, reviewData));
	}
}

function getBlueskySourceReviewData(userId: number, subscription, reviewProjection, refreshedAt: Date) {
	const {projection, decision} = reviewProjection;
	return {
		userId,
		sourceSubscriptionId: subscription.id,
		actor: subscription.actor,
		uri: projection.uri,
		cid: projection.cid || null,
		sourceChannelId: projection.sourceIdentity.sourceChannelId,
		state: getBlueskySourceReviewStateFromDecision(decision),
		moderationAction: decision.action,
		moderationDecisionJson: JSON.stringify(decision),
		projectionJson: JSON.stringify(projection),
		publishedAt: getBlueskyProjectionDateValue(projection),
		importedAt: null,
		reviewedAt: null,
		reviewedByUserId: null,
		lastError: null,
		updatedAt: refreshedAt
	};
}

function getExistingBlueskySourceReviewUpdateData(existingReview, reviewData) {
	const updateData = {
		...reviewData,
		state: getUpdatedBlueskySourceReviewState(existingReview, reviewData.state),
		importedAt: existingReview.importedAt || null,
		reviewedAt: getUpdatedBlueskySourceReviewReviewedAt(existingReview, reviewData.state),
		reviewedByUserId: getUpdatedBlueskySourceReviewReviewedByUserId(existingReview, reviewData.state)
	};
	if (updateData.state === existingReview.state) {
		delete updateData['state'];
	}
	return updateData;
}

function getUpdatedBlueskySourceReviewState(existingReview, nextState: BlueskySourcePostReviewState): BlueskySourcePostReviewState {
	if (existingReview.state === BlueskySourcePostReviewState.Imported || existingReview.state === BlueskySourcePostReviewState.Rejected) {
		return existingReview.state;
	}
	return nextState;
}

function getUpdatedBlueskySourceReviewReviewedAt(existingReview, nextState: BlueskySourcePostReviewState): Date | null {
	if (existingReview.state === BlueskySourcePostReviewState.Imported || existingReview.state === BlueskySourcePostReviewState.Rejected) {
		return existingReview.reviewedAt || null;
	}
	if (nextState === BlueskySourcePostReviewState.Pending || nextState === BlueskySourcePostReviewState.Quarantined || nextState === BlueskySourcePostReviewState.Blocked) {
		return null;
	}
	return existingReview.reviewedAt || null;
}

function getUpdatedBlueskySourceReviewReviewedByUserId(existingReview, nextState: BlueskySourcePostReviewState): number | null {
	if (existingReview.state === BlueskySourcePostReviewState.Imported || existingReview.state === BlueskySourcePostReviewState.Rejected) {
		return existingReview.reviewedByUserId || null;
	}
	if (nextState === BlueskySourcePostReviewState.Pending || nextState === BlueskySourcePostReviewState.Quarantined || nextState === BlueskySourcePostReviewState.Blocked) {
		return null;
	}
	return existingReview.reviewedByUserId || null;
}

function getBlueskySourceReviewStateFromDecision(decision: IRemoteContentModerationDecision): BlueskySourcePostReviewState {
	if (decision.action === 'block') {
		return BlueskySourcePostReviewState.Blocked;
	}
	if (decision.action === 'quarantine') {
		return BlueskySourcePostReviewState.Quarantined;
	}
	return BlueskySourcePostReviewState.Pending;
}

function getBlueskySourceReviewWhere(userId: number, subscription, filters: IBlueskySourceReviewFilters = {}) {
	const where: any = {
		userId,
		sourceSubscriptionId: subscription.id
	};
	if (isKnownBlueskySourcePostReviewState(filters.state)) {
		where.state = filters.state;
	} else {
		where.state = {
			[Op.notIn]: [BlueskySourcePostReviewState.Imported, BlueskySourcePostReviewState.Rejected]
		};
	}
	return where;
}

async function getBlueskySourceReviewRecord(models, userId: number, subscription, reviewId: number | string) {
	const reviewIdNumber = getNullablePositiveInteger(reviewId);
	if (!reviewIdNumber) {
		throw new Error('bluesky_source_review_not_found');
	}
	const reviewRecord = await models.BlueskySourcePostReview.findOne({
		where: {
			id: reviewIdNumber,
			userId,
			sourceSubscriptionId: subscription.id
		}
	});
	if (!reviewRecord) {
		throw new Error('bluesky_source_review_not_found');
	}
	return reviewRecord;
}

async function updateBlueskySourceReviewRecord(reviewRecord, updateData) {
	const changedData = getChangedBlueskySourceReviewData(reviewRecord, updateData);
	if (!Object.keys(changedData).length) {
		return reviewRecord;
	}
	await reviewRecord.update(changedData);
	return reviewRecord;
}

function getBlueskySourceReviewStateUpdateData(input: IBlueskySourceReviewUpdateInput, reviewedByUserId: number) {
	const state = getRequiredMutableBlueskySourcePostReviewState(input.state);
	return {
		state,
		reviewedAt: state === BlueskySourcePostReviewState.Pending ? null : new Date(),
		reviewedByUserId: state === BlueskySourcePostReviewState.Pending ? null : reviewedByUserId,
		lastError: null
	};
}

function getBlueskySourceReviewImportedData(reviewedByUserId: number) {
	const now = new Date();
	return {
		state: BlueskySourcePostReviewState.Imported,
		importedAt: now,
		reviewedAt: now,
		reviewedByUserId,
		lastError: null
	};
}

function getBlueskySourceReviewReport(reviewRecord) {
	const projection = getBlueskySourceReviewProjection(reviewRecord);
	return {
		id: reviewRecord.id,
		userId: reviewRecord.userId,
		sourceSubscriptionId: reviewRecord.sourceSubscriptionId,
		actor: reviewRecord.actor,
		uri: reviewRecord.uri,
		cid: reviewRecord.cid || null,
		sourceChannelId: reviewRecord.sourceChannelId,
		state: reviewRecord.state,
		moderationAction: reviewRecord.moderationAction,
		moderationDecision: parseBlueskySourceReviewDecision(reviewRecord),
		preview: projection ? getBlueskyProjectionPreview(projection) : null,
		publishedAt: reviewRecord.publishedAt || null,
		importedAt: reviewRecord.importedAt || null,
		reviewedAt: reviewRecord.reviewedAt || null,
		reviewedByUserId: reviewRecord.reviewedByUserId || null,
		lastError: reviewRecord.lastError || null,
		createdAt: reviewRecord.createdAt,
		updatedAt: reviewRecord.updatedAt
	};
}

function getBlueskySourceReviewProjection(reviewRecord): IBlueskyPostProjection {
	const projection = parseJsonObject(reviewRecord.projectionJson);
	if (!projection?.uri) {
		throw new Error('bluesky_source_review_projection_invalid');
	}
	return projection as IBlueskyPostProjection;
}

function parseBlueskySourceReviewDecision(reviewRecord): IRemoteContentModerationDecision {
	return parseJsonObject(reviewRecord.moderationDecisionJson) as IRemoteContentModerationDecision;
}

function getBlueskySourceReviewImportInput(subscription, _input: IBlueskySourceReviewImportInput): IBlueskyPublicAuthorFeedImportInput {
	return {
		actor: subscription.actor,
		accountId: subscription.accountId || null,
		groupName: subscription.groupName || undefined
	};
}

function getBlueskySourceReviewAdvancedSettings(input: IBlueskySourceReviewImportInput): any {
	return {
		force: helpers.parseBoolean(input.force, true)
	};
}

function assertBlueskySourceReviewImportable(reviewRecord): void {
	if (reviewRecord.state === BlueskySourcePostReviewState.Pending || reviewRecord.state === BlueskySourcePostReviewState.Quarantined) {
		return;
	}
	throw new Error('bluesky_source_review_not_importable');
}

function getBlueskyProjectionDateValue(projection: IBlueskyPostProjection): Date | null {
	return getDateValue(projection?.createdAt) || getDateValue(projection?.indexedAt);
}

function getChangedBlueskySourceReviewData(reviewRecord, updateData) {
	const changedData = {};
	Object.keys(updateData).forEach((key) => {
		if (isSameBlueskyReviewValue(reviewRecord[key], updateData[key])) {
			return;
		}
		changedData[key] = updateData[key];
	});
	return changedData;
}

function parseJsonObject(value: string | null | undefined): any {
	if (!value) {
		return {};
	}
	try {
		const parsed = JSON.parse(value);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return {};
		}
		return parsed;
	} catch (_e) {
		return {};
	}
}

function isSameBlueskyReviewValue(left, right): boolean {
	if (left instanceof Date || right instanceof Date) {
		return getNullableDateTime(left) === getNullableDateTime(right);
	}
	return left === right;
}

function getBlueskySourceModerationPolicy(subscription, input: {moderationPolicy?: IRemoteContentModerationPolicyInput} = {}): IRemoteContentModerationPolicy {
	return normalizeRemoteContentModerationPolicy({
		mode: input.moderationPolicy?.mode ?? getBlueskySubscriptionModerationMode(subscription),
		rules: input.moderationPolicy?.rules ?? getBlueskySubscriptionModerationRules(subscription)
	});
}

function getBlueskySourceSyncModerationContext(subscription, dbChannel: ISocNetDbChannel) {
	return {
		actor: subscription.actor || dbChannel.channelId,
		groupName: subscription.groupName || dbChannel.title
	};
}

function getBlueskyInputModerationPolicy(input: any, fallback: IRemoteContentModerationPolicyInput = {}): IRemoteContentModerationPolicy {
	const policyInput = input?.moderationPolicy || {};
	return normalizeRemoteContentModerationPolicy({
		mode: input?.moderationMode ?? policyInput.mode ?? fallback.mode,
		rules: input?.moderationRules ?? policyInput.rules ?? fallback.rules
	});
}

function getBlueskySourceRefreshJobModerationPolicy(input: IRemoteContentModerationPolicyInput): IRemoteContentModerationPolicyInput {
	const normalizedPolicy = getBlueskyInputModerationPolicy({moderationPolicy: input});
	const jobPolicy: IRemoteContentModerationPolicyInput = {};
	if (input?.mode !== undefined) {
		jobPolicy.mode = normalizedPolicy.mode;
	}
	if (input?.rules !== undefined) {
		jobPolicy.rules = normalizedPolicy.rules;
	}
	return jobPolicy;
}

function getBlueskySubscriptionModerationPolicyInput(subscription): IRemoteContentModerationPolicyInput {
	return {
		mode: getBlueskySubscriptionModerationMode(subscription),
		rules: getBlueskySubscriptionModerationRules(subscription)
	};
}

function getBlueskyProjectionModerationDecision(
	projection: IBlueskyPostProjection,
	policy: IRemoteContentModerationPolicy,
	context: {actor?: string | null; groupName?: string | null} = {}
): IRemoteContentModerationDecision {
	return evaluateRemoteContentModerationPolicy(policy, {
		text: projection.text || '',
		source: getBlueskyProjectionSourceModerationValues(projection, context.actor),
		groupName: context.groupName || ''
	});
}

function getBlueskyModeratedProjection(
	projection: IBlueskyPostProjection,
	moderationDecision: IRemoteContentModerationDecision
): IBlueskyPostProjection {
	return {
		...projection,
		moderationDecision
	};
}

function getBlueskyProjectionSourceModerationValues(projection: IBlueskyPostProjection, actor?: string | null): string[] {
	return [
		actor || '',
		projection.author?.did || '',
		projection.author?.handle || '',
		projection.author?.displayName || '',
		projection.sourceIdentity?.sourceChannelId || ''
	].filter(Boolean);
}

function getBlueskySubscriptionModerationMode(subscription): RemoteContentModerationMode {
	return getBlueskyInputModerationPolicy({
		moderationMode: subscription?.moderationMode || RemoteContentModerationMode.AutoImport,
		moderationRules: getBlueskySubscriptionModerationRules(subscription)
	}).mode;
}

function getBlueskySubscriptionModerationRules(subscription) {
	return getBlueskyInputModerationPolicy({
		moderationMode: subscription?.moderationMode || RemoteContentModerationMode.AutoImport,
		moderationRules: parseBlueskyModerationRulesJson(subscription?.moderationRulesJson)
	}).rules;
}

function getBlueskyModerationRulesJson(rules): string | null {
	if (!rules || !rules.length) {
		return null;
	}
	return JSON.stringify(rules);
}

function parseBlueskyModerationRulesJson(value: string | null | undefined) {
	if (!value) {
		return [];
	}
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch (_e) {
		return [];
	}
}

function getEmptyRemoteContentModerationSummary(): IRemoteContentModerationSummary {
	return {
		allowed: 0,
		review: 0,
		quarantined: 0,
		blocked: 0,
		matches: 0
	};
}

function parseBlueskySourceRefreshJob(inputJson: string) {
	const job = JSON.parse(inputJson || '{}');
	const sourceId = getNullablePositiveInteger(job.sourceId);
	if (job.type !== 'source-refresh' || !sourceId) {
		throw new Error('bluesky_source_refresh_job_invalid');
	}
	return {
		type: 'source-refresh',
		sourceId,
		input: job.input || {}
	};
}

function getBlueskySourceRefreshJobChannel(job): string {
	return `bluesky-source-refresh:${job.sourceId}`;
}

function getNow(options: any = {}): Date {
	if (options.now) {
		return new Date(options.now);
	}
	return new Date();
}

async function getDueBlueskySourceRefreshSubscriptions(models, options: IBlueskySourceRefreshPollOptions = {}) {
	const now = getNow(options);
	const staleMs = helpers.parsePositiveInteger(options.staleMs, blueskySourceRefreshPollDefaultStaleMs);
	const limit = helpers.parsePositiveInteger(options.limit, blueskySourceRefreshPollDefaultLimit);
	const cutoff = new Date(now.getTime() - staleMs);
	return models.BlueskySourceSubscription.findAll({
		where: {
			status: BlueskySourceSubscriptionStatus.Active,
			[Op.or]: [
				{lastRefreshRequestedAt: null},
				{lastRefreshRequestedAt: {[Op.lt]: cutoff}}
			]
		},
		order: [['lastRefreshRequestedAt', 'ASC'], ['id', 'ASC']],
		limit
	});
}

async function getBlueskySourceSubscriptionRecord(models, userId: number, sourceId: number | string) {
	const sourceIdNumber = getNullablePositiveInteger(sourceId);
	if (!sourceIdNumber) {
		throw new Error('bluesky_source_subscription_not_found');
	}
	const subscription = await models.BlueskySourceSubscription.findOne({
		where: {
			id: sourceIdNumber,
			userId,
			status: {
				[Op.notIn]: [BlueskySourceSubscriptionStatus.Removed]
			}
		}
	});
	if (!subscription) {
		throw new Error('bluesky_source_subscription_not_found');
	}
	return subscription;
}

async function updateBlueskySourceSubscriptionRecord(subscription, updateData): Promise<void> {
	const changedData = getChangedBlueskySourceSubscriptionData(subscription, updateData);
	if (!Object.keys(changedData).length) {
		return;
	}
	await subscription.update(changedData);
}

function getChangedBlueskySourceSubscriptionData(subscription, updateData) {
	const changedData = {};
	Object.keys(updateData).forEach((key) => {
		if (subscription[key] === updateData[key]) {
			return;
		}
		changedData[key] = updateData[key];
	});
	return changedData;
}

function getBlueskySourceSubscriptionReport(subscription) {
	return {
		id: subscription.id,
		userId: subscription.userId,
		actor: subscription.actor,
		filter: subscription.filter || null,
		displayName: subscription.displayName || null,
		status: subscription.status,
		groupName: subscription.groupName || null,
		accountId: subscription.accountId || null,
		importLimit: subscription.importLimit || null,
		moderationMode: getBlueskySubscriptionModerationMode(subscription),
		moderationRules: getBlueskySubscriptionModerationRules(subscription),
		dbChannelId: subscription.dbChannelId || null,
		lastCursor: subscription.lastCursor || null,
		lastRefreshRequestedAt: subscription.lastRefreshRequestedAt || null,
		lastImportedAt: subscription.lastImportedAt || null,
		lastError: subscription.lastError || null,
		createdAt: subscription.createdAt,
		updatedAt: subscription.updatedAt
	};
}

function getRequiredBlueskySourceActor(input: IBlueskySourceSubscriptionInput): string {
	return normalizeBlueskyActor(input?.actor || '');
}

function getOptionalBlueskySourceFilter(value: string | null | undefined): string | null {
	return normalizeBlueskyAuthorFeedFilter(value || undefined) || null;
}

function getOptionalBoundedString(value: any, maxLength: number): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const stringValue = String(value || '').trim();
	if (!stringValue) {
		return '';
	}
	return stringValue.slice(0, maxLength);
}

function getNullablePositiveInteger(value: any): number | null {
	const parsed = Number.parseInt(String(value || ''), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return null;
	}
	return parsed;
}

function getNullableImportLimit(value: any): number | null {
	const parsed = getNullablePositiveInteger(value);
	if (!parsed) {
		return null;
	}
	return Math.min(parsed, 100);
}

function isKnownBlueskySourceSubscriptionStatus(status): status is BlueskySourceSubscriptionStatus {
	return Object.values(BlueskySourceSubscriptionStatus).includes(status);
}

function isKnownBlueskySourcePostReviewState(state): state is BlueskySourcePostReviewState {
	return Object.values(BlueskySourcePostReviewState).includes(state);
}

function getRequiredMutableBlueskySourceSubscriptionStatus(status): BlueskySourceSubscriptionStatus {
	if (status === BlueskySourceSubscriptionStatus.Active || status === BlueskySourceSubscriptionStatus.Paused) {
		return status;
	}
	throw new Error('bluesky_source_subscription_status_invalid');
}

function getRequiredMutableBlueskySourcePostReviewState(state): BlueskySourcePostReviewState {
	if (
		state === BlueskySourcePostReviewState.Pending ||
		state === BlueskySourcePostReviewState.Quarantined ||
		state === BlueskySourcePostReviewState.Blocked ||
		state === BlueskySourcePostReviewState.Rejected
	) {
		return state;
	}
	throw new Error('bluesky_source_review_state_invalid');
}

function isBlueskySourceSubscriptionUniqueError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function isBlueskySourceReviewUniqueError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function assertBlueskyReviewModels(models): void {
	assertBlueskyModels(models);
	if (!models?.BlueskySourcePostReview) {
		throw new Error('bluesky_review_models_unavailable');
	}
}

function getErrorMessage(error): string {
	return error?.message || String(error || 'unknown');
}

function getNullableDateTime(value): number | null {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) {
		return null;
	}
	return date.getTime();
}

function getDateValue(value: string | null | undefined): Date | null {
	if (!value) {
		return null;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	return date;
}

function getListPageCount(count): number {
	if (Array.isArray(count)) {
		return count.length;
	}
	return count;
}
