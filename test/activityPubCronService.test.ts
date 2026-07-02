import assert from 'node:assert';
import ActivityPubDeliveryCronService from '../app/modules/activityPub/cronService.js';

describe('activityPub delivery cron service', () => {
	it('does not start a second delivery batch while one is running', async () => {
		let releaseRun;
		let markStarted;
		let runCalls = 0;
		const runReleased = new Promise((resolve) => {
			releaseRun = resolve;
		});
		const runStarted = new Promise((resolve) => {
			markStarted = resolve;
		});
		const activityPubModule = {
			processDeliveryQueue: async () => {
				runCalls += 1;
				markStarted(true);
				await runReleased;
				return {processed: 1, delivered: 1, failed: 0};
			}
		};
		const cronService = new ActivityPubDeliveryCronService(getApp(), activityPubModule as any);

		const firstRun = cronService.processDeliveryQueue();
		await runStarted;
		const skippedRun = await cronService.processDeliveryQueue();

		assert.deepEqual(skippedRun, {processed: 0, delivered: 0, failed: 0});
		assert.equal(runCalls, 1);
		assert.equal(cronService.inProcess, true);

		releaseRun(true);
		assert.deepEqual(await firstRun, {processed: 1, delivered: 1, failed: 0});
		assert.equal(cronService.inProcess, false);
		assert.equal(runCalls, 1);
	});

	it('passes configured worker limit and claim TTL to delivery processing', async () => {
		let processOptions;
		const activityPubModule = {
			processDeliveryQueue: async (options) => {
				processOptions = options;
				return {processed: 0, delivered: 0, failed: 0};
			}
		};
		const app = getApp({
			deliveryWorkerLimit: '7',
			deliveryClaimTtlMs: '1234'
		});
		const cronService = new ActivityPubDeliveryCronService(app, activityPubModule as any);

		await cronService.processDeliveryQueue();

		assert.equal(processOptions.limit, 7);
		assert.equal(processOptions.claimTtlMs, 1234);
	});
});

function getApp(activityPubConfig: any = {}) {
	return {
		config: {
			activityPubConfig
		}
	} as any;
}
