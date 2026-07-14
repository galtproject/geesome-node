import assert from 'node:assert';
import ActivityPubDeliveryCronService from '../app/modules/activityPub/cronService.js';
import startActivityPubCron from '../app/modules/activityPub/cron.js';

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

	it('passes configured cleanup limit to ownership challenge cleanup', async () => {
		let cleanupOptions;
		const cleanupCutoff = new Date('2026-06-01T12:00:00Z');
		const activityPubModule = {
			cleanupMigrationOwnershipChallenges: async (options) => {
				cleanupOptions = options;
				return {
					deleted: 2,
					limit: options.limit,
					retentionMs: 24 * 60 * 60 * 1000,
					cutoff: cleanupCutoff
				};
			}
		};
		const app = getApp({
			ownershipChallengeCleanupLimit: '8'
		});
		const cronService = new ActivityPubDeliveryCronService(app, activityPubModule as any);

		const result = await cronService.cleanupOwnershipChallenges();

		assert.deepEqual(result, {
			deleted: 2,
			limit: 8,
			retentionMs: 24 * 60 * 60 * 1000,
			cutoff: cleanupCutoff
		});
		assert.deepEqual(cleanupOptions, {limit: 8});
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

	it('does not start a second ownership challenge cleanup while one is running', async () => {
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
			cleanupMigrationOwnershipChallenges: async () => {
				runCalls += 1;
				markStarted(true);
				await runReleased;
				return {deleted: 1, limit: 3, retentionMs: 60000, cutoff: new Date('2026-06-01T12:00:00Z')};
			}
		};
		const cronService = new ActivityPubDeliveryCronService(getApp({
			ownershipChallengeCleanupLimit: '3',
			ownershipChallengeCleanupRetentionMs: '60000'
		}), activityPubModule as any);

		const firstRun = cronService.cleanupOwnershipChallenges();
		await runStarted;
		const skippedRun = await cronService.cleanupOwnershipChallenges();

		assert.equal(skippedRun.deleted, 0);
		assert.equal(skippedRun.limit, 3);
		assert.equal(skippedRun.retentionMs, 60000);
		assert.equal(runCalls, 1);
		assert.equal(cronService.ownershipChallengeCleanupInProcess, true);

		releaseRun(true);
		assert.deepEqual(await firstRun, {deleted: 1, limit: 3, retentionMs: 60000, cutoff: new Date('2026-06-01T12:00:00Z')});
		assert.equal(cronService.ownershipChallengeCleanupInProcess, false);
		assert.equal(runCalls, 1);
	});

	it('stops federation intervals and drains an active delivery', async () => {
		let releaseRun;
		let markStarted;
		const runReleased = new Promise(resolve => {
			releaseRun = resolve;
		});
		const runStarted = new Promise(resolve => {
			markStarted = resolve;
		});
		const activityPubModule = {
			async processDeliveryQueue() {
				markStarted(true);
				await runReleased;
				return {processed: 1, delivered: 1, failed: 0};
			},
			async cleanupMigrationOwnershipChallenges() {
				return {deleted: 0, limit: 1, retentionMs: 1, cutoff: new Date()};
			}
		};
		const worker = startActivityPubCron(getApp({
			enabled: true,
			deliveryWorker: true,
			deliveryWorkerIntervalMs: 1,
			ownershipChallengeCleanupIntervalMs: 1
		}), activityPubModule as any);
		assert(worker);

		await runStarted;
		let stopResolved = false;
		const stopPromise = worker.stop().then(() => {
			stopResolved = true;
		});
		await wait(5);
		assert.equal(stopResolved, false);

		releaseRun(true);
		await stopPromise;
		assert.equal(stopResolved, true);
	});
});

function getApp(activityPubConfig: any = {}) {
	return {
		config: {
			activityPubConfig
		}
	} as any;
}

function wait(timeoutMs: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, timeoutMs));
}
