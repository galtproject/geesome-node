import {IGeesomeApp} from '../../interface.js';
import {isActivityPubEnabled} from './helpers.js';
import IGeesomeActivityPubModule from './interface.js';
import ActivityPubDeliveryCronService from './cronService.js';

const defaultActivityPubDeliveryWorkerIntervalMs = 60 * 1000;

export default (app: IGeesomeApp, activityPubModule: IGeesomeActivityPubModule) => {
	if (!isActivityPubDeliveryWorkerEnabled(app)) {
		return null;
	}

	const cronService = new ActivityPubDeliveryCronService(app, activityPubModule);
	const timer = setInterval(async () => {
		await cronService.processDeliveryQueue().catch((e) => console.error('processActivityPubDeliveryQueue error', e));
	}, getActivityPubDeliveryWorkerIntervalMs(app));
	timer.unref?.();

	return cronService;
}

function isActivityPubDeliveryWorkerEnabled(app: IGeesomeApp): boolean {
	const config = app.config.activityPubConfig || {};
	if (!isActivityPubEnabled(config)) {
		return false;
	}
	return config.deliveryWorker === true || config.deliveryWorker === '1' || config.deliveryWorker === 'true';
}

function getActivityPubDeliveryWorkerIntervalMs(app: IGeesomeApp): number {
	return parsePositiveInteger(
		app.config.activityPubConfig?.deliveryWorkerIntervalMs,
		defaultActivityPubDeliveryWorkerIntervalMs
	);
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
