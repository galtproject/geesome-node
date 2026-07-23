import assert from 'assert';
import CronService from "../app/modules/autoActions/cronService.js";
import startAutoActionsCron from "../app/modules/autoActions/cron.js";

describe("autoActions cron service", () => {
	it('does not requeue an action while it is already running', async () => {
		let releaseRun;
		let markStarted;
		let runCalls = 0;
		const action = {
			id: 1,
			userId: 2,
			moduleName: 'testModule',
			funcName: 'slowTask',
			funcArgs: '[]'
		};
		const runReleased = new Promise((resolve) => {
			releaseRun = resolve;
		});
		const runStarted = new Promise((resolve) => {
			markStarted = resolve;
		});
		const app = {
			ms: {
				testModule: {
					isAutoActionAllowed: async () => true,
					slowTask: async () => {
						runCalls++;
						markStarted(true);
						await runReleased;
						return 'done';
					}
				}
			}
		};
		const autoActionsModule = {
			getAutoActionsToExecute: async () => [action],
			claimAutoActionsToExecute: async () => [action],
			getNextActionsById: async () => [],
			deactivateAutoActionWithError: async () => null,
			handleAutoActionSuccessfulExecution: async () => null,
			handleAutoActionFailedExecution: async () => null
		};
		const cronService = new CronService(app as any, autoActionsModule as any);

		const firstRun = cronService.getActionsAndAddToQueueAndRun();
		await runStarted;
		await cronService.getActionsAndAddToQueueAndRun();

		assert.equal(runCalls, 1);
		assert.equal(cronService.queueByModules[action.moduleName].length, 0);
		assert.equal(cronService.actionIdsInQueueOrProcess.has(action.id), true);

		releaseRun(true);
		await firstRun;

		assert.equal(runCalls, 1);
		assert.equal(cronService.actionIdsInQueueOrProcess.has(action.id), false);
	});

	it('stops scheduling and waits for an in-flight run', async () => {
		let releaseRun;
		let markStarted;
		let runCalls = 0;
		const runReleased = new Promise((resolve) => {
			releaseRun = resolve;
		});
		const runStarted = new Promise((resolve) => {
			markStarted = resolve;
		});
		const cronService = {
			async getActionsAndAddToQueueAndRun() {
				runCalls++;
				markStarted(true);
				await runReleased;
			}
		};
		const worker = startAutoActionsCron({} as any, {} as any, {
			intervalMs: 1,
			cronService: cronService as any
		});

		await runStarted;
		let stopResolved = false;
		const stopPromise = worker.stop().then(() => {
			stopResolved = true;
		});
		await wait(5);
		assert.equal(stopResolved, false);

		releaseRun(true);
		await stopPromise;
		await wait(5);

		assert.equal(stopResolved, true);
		assert.equal(runCalls, 1);
	});

	it('keeps executing due actions when dedupe cleanup fails', async () => {
		let runCalls = 0;
		const worker = startAutoActionsCron({} as any, {
			cleanupStaleAutoActionDedupeKeys: async () => {
				throw new Error('cleanup_failed');
			}
		} as any, {
			intervalMs: 1,
			cronService: {
				async getActionsAndAddToQueueAndRun() {
					runCalls += 1;
				}
			} as any
		});

		await waitFor(() => runCalls > 0);
		await worker.stop();

		assert(runCalls > 0);
	});
});

function wait(timeoutMs: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, timeoutMs));
}

async function waitFor(condition: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (condition()) {
			return;
		}
		await wait(5);
	}
	throw new Error('condition_timeout');
}
