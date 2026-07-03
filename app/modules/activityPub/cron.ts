import {IGeesomeApp} from '../../interface.js';
import {isActivityPubEnabled} from './helpers.js';
import IGeesomeActivityPubModule from './interface.js';
import ActivityPubDeliveryCronService from './cronService.js';

const defaultActivityPubDeliveryWorkerIntervalMs = 60 * 1000;
const defaultActivityPubSourceRefreshWorkerIntervalMs = 60 * 1000;
const defaultActivityPubSourceRefreshPollerIntervalMs = 5 * 60 * 1000;

export default (app: IGeesomeApp, activityPubModule: IGeesomeActivityPubModule) => {
	const deliveryWorkerEnabled = isActivityPubDeliveryWorkerEnabled(app);
	const sourceRefreshWorkerEnabled = isActivityPubSourceRefreshWorkerEnabled(app);
	const sourceRefreshPollerEnabled = isActivityPubSourceRefreshPollerEnabled(app);
	if (!deliveryWorkerEnabled && !sourceRefreshWorkerEnabled && !sourceRefreshPollerEnabled) {
		return null;
	}

	const cronService = new ActivityPubDeliveryCronService(app, activityPubModule);
	if (deliveryWorkerEnabled) {
		const timer = setInterval(async () => {
			await cronService.processDeliveryQueue().catch((e) => console.error('processActivityPubDeliveryQueue error', e));
		}, getActivityPubDeliveryWorkerIntervalMs(app));
		timer.unref?.();
	}
	if (sourceRefreshWorkerEnabled && !sourceRefreshPollerEnabled) {
		const timer = setInterval(async () => {
			await cronService.processSourceRefreshQueue().catch((e) => console.error('processActivityPubSourceRefreshQueue error', e));
		}, getActivityPubSourceRefreshWorkerIntervalMs(app));
		timer.unref?.();
	}
	if (sourceRefreshPollerEnabled) {
		const timer = setInterval(async () => {
			await cronService.queueDueSourceRefreshes().catch((e) => console.error('queueDueActivityPubSourceRefreshes error', e));
			if (sourceRefreshWorkerEnabled) {
				await cronService.processSourceRefreshQueue().catch((e) => console.error('processActivityPubSourceRefreshQueue error', e));
			}
		}, getActivityPubSourceRefreshPollerIntervalMs(app));
		timer.unref?.();
	}

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

function isActivityPubSourceRefreshWorkerEnabled(app: IGeesomeApp): boolean {
	const config = app.config.activityPubConfig || {};
	if (!isActivityPubEnabled(config)) {
		return false;
	}
	return config.sourceRefreshWorker === true || config.sourceRefreshWorker === '1' || config.sourceRefreshWorker === 'true';
}

function getActivityPubSourceRefreshWorkerIntervalMs(app: IGeesomeApp): number {
	return parsePositiveInteger(
		app.config.activityPubConfig?.sourceRefreshWorkerIntervalMs,
		defaultActivityPubSourceRefreshWorkerIntervalMs
	);
}

function isActivityPubSourceRefreshPollerEnabled(app: IGeesomeApp): boolean {
	const config = app.config.activityPubConfig || {};
	if (!isActivityPubEnabled(config)) {
		return false;
	}
	return config.sourceRefreshPoller === true || config.sourceRefreshPoller === '1' || config.sourceRefreshPoller === 'true';
}

function getActivityPubSourceRefreshPollerIntervalMs(app: IGeesomeApp): number {
	return parsePositiveInteger(
		app.config.activityPubConfig?.sourceRefreshPollerIntervalMs,
		defaultActivityPubSourceRefreshPollerIntervalMs
	);
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
