import {IGeesomeApp} from '../../interface.js';
import {createIntervalWorkerGroup} from '../../backgroundWorker.js';
import type {IBackgroundWorker} from '../../backgroundWorker.js';
import IGeesomeBlueskyModule from './interface.js';
import BlueskyCronService from './cronService.js';

const defaultBlueskySourceRefreshWorkerIntervalMs = 60 * 1000;
const defaultBlueskySourceRefreshPollerIntervalMs = 5 * 60 * 1000;

export default (app: IGeesomeApp, blueskyModule: IGeesomeBlueskyModule): IBackgroundWorker | null => {
	const sourceRefreshWorkerEnabled = isBlueskySourceRefreshWorkerEnabled(app);
	const sourceRefreshPollerEnabled = isBlueskySourceRefreshPollerEnabled(app);
	if (!sourceRefreshWorkerEnabled && !sourceRefreshPollerEnabled) {
		return null;
	}

	const cronService = new BlueskyCronService(app, blueskyModule);
	const workerGroup = createIntervalWorkerGroup();
	if (sourceRefreshWorkerEnabled && !sourceRefreshPollerEnabled) {
		workerGroup.add(
			() => cronService.processSourceRefreshQueue(),
			{
				intervalMs: getBlueskySourceRefreshWorkerIntervalMs(app),
				onError: e => console.error('processBlueskySourceRefreshQueue error', e)
			}
		);
	}
	if (sourceRefreshPollerEnabled) {
		workerGroup.add(async () => {
			await cronService.queueDueSourceRefreshes()
				.catch(e => console.error('queueDueBlueskySourceRefreshes error', e));
			if (sourceRefreshWorkerEnabled) {
				await cronService.processSourceRefreshQueue()
					.catch(e => console.error('processBlueskySourceRefreshQueue error', e));
			}
		}, {
			intervalMs: getBlueskySourceRefreshPollerIntervalMs(app),
			onError: e => console.error('blueskySourceRefreshPoller error', e)
		});
	}

	return workerGroup;
}

function isBlueskySourceRefreshWorkerEnabled(app: IGeesomeApp): boolean {
	const config = app.config.blueskyConfig || {};
	return config.sourceRefreshWorker === true || config.sourceRefreshWorker === '1' || config.sourceRefreshWorker === 'true';
}

function getBlueskySourceRefreshWorkerIntervalMs(app: IGeesomeApp): number {
	return parsePositiveInteger(
		app.config.blueskyConfig?.sourceRefreshWorkerIntervalMs,
		defaultBlueskySourceRefreshWorkerIntervalMs
	);
}

function isBlueskySourceRefreshPollerEnabled(app: IGeesomeApp): boolean {
	const config = app.config.blueskyConfig || {};
	return config.sourceRefreshPoller === true || config.sourceRefreshPoller === '1' || config.sourceRefreshPoller === 'true';
}

function getBlueskySourceRefreshPollerIntervalMs(app: IGeesomeApp): number {
	return parsePositiveInteger(
		app.config.blueskyConfig?.sourceRefreshPollerIntervalMs,
		defaultBlueskySourceRefreshPollerIntervalMs
	);
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
