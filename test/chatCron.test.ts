import assert from 'node:assert';
import startChatWorkers from '../app/modules/chat/cron.js';

describe('chat cron service', () => {
	it('keeps workers disabled by default', () => {
		const worker = startChatWorkers(
			{config: {chatConfig: {}}} as any,
			{} as any
		);
		assert.equal(worker, null);
	});

	it('passes bounded reconciliation configuration to an opt-in worker', async () => {
		let processOptions;
		let signalRun;
		const run = new Promise(resolve => {
			signalRun = resolve;
		});
		const worker = startChatWorkers({
			config: {
				chatConfig: {
					reconciliationWorker: true,
					reconciliationWorkerIntervalMs: 60000,
					reconciliationWorkerLimit: '7',
					reconciliationPerRecipientLimit: '2',
					reconciliationClaimTtlMs: '3000',
					reconciliationRefreshIntervalMs: '5000',
					reconciliationContinuationDelayMs: '1000',
					reconciliationPageLimit: '4',
					reconciliationMaxPages: '3'
				}
			}
		} as any, {
			processReconciliationQueue: async options => {
				processOptions = options;
				signalRun();
			}
		} as any);

		await run;
		await worker.stop();
		assert.deepEqual(processOptions, {
			limit: '7',
			perRecipientLimit: '2',
			claimTtlMs: '3000',
			refreshIntervalMs: '5000',
			continuationDelayMs: '1000',
			pageLimit: '4',
			maxPages: '3'
		});
	});

	it('preserves the opt-in delivery worker configuration', async () => {
		let processOptions;
		let signalRun;
		const run = new Promise(resolve => {
			signalRun = resolve;
		});
		const worker = startChatWorkers({
			config: {
				chatConfig: {
					deliveryWorker: true,
					deliveryWorkerIntervalMs: 60000,
					deliveryWorkerLimit: '9',
					deliveryClaimTtlMs: '4000'
				}
			}
		} as any, {
			processDeliveryQueue: async options => {
				processOptions = options;
				signalRun();
			}
		} as any);

		await run;
		await worker.stop();
		assert.deepEqual(processOptions, {
			limit: '9',
			claimTtlMs: '4000'
		});
	});

	it('runs bounded attachment cleanup when enabled', async () => {
		let processOptions;
		let signalRun;
		const run = new Promise(resolve => {
			signalRun = resolve;
		});
		const worker = startChatWorkers({
			config: {
				chatConfig: {
					attachmentCleanupWorker: true,
					attachmentCleanupWorkerIntervalMs: 60000,
					attachmentCleanupWorkerLimit: '11'
				}
			}
		} as any, {
			processAttachmentCleanup: async options => {
				processOptions = options;
				signalRun();
			}
		} as any);

		await run;
		await worker.stop();
		assert.deepEqual(processOptions, {limit: '11'});
	});
});
