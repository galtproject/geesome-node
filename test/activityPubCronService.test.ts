import assert from 'node:assert';
import ActivityPubDeliveryCronService from '../app/modules/activityPub/cronService.js';

describe('activityPub cron service', () => {
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
		assert.equal(cronService.deliveryInProcess, true);

		releaseRun(true);
		assert.deepEqual(await firstRun, {processed: 1, delivered: 1, failed: 0});
		assert.equal(cronService.deliveryInProcess, false);
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

	it('passes configured worker limit to source refresh queue processing', async () => {
		let processOptions;
		const activityPubModule = {
			processActivityPubSourceRefreshQueue: async (options) => {
				processOptions = options;
				return {processed: 0};
			}
		};
		const app = getApp({
			sourceRefreshWorkerLimit: '4'
		});
		const cronService = new ActivityPubDeliveryCronService(app, activityPubModule as any);

		await cronService.processSourceRefreshQueue();

		assert.equal(processOptions.limit, 4);
	});

	it('passes configured source refresh poller options to due subscription queueing', async () => {
		let pollOptions;
		const activityPubModule = {
			queueDueActivityPubSourceRefreshes: async (options) => {
				pollOptions = options;
				return {queued: 2};
			}
		};
		const app = getApp({
			sourceRefreshPollerLimit: '9',
			sourceRefreshPollerStaleMs: '60000'
		});
		const cronService = new ActivityPubDeliveryCronService(app, activityPubModule as any);

		const result = await cronService.queueDueSourceRefreshes();

		assert.deepEqual(result, {queued: 2});
		assert.equal(pollOptions.limit, 9);
		assert.equal(pollOptions.staleMs, 60000);
	});

	it('does not start a second source refresh poll while one is running', async () => {
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
			queueDueActivityPubSourceRefreshes: async () => {
				runCalls += 1;
				markStarted(true);
				await runReleased;
				return {queued: 1};
			}
		};
		const cronService = new ActivityPubDeliveryCronService(getApp(), activityPubModule as any);

		const firstRun = cronService.queueDueSourceRefreshes();
		await runStarted;
		const skippedRun = await cronService.queueDueSourceRefreshes();

		assert.deepEqual(skippedRun, {queued: 0});
		assert.equal(runCalls, 1);
		assert.equal(cronService.sourceRefreshPollInProcess, true);

		releaseRun(true);
		assert.deepEqual(await firstRun, {queued: 1});
		assert.equal(cronService.sourceRefreshPollInProcess, false);
		assert.equal(runCalls, 1);
	});
});

function getApp(activityPubConfig: any = {}) {
	return {
		config: {
			activityPubConfig
		}
	} as any;
}
