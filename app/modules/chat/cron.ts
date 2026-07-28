import {startIntervalWorker} from '../../backgroundWorker.js';
import type {IBackgroundWorker} from '../../backgroundWorker.js';
import type {IGeesomeApp} from '../../interface.js';
import type IGeesomeChatModule from './interface.js';

const defaultChatDeliveryWorkerIntervalMs = 30 * 1000;

export default function startChatDeliveryWorker(
	app: IGeesomeApp,
	chat: IGeesomeChatModule
): IBackgroundWorker | null {
	if (!isChatDeliveryWorkerEnabled(app)) {
		return null;
	}
	return startIntervalWorker(
		() => chat.processDeliveryQueue(getChatDeliveryWorkerOptions(app)),
		{
			intervalMs: parsePositiveInteger(
				app.config.chatConfig?.deliveryWorkerIntervalMs,
				defaultChatDeliveryWorkerIntervalMs
			),
			runImmediately: true,
			onError: error => console.error('processChatDeliveryQueue error', error)
		}
	);
}

function isChatDeliveryWorkerEnabled(app: IGeesomeApp): boolean {
	const value = app.config.chatConfig?.deliveryWorker;
	return value === true || value === '1' || value === 'true';
}

function getChatDeliveryWorkerOptions(app: IGeesomeApp) {
	return {
		limit: app.config.chatConfig?.deliveryWorkerLimit,
		claimTtlMs: app.config.chatConfig?.deliveryClaimTtlMs
	};
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
