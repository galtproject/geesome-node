import {IGeesomeApp} from '../../interface.js';
import {createIntervalWorkerGroup} from '../../backgroundWorker.js';
import type {IBackgroundWorker} from '../../backgroundWorker.js';
import {isActivityPubEnabled} from './helpers.js';
import IGeesomeActivityPubModule from './interface.js';
import ActivityPubDeliveryCronService from './cronService.js';

const defaultActivityPubDeliveryWorkerIntervalMs = 60 * 1000;
const defaultActivityPubSourceRefreshWorkerIntervalMs = 60 * 1000;
const defaultActivityPubSourceRefreshPollerIntervalMs = 5 * 60 * 1000;
const defaultActivityPubOwnershipChallengeCleanupIntervalMs = 60 * 60 * 1000;

export default (app: IGeesomeApp, activityPubModule: IGeesomeActivityPubModule): IBackgroundWorker | null => {
	const deliveryWorkerEnabled = isActivityPubDeliveryWorkerEnabled(app);
	const sourceRefreshWorkerEnabled = isActivityPubSourceRefreshWorkerEnabled(app);
	const sourceRefreshPollerEnabled = isActivityPubSourceRefreshPollerEnabled(app);
	if (!deliveryWorkerEnabled && !sourceRefreshWorkerEnabled && !sourceRefreshPollerEnabled) {
		return null;
	}

	const cronService = new ActivityPubDeliveryCronService(app, activityPubModule);
	const workerGroup = createIntervalWorkerGroup();
	if (deliveryWorkerEnabled) {
		workerGroup.add(
			() => cronService.processDeliveryQueue(),
			{
				intervalMs: getActivityPubDeliveryWorkerIntervalMs(app),
				onError: e => console.error('processActivityPubDeliveryQueue error', e)
			}
		);
	}
	if (sourceRefreshWorkerEnabled && !sourceRefreshPollerEnabled) {
		workerGroup.add(
			() => cronService.processSourceRefreshQueue(),
			{
				intervalMs: getActivityPubSourceRefreshWorkerIntervalMs(app),
				onError: e => console.error('processActivityPubSourceRefreshQueue error', e)
			}
		);
	}
	if (sourceRefreshPollerEnabled) {
		workerGroup.add(async () => {
			await cronService.queueDueSourceRefreshes()
				.catch(e => console.error('queueDueActivityPubSourceRefreshes error', e));
			if (sourceRefreshWorkerEnabled) {
				await cronService.processSourceRefreshQueue()
					.catch(e => console.error('processActivityPubSourceRefreshQueue error', e));
			}
		}, {
			intervalMs: getActivityPubSourceRefreshPollerIntervalMs(app),
			onError: e => console.error('activityPubSourceRefreshPoller error', e)
		});
	}
	workerGroup.add(
		() => cronService.cleanupOwnershipChallenges(),
		{
			intervalMs: getActivityPubOwnershipChallengeCleanupIntervalMs(app),
			onError: e => console.error('cleanupActivityPubOwnershipChallenges error', e)
		}
	);

	return workerGroup;
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

function getActivityPubOwnershipChallengeCleanupIntervalMs(app: IGeesomeApp): number {
	return parsePositiveInteger(
		app.config.activityPubConfig?.ownershipChallengeCleanupIntervalMs,
		defaultActivityPubOwnershipChallengeCleanupIntervalMs
	);
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
