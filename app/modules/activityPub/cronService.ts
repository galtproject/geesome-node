import {IGeesomeApp} from '../../interface.js';
import IGeesomeActivityPubModule, {
	IActivityPubDeliveryProcessOptions,
	IActivityPubDeliveryProcessResult,
	IActivityPubSourceRefreshPollOptions,
	IActivityPubSourceRefreshPollResult,
	IActivityPubSourceRefreshQueueProcessOptions,
	IActivityPubSourceRefreshQueueProcessResult
} from './interface.js';

const defaultActivityPubDeliveryWorkerLimit = 20;
const defaultActivityPubDeliveryClaimTtlMs = 5 * 60 * 1000;
const defaultActivityPubSourceRefreshWorkerLimit = 3;
const defaultActivityPubSourceRefreshPollerLimit = 20;
const defaultActivityPubSourceRefreshPollerStaleMs = 15 * 60 * 1000;

export default class ActivityPubDeliveryCronService {
	app: IGeesomeApp;
	activityPubModule: IGeesomeActivityPubModule;
	deliveryInProcess = false;
	sourceRefreshInProcess = false;
	sourceRefreshPollInProcess = false;

	constructor(app: IGeesomeApp, activityPubModule: IGeesomeActivityPubModule) {
		this.app = app;
		this.activityPubModule = activityPubModule;
	}

	async processDeliveryQueue(options: IActivityPubDeliveryProcessOptions = {}): Promise<IActivityPubDeliveryProcessResult> {
		if (this.deliveryInProcess) {
			return getSkippedDeliveryProcessResult();
		}

		this.deliveryInProcess = true;
		try {
			return await this.activityPubModule.processDeliveryQueue({
				...getActivityPubDeliveryWorkerProcessOptions(this.app),
				...options
			});
		} finally {
			this.deliveryInProcess = false;
		}
	}

	async processSourceRefreshQueue(options: IActivityPubSourceRefreshQueueProcessOptions = {}): Promise<IActivityPubSourceRefreshQueueProcessResult> {
		if (this.sourceRefreshInProcess) {
			return {processed: 0};
		}

		this.sourceRefreshInProcess = true;
		try {
			return await this.activityPubModule.processActivityPubSourceRefreshQueue({
				...getActivityPubSourceRefreshWorkerProcessOptions(this.app),
				...options
			});
		} finally {
			this.sourceRefreshInProcess = false;
		}
	}

	async queueDueSourceRefreshes(options: IActivityPubSourceRefreshPollOptions = {}): Promise<IActivityPubSourceRefreshPollResult> {
		if (this.sourceRefreshPollInProcess) {
			return {queued: 0};
		}

		this.sourceRefreshPollInProcess = true;
		try {
			return await this.activityPubModule.queueDueActivityPubSourceRefreshes({
				...getActivityPubSourceRefreshPollerOptions(this.app),
				...options
			});
		} finally {
			this.sourceRefreshPollInProcess = false;
		}
	}
}

function getSkippedDeliveryProcessResult(): IActivityPubDeliveryProcessResult {
	return {
		processed: 0,
		delivered: 0,
		failed: 0
	};
}

function getActivityPubDeliveryWorkerProcessOptions(app: IGeesomeApp): IActivityPubDeliveryProcessOptions {
	const config = app.config.activityPubConfig || {};

	return {
		limit: parsePositiveInteger(config.deliveryWorkerLimit, defaultActivityPubDeliveryWorkerLimit),
		claimTtlMs: parsePositiveInteger(config.deliveryClaimTtlMs, defaultActivityPubDeliveryClaimTtlMs)
	};
}

function getActivityPubSourceRefreshWorkerProcessOptions(app: IGeesomeApp): IActivityPubSourceRefreshQueueProcessOptions {
	const config = app.config.activityPubConfig || {};

	return {
		limit: parsePositiveInteger(config.sourceRefreshWorkerLimit, defaultActivityPubSourceRefreshWorkerLimit)
	};
}

function getActivityPubSourceRefreshPollerOptions(app: IGeesomeApp): IActivityPubSourceRefreshPollOptions {
	const config = app.config.activityPubConfig || {};

	return {
		limit: parsePositiveInteger(config.sourceRefreshPollerLimit, defaultActivityPubSourceRefreshPollerLimit),
		staleMs: parsePositiveInteger(config.sourceRefreshPollerStaleMs, defaultActivityPubSourceRefreshPollerStaleMs)
	};
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
