import {IGeesomeApp} from '../../interface.js';
import IGeesomeBlueskyModule, {
	IBlueskySourceRefreshPollOptions,
	IBlueskySourceRefreshPollResult,
	IBlueskySourceRefreshQueueProcessOptions,
	IBlueskySourceRefreshQueueProcessResult
} from './interface.js';

const defaultBlueskySourceRefreshWorkerLimit = 3;
const defaultBlueskySourceRefreshPollerLimit = 20;
const defaultBlueskySourceRefreshPollerStaleMs = 15 * 60 * 1000;

export default class BlueskyCronService {
	app: IGeesomeApp;
	blueskyModule: IGeesomeBlueskyModule;
	sourceRefreshInProcess = false;
	sourceRefreshPollInProcess = false;

	constructor(app: IGeesomeApp, blueskyModule: IGeesomeBlueskyModule) {
		this.app = app;
		this.blueskyModule = blueskyModule;
	}

	async processSourceRefreshQueue(options: IBlueskySourceRefreshQueueProcessOptions = {}): Promise<IBlueskySourceRefreshQueueProcessResult> {
		if (this.sourceRefreshInProcess) {
			return {processed: 0};
		}

		this.sourceRefreshInProcess = true;
		try {
			return await this.blueskyModule.processSourceSubscriptionRefreshQueue({
				...getBlueskySourceRefreshWorkerProcessOptions(this.app),
				...options
			});
		} finally {
			this.sourceRefreshInProcess = false;
		}
	}

	async queueDueSourceRefreshes(options: IBlueskySourceRefreshPollOptions = {}): Promise<IBlueskySourceRefreshPollResult> {
		if (this.sourceRefreshPollInProcess) {
			return {queued: 0};
		}

		this.sourceRefreshPollInProcess = true;
		try {
			return await this.blueskyModule.queueDueSourceSubscriptionRefreshes({
				...getBlueskySourceRefreshPollerOptions(this.app),
				...options
			});
		} finally {
			this.sourceRefreshPollInProcess = false;
		}
	}
}

function getBlueskySourceRefreshWorkerProcessOptions(app: IGeesomeApp): IBlueskySourceRefreshQueueProcessOptions {
	const config = app.config.blueskyConfig || {};

	return {
		limit: parsePositiveInteger(config.sourceRefreshWorkerLimit, defaultBlueskySourceRefreshWorkerLimit)
	};
}

function getBlueskySourceRefreshPollerOptions(app: IGeesomeApp): IBlueskySourceRefreshPollOptions {
	const config = app.config.blueskyConfig || {};

	return {
		limit: parsePositiveInteger(config.sourceRefreshPollerLimit, defaultBlueskySourceRefreshPollerLimit),
		staleMs: parsePositiveInteger(config.sourceRefreshPollerStaleMs, defaultBlueskySourceRefreshPollerStaleMs)
	};
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
