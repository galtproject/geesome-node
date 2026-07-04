import {IGeesomeApp} from '../../interface.js';
import {CorePermissionName} from '../database/interface.js';
import {ISocNetDbChannel} from '../socNetImport/interface.js';
import {BlueskyImportClient} from './importClient.js';
import {IBlueskyAuthorProjection, IBlueskyPostProjection, blueskySocNet, fetchBlueskyAuthorFeed, normalizeBlueskyActor, projectBlueskyAuthorFeed} from './helpers.js';
import IGeesomeBlueskyModule, {
	IBlueskyPublicAuthorFeedImportInput,
	IBlueskyPublicAuthorFeedPreviewInput
} from './interface.js';

export default async (app: IGeesomeApp) => {
	const module = getModule(app);
	await (await import('./api.js')).default(app, module);
	return module;
}

export function getModule(app: IGeesomeApp, options: any = {}): IGeesomeBlueskyModule {
	app.checkModules(['api']);

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
