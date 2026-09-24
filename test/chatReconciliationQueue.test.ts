import assert from 'node:assert';
import {processChatReconciliationQueue} from '../app/modules/chat/reconciliationQueue.js';

let nextStateId = 1;

describe('chat reconciliation queue', () => {
	it('bounds claims and schedules complete and incomplete work separately', async () => {
		const claimedOptions: any[] = [];
		const completeJob = createJob({recipientOwnerId: 'recipient-1'});
		const pendingJob = createJob({recipientOwnerId: 'recipient-2'});
		const models = {
			ChatSyncJob: {
				backfillMissing: async () => undefined,
				claimDue: async options => {
					claimedOptions.push(options);
					return [completeJob, pendingJob];
				},
				update: createClaimedJobUpdater([completeJob, pendingJob])
			},
			ChatDevice: {
				findOne: async ({where}) => ({
					userId: where.ownerId === 'recipient-1' ? 11 : 22
				})
			}
		};
		const now = new Date('2026-01-01T00:00:00.000Z');
		const result = await processChatReconciliationQueue(models, {
			now,
			limit: 4,
			perRecipientLimit: 2,
			claimTtlMs: 1000,
			refreshIntervalMs: 60000,
			continuationDelayMs: 2000,
			reconcile: async userId => ({complete: userId === 11})
		});

		assert.deepEqual(result, {
			processed: 2,
			completed: 1,
			pending: 1,
			failed: 0,
			superseded: 0
		});
		assert.equal(claimedOptions[0].limit, 4);
		assert.equal(claimedOptions[0].perRecipientLimit, 2);
		assert.equal(claimedOptions[0].claimExpiresAt.toISOString(),
			'2026-01-01T00:00:01.000Z');
		assert.equal(completeJob.updates[0].nextAttemptAt.toISOString(),
			'2026-01-01T00:01:00.000Z');
		assert.equal(pendingJob.updates[0].nextAttemptAt.toISOString(),
			'2026-01-01T00:00:02.000Z');
	});

	it('releases failed claims with bounded exponential backoff', async () => {
		const job = createJob({
			recipientOwnerId: 'recipient-1',
			failureCount: 2
		});
		const models = {
			ChatSyncJob: {
				backfillMissing: async () => undefined,
				claimDue: async () => [job],
				update: createClaimedJobUpdater([job])
			},
			ChatDevice: {findOne: async () => ({userId: 11})}
		};
		const result = await processChatReconciliationQueue(models, {
			now: new Date('2026-01-01T00:00:00.000Z'),
			reconcile: async () => {
				throw new Error('temporary_source_failure');
			}
		});

		assert.equal(result.failed, 1);
		assert.equal(job.updates[0].failureCount, 3);
		assert.equal(job.updates[0].nextAttemptAt.toISOString(),
			'2026-01-01T00:00:20.000Z');
		assert.equal(job.updates[0].claimedAt, null);
		assert.equal(job.updates[0].claimExpiresAt, null);
		assert.equal(job.updates[0].claimToken, null);
		assert.equal(job.updates[0].lastError, 'temporary_source_failure');
	});

	it('does not let an expired worker overwrite a newer claim', async () => {
		const job = createJob({claimToken: 'old-claim'});
		const models = {
			ChatSyncJob: {
				backfillMissing: async () => undefined,
				claimDue: async () => [job],
				update: async () => [0]
			},
			ChatDevice: {findOne: async () => ({userId: 11})}
		};
		const result = await processChatReconciliationQueue(models, {
			reconcile: async () => ({complete: true})
		});

		assert.equal(result.superseded, 1);
		assert.equal(result.completed, 0);
		assert.equal(job.updates.length, 0);
	});
});

function createJob(overrides: any = {}) {
	const recipientOwnerId = overrides.recipientOwnerId || 'recipient';
	const job: any = {
		id: nextStateId++,
		failureCount: 0,
		claimToken: 'active-claim',
		syncState: {
			recipientOwnerId,
			conversationId: `conversation-${nextStateId}`,
			sourceOwnerId: `source-${nextStateId}`
		},
		updates: [],
		...overrides
	};
	delete job.recipientOwnerId;
	job.update = async update => {
		job.updates.push(update);
		Object.assign(job, update);
		return job;
	};
	return job;
}

function createClaimedJobUpdater(jobs) {
	return async (update, {where}) => {
		const job = jobs.find(item =>
			item.id === where.id &&
			item.claimToken === where.claimToken
		);
		if (!job) {
			return [0];
		}
		job.updates.push(update);
		Object.assign(job, update);
		return [1];
	};
}
