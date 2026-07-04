import {IGeesomeApp} from '../../interface.js';
import {Op} from 'sequelize';
import helpers from '../../helpers.js';
import {CorePermissionName, IListParams, IListParamsOptions} from '../database/interface.js';
import {ISocNetDbChannel} from '../socNetImport/interface.js';
import {BlueskyImportClient} from './importClient.js';
import {
	IBlueskyAuthorProjection,
	IBlueskyPostProjection,
	blueskySocNet,
	fetchBlueskyAuthorFeed,
	normalizeBlueskyActor,
	normalizeBlueskyAuthorFeedFilter,
	projectBlueskyAuthorFeed
} from './helpers.js';
import IGeesomeBlueskyModule, {
	BlueskySourceSubscriptionStatus,
	IBlueskyPublicAuthorFeedImportInput,
	IBlueskyPublicAuthorFeedPreviewInput,
	IBlueskySourceSubscriptionFilters,
	IBlueskySourceSubscriptionInput,
	IBlueskySourceSubscriptionUpdateInput
} from './interface.js';

const blueskySourceSubscriptionListParams: IListParamsOptions = {
	sortBy: 'updatedAt',
	allowedSortBy: ['actor', 'status', 'createdAt', 'updatedAt', 'id'],
	maxLimit: 100
};

export default async (app: IGeesomeApp) => {
	app.checkModules(['api', 'database']);
	const models = await (await import('./models.js')).default(app.ms.database.sequelize);
	const module = getModule(app, {models});
	await (await import('./api.js')).default(app, module);
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
			await updateBlueskySourceSubscriptionRecord(subscription, getBlueskySourceSubscriptionUpdateData(input));
			return getBlueskySourceSubscriptionReport(subscription);
		}

		async removeSourceSubscription(userId: number, sourceId: number | string) {
			assertBlueskyModels(models);
			const subscription = await getBlueskySourceSubscriptionRecord(models, userId, sourceId);
			await updateBlueskySourceSubscriptionRecord(subscription, {status: BlueskySourceSubscriptionStatus.Removed});
			return getBlueskySourceSubscriptionReport(subscription);
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

function assertBlueskyModels(models): void {
	if (!models?.BlueskySourceSubscription) {
		throw new Error('bluesky_models_unavailable');
	}
}

function getBlueskySourceSubscriptionListParams(listParams?: IListParams): IListParams {
	return helpers.prepareListParams(listParams, blueskySourceSubscriptionListParams);
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
	return {
		userId,
		actor: getRequiredBlueskySourceActor(input),
		filter: getOptionalBlueskySourceFilter(input.filter),
		displayName: getOptionalBoundedString(input.displayName, 200) || null,
		status: BlueskySourceSubscriptionStatus.Active,
		groupName: getOptionalBoundedString(input.groupName, 200) || null,
		accountId: getNullablePositiveInteger(input.accountId),
		importLimit: getNullableImportLimit(input.importLimit),
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
		lastError: null
	};
}

function getBlueskySourceSubscriptionUpdateData(input: IBlueskySourceSubscriptionUpdateInput) {
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
	return updateData;
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

function getRequiredMutableBlueskySourceSubscriptionStatus(status): BlueskySourceSubscriptionStatus {
	if (status === BlueskySourceSubscriptionStatus.Active || status === BlueskySourceSubscriptionStatus.Paused) {
		return status;
	}
	throw new Error('bluesky_source_subscription_status_invalid');
}

function isBlueskySourceSubscriptionUniqueError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function getListPageCount(count): number {
	if (Array.isArray(count)) {
		return count.length;
	}
	return count;
}
