import {randomUUID} from 'node:crypto';
import type {IChatReconciliationProcessOptions} from './interface.js';

const defaultReconciliationLimit = 10;
const defaultPerRecipientLimit = 2;
const defaultClaimTtlMs = 5 * 60 * 1000;
const defaultRefreshIntervalMs = 5 * 60 * 1000;
const defaultContinuationDelayMs = 5 * 1000;
const minimumRetryDelayMs = 5 * 1000;
const maximumRetryDelayMs = 60 * 60 * 1000;

export interface IProcessChatReconciliationOptions
	extends IChatReconciliationProcessOptions {
	reconcile(
		userId: number,
		state: any
	): Promise<{complete: boolean}>;
}

export async function processChatReconciliationQueue(
	models,
	options: IProcessChatReconciliationOptions
) {
	const now = options.now || new Date();
	const limit = parsePositiveInteger(options.limit, defaultReconciliationLimit);
	const perRecipientLimit = Math.min(
		parsePositiveInteger(options.perRecipientLimit, defaultPerRecipientLimit),
		limit
	);
	const claimTtlMs = parsePositiveInteger(options.claimTtlMs, defaultClaimTtlMs);
	await models.ChatSyncJob.backfillMissing({
		now,
		limit,
		perRecipientLimit
	});
	const jobs = await models.ChatSyncJob.claimDue({
		now,
		claimExpiresAt: new Date(now.getTime() + claimTtlMs),
		claimToken: randomUUID(),
		limit,
		perRecipientLimit
	});
	const result = {
		processed: 0,
		completed: 0,
		pending: 0,
		failed: 0,
		superseded: 0
	};
	for (const job of jobs) {
		result.processed += 1;
		try {
			const state = job.syncState;
			if (!state) {
				throw new Error('chat_sync_state_not_found');
			}
			const device = await models.ChatDevice.findOne({
				where: {
					ownerId: state.recipientOwnerId,
					revokedAt: null
				},
				order: [['id', 'ASC']]
			});
			if (!device) {
				throw new Error('chat_sync_recipient_device_not_found');
			}
			const reconciliation = await options.reconcile(
				Number(device.userId),
				state
			);
			const complete = reconciliation.complete === true;
			const updated = await updateClaimedJob(models, job, {
				nextAttemptAt: new Date(now.getTime() + parsePositiveInteger(
					complete
						? options.refreshIntervalMs
						: options.continuationDelayMs,
					complete
						? defaultRefreshIntervalMs
						: defaultContinuationDelayMs
				)),
				failureCount: 0,
				claimedAt: null,
				claimExpiresAt: null,
				claimToken: null,
				lastError: null
			});
			result[updated ? (complete ? 'completed' : 'pending') : 'superseded'] += 1;
		} catch (error) {
			const updated = await recordChatReconciliationFailure(
				models,
				job,
				error,
				now
			);
			result[updated ? 'failed' : 'superseded'] += 1;
		}
	}
	return result;
}

async function recordChatReconciliationFailure(models, job, error, now: Date) {
	const failureCount = Number(job.failureCount || 0) + 1;
	return updateClaimedJob(models, job, {
		nextAttemptAt: new Date(now.getTime() + getRetryDelayMs(failureCount)),
		failureCount,
		claimedAt: null,
		claimExpiresAt: null,
		claimToken: null,
		lastError: getErrorMessage(error)
	});
}

async function updateClaimedJob(models, job, update): Promise<boolean> {
	const [updated] = await models.ChatSyncJob.update(update, {
		where: {
			id: job.id,
			claimToken: job.claimToken
		}
	});
	return updated === 1;
}

function getRetryDelayMs(failureCount: number): number {
	return Math.min(
		minimumRetryDelayMs * (2 ** Math.max(0, failureCount - 1)),
		maximumRetryDelayMs
	);
}

function getErrorMessage(error): string {
	return String(error?.message || error || 'chat_sync_failed').slice(0, 2000);
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
