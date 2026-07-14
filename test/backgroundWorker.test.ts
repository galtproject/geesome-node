import assert from 'assert';
import {createIntervalWorkerGroup, startIntervalWorker} from '../app/backgroundWorker.js';

describe('background interval workers', () => {
	it('prevents overlapping runs and drains the active run once', async () => {
		let releaseRun;
		let markStarted;
		let runCalls = 0;
		const runReleased = new Promise(resolve => {
			releaseRun = resolve;
		});
		const runStarted = new Promise(resolve => {
			markStarted = resolve;
		});
		const worker = startIntervalWorker(async () => {
			runCalls++;
			markStarted(true);
			await runReleased;
		}, {
			intervalMs: 1,
			onError: assert.fail
		});

		await runStarted;
		await wait(5);
		assert.equal(runCalls, 1);

		let stopResolved = false;
		const firstStop = worker.stop().then(() => {
			stopResolved = true;
		});
		const secondStop = worker.stop();
		await wait(5);
		assert.equal(stopResolved, false);

		releaseRun(true);
		await Promise.all([firstStop, secondStop]);
		await wait(5);
		assert.equal(runCalls, 1);
	});

	it('stops every worker in a group and contains callback failures', async () => {
		const errors = [];
		let successfulRuns = 0;
		const workerGroup = createIntervalWorkerGroup();
		workerGroup.add(async () => {
			throw new Error('expected_worker_failure');
		}, {
			intervalMs: 1,
			onError: error => errors.push(error.message)
		});
		workerGroup.add(async () => {
			successfulRuns++;
		}, {
			intervalMs: 1,
			onError: assert.fail
		});

		await waitFor(() => errors.length > 0 && successfulRuns > 0);
		await workerGroup.stop();
		const runsAfterStop = successfulRuns;
		await wait(5);

		assert(errors.length > 0);
		assert(errors.every(message => message === 'expected_worker_failure'));
		assert.equal(successfulRuns, runsAfterStop);
		await workerGroup.stop();
		assert.throws(
			() => workerGroup.add(async () => undefined, {intervalMs: 1, onError: assert.fail}),
			/interval_worker_group_stopped/
		);
	});
});

async function waitFor(predicate: () => boolean, timeoutMs = 100): Promise<void> {
	const startedAt = Date.now();
	while (!predicate()) {
		if (Date.now() - startedAt >= timeoutMs) {
			throw new Error('background_worker_test_timeout');
		}
		await wait(1);
	}
}

function wait(timeoutMs: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, timeoutMs));
}
