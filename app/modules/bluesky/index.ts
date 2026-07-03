import {IGeesomeApp} from '../../interface.js';
import {fetchBlueskyAuthorFeed, normalizeBlueskyActor, projectBlueskyAuthorFeed} from './helpers.js';
import IGeesomeBlueskyModule, {IBlueskyPublicAuthorFeedPreviewInput} from './interface.js';

export default async (app: IGeesomeApp) => {
	const module = getModule(app);
	await (await import('./api.js')).default(app, module);
	return module;
}

export function getModule(app: IGeesomeApp, options: any = {}): IGeesomeBlueskyModule {
	app.checkModules(['api']);

	class BlueskyModule implements IGeesomeBlueskyModule {
		async getPublicAuthorFeedPreview(input: IBlueskyPublicAuthorFeedPreviewInput = {}) {
			const actor = getRequiredBlueskyPreviewActor(input);
			const feedResponse = await fetchBlueskyAuthorFeed({
				actor,
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
	}

	return new BlueskyModule();
}

function getRequiredBlueskyPreviewActor(input: IBlueskyPublicAuthorFeedPreviewInput): string {
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

function getOptionalString(value: any): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	if (!value) {
		return null;
	}
	return value;
}
