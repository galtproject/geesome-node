import {createIntervalWorkerGroup} from '../../backgroundWorker.js';
import type {IBackgroundWorker} from '../../backgroundWorker.js';
import type {IGeesomeApp} from '../../interface.js';
import type IGeesomeChatModule from './interface.js';

const defaultChatDeliveryWorkerIntervalMs = 30 * 1000;
const defaultChatReconciliationWorkerIntervalMs = 60 * 1000;
const defaultChatAttachmentCleanupWorkerIntervalMs = 5 * 60 * 1000;

export default function startChatDeliveryWorker(
	app: IGeesomeApp,
	chat: IGeesomeChatModule
): IBackgroundWorker | null {
	const deliveryEnabled = isEnabled(
		app.config.chatConfig?.deliveryWorker
	);
	const reconciliationEnabled = isEnabled(
		app.config.chatConfig?.reconciliationWorker
	);
	const attachmentCleanupEnabled = isEnabled(
		app.config.chatConfig?.attachmentCleanupWorker
	);
	if (!deliveryEnabled && !reconciliationEnabled && !attachmentCleanupEnabled) {
		return null;
	}
	const workerGroup = createIntervalWorkerGroup();
	if (deliveryEnabled) {
		workerGroup.add(
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
	if (reconciliationEnabled) {
		workerGroup.add(
			() => chat.processReconciliationQueue(
				getChatReconciliationWorkerOptions(app)
			),
			{
				intervalMs: parsePositiveInteger(
					app.config.chatConfig?.reconciliationWorkerIntervalMs,
					defaultChatReconciliationWorkerIntervalMs
				),
				runImmediately: true,
				onError: error => console.error('processChatReconciliationQueue error', error)
			}
		);
	}
	if (attachmentCleanupEnabled) {
		workerGroup.add(
			() => chat.processAttachmentCleanup(
				getChatAttachmentCleanupWorkerOptions(app)
			),
			{
				intervalMs: parsePositiveInteger(
					app.config.chatConfig?.attachmentCleanupWorkerIntervalMs,
					defaultChatAttachmentCleanupWorkerIntervalMs
				),
				runImmediately: true,
				onError: error => console.error(
					'processChatAttachmentCleanup error',
					error
				)
			}
		);
	}
	return workerGroup;
}

function isEnabled(value): boolean {
	return value === true || value === '1' || value === 'true';
}

function getChatDeliveryWorkerOptions(app: IGeesomeApp) {
	return {
		limit: app.config.chatConfig?.deliveryWorkerLimit,
		claimTtlMs: app.config.chatConfig?.deliveryClaimTtlMs
	};
}

function getChatReconciliationWorkerOptions(app: IGeesomeApp) {
	const config = app.config.chatConfig || {};
	return {
		limit: config.reconciliationWorkerLimit,
		perRecipientLimit: config.reconciliationPerRecipientLimit,
		claimTtlMs: config.reconciliationClaimTtlMs,
		refreshIntervalMs: config.reconciliationRefreshIntervalMs,
		continuationDelayMs: config.reconciliationContinuationDelayMs,
		pageLimit: config.reconciliationPageLimit,
		maxPages: config.reconciliationMaxPages
	};
}

function getChatAttachmentCleanupWorkerOptions(app: IGeesomeApp) {
	return {
		limit: app.config.chatConfig?.attachmentCleanupWorkerLimit
	};
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
