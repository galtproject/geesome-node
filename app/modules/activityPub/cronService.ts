import {IGeesomeApp} from '../../interface.js';
import IGeesomeActivityPubModule, {IActivityPubDeliveryProcessOptions, IActivityPubDeliveryProcessResult} from './interface.js';

const defaultActivityPubDeliveryWorkerLimit = 20;
const defaultActivityPubDeliveryClaimTtlMs = 5 * 60 * 1000;

export default class ActivityPubDeliveryCronService {
	app: IGeesomeApp;
	activityPubModule: IGeesomeActivityPubModule;
	inProcess = false;

	constructor(app: IGeesomeApp, activityPubModule: IGeesomeActivityPubModule) {
		this.app = app;
		this.activityPubModule = activityPubModule;
	}

	async processDeliveryQueue(options: IActivityPubDeliveryProcessOptions = {}): Promise<IActivityPubDeliveryProcessResult> {
		if (this.inProcess) {
			return getSkippedDeliveryProcessResult();
		}

		this.inProcess = true;
		try {
			return await this.activityPubModule.processDeliveryQueue({
				...getActivityPubDeliveryWorkerProcessOptions(this.app),
				...options
			});
		} finally {
			this.inProcess = false;
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

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
