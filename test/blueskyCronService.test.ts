import assert from 'node:assert';
import startBlueskyCron from '../app/modules/bluesky/cron.js';

describe('bluesky cron service', () => {
	it('stops source intervals and drains an active refresh', async () => {
		let releaseRun;
		let markStarted;
		const runReleased = new Promise(resolve => {
			releaseRun = resolve;
		});
		const runStarted = new Promise(resolve => {
			markStarted = resolve;
		});
		const blueskyModule = {
			async processSourceSubscriptionRefreshQueue() {
				markStarted(true);
				await runReleased;
				return {processed: 1};
			}
		};
		const app = {
			config: {
				blueskyConfig: {
					sourceRefreshWorker: true,
					sourceRefreshWorkerIntervalMs: 1
				}
			}
		};
		const worker = startBlueskyCron(app as any, blueskyModule as any);
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

function wait(timeoutMs: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, timeoutMs));
}
