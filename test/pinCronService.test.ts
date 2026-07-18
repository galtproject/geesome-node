import assert from 'node:assert';
import startPinCron from '../app/modules/pin/cron.js';
import PinReconciliationCronService from '../app/modules/pin/cronService.js';

describe('pin reconciliation cron service', () => {
	it('passes bounded worker options to discovery and processing', async () => {
		const calls = [];
		const pinModule = {
			async queueDuePinReconciliations(options) {
				calls.push({name: 'queue', options});
				return {queued: 3};
			},
			async processPinReconciliationQueue(options) {
				calls.push({name: 'process', options});
				return {processed: 2};
			}
		};
		const cronService = new PinReconciliationCronService(getApp({
			reconciliationWorkerLimit: '7',
			reconciliationPerAccountLimit: '3',
			reconciliationClaimTtlMs: '1234'
		}), pinModule as any);

		const result = await cronService.runSweep();

		assert.deepEqual(result, {queued: 3, processed: 2});
		assert.deepEqual(calls, [
			{name: 'queue', options: {limit: 7, perAccountLimit: 3, claimTtlMs: 1234}},
			{name: 'process', options: {limit: 7, perAccountLimit: 3, claimTtlMs: 1234}}
		]);
	});

	it('does not overlap reconciliation sweeps', async () => {
		let releaseQueue;
		let markStarted;
		let queueCalls = 0;
		const queueReleased = new Promise(resolve => {
			releaseQueue = resolve;
		});
		const queueStarted = new Promise(resolve => {
			markStarted = resolve;
		});
		const cronService = new PinReconciliationCronService(getApp(), {
			async queueDuePinReconciliations() {
				queueCalls += 1;
				markStarted(true);
				await queueReleased;
				return {queued: 1};
			},
			async processPinReconciliationQueue() {
				return {processed: 1};
			}
		} as any);

		const firstSweep = cronService.runSweep();
		await queueStarted;
		assert.deepEqual(await cronService.runSweep(), {queued: 0, processed: 0});
		assert.equal(queueCalls, 1);

		releaseQueue(true);
		assert.deepEqual(await firstSweep, {queued: 1, processed: 1});
		assert.equal(cronService.sweepInProcess, false);
	});

	it('processes an existing queue when due-row discovery fails', async () => {
		const discoveryError = new Error('database_scan_failed');
		let processCalls = 0;
		const cronService = new PinReconciliationCronService(getApp(), {
			async queueDuePinReconciliations() {
				throw discoveryError;
			},
			async processPinReconciliationQueue() {
				processCalls += 1;
				return {processed: 2};
			}
		} as any);

		await assert.rejects(() => cronService.runSweep(), error => error === discoveryError);
		assert.equal(processCalls, 1);
		assert.equal(cronService.sweepInProcess, false);
	});

	it('stays disabled by default', () => {
		const worker = startPinCron(getApp(), {} as any);

		assert.equal(worker, null);
	});

	it('runs immediately and drains an active startup sweep on stop', async () => {
		let releaseSweep;
		let markStarted;
		let sweepCalls = 0;
		const sweepReleased = new Promise(resolve => {
			releaseSweep = resolve;
		});
		const sweepStarted = new Promise(resolve => {
			markStarted = resolve;
		});
		const cronService = {
			async runSweep() {
				sweepCalls += 1;
				markStarted(true);
				await sweepReleased;
				return {queued: 1, processed: 1};
			}
		};
		const worker = startPinCron(
			getApp({reconciliationWorker: true}),
			{} as any,
			{cronService: cronService as any, intervalMs: 1}
		);
		assert(worker);

		await sweepStarted;
		await wait(5);
		assert.equal(sweepCalls, 1);
		let stopResolved = false;
		const stopPromise = worker.stop().then(() => {
			stopResolved = true;
		});
		await wait(5);
		assert.equal(stopResolved, false);

		releaseSweep(true);
		await stopPromise;
		assert.equal(stopResolved, true);
		await wait(5);
		assert.equal(sweepCalls, 1);
	});
});

function getApp(pinConfig: any = {}) {
	return {
		config: {pinConfig}
	} as any;
}

function wait(timeoutMs: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, timeoutMs));
}
