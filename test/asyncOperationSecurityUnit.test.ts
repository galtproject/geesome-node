import assert from "assert";
import {Op} from "sequelize";
import {getModule as getAsyncOperationModule} from "../app/modules/asyncOperation/index.js";

function isBeforeDate(value, cutoff) {
	return new Date(value).getTime() < cutoff.getTime();
}

function getSortableDate(value) {
	if (!value) {
		return 0;
	}
	return new Date(value).getTime();
}

function removeMatching(rows, predicate) {
	let deleted = 0;
	for (let i = rows.length - 1; i >= 0; i--) {
		if (predicate(rows[i])) {
			rows.splice(i, 1);
			deleted++;
		}
	}
	return deleted;
}

function createAsyncOperationModule({queues = [], operations = [], appOverrides = {}}: {queues?: any[], operations?: any[], appOverrides?: any} = {}) {
	const database = {
		setDefaultListParamsValues: (listParams) => {
			listParams.sortBy ||= "createdAt";
			listParams.sortDir ||= "DESC";
			listParams.limit ||= 20;
			listParams.offset ||= 0;
		}
	};
	const overrideMs = appOverrides.ms || {};
	const app = {
		checkUserCan: async () => null,
		ms: {
			...overrideMs,
			database: {
				...database,
				...(overrideMs.database || {})
			}
		}
	};
	Object.assign(app, appOverrides, {ms: app.ms});

	return getAsyncOperationModule(app as any, {
		UserOperationQueue: {
			findOne: async ({where}) => {
				if (where.id !== undefined) {
					return queues.find((queue) => queue.id === Number(where.id)) || null;
				}

				const waitingQueue = queues
					.filter((queue) => queue.module === where.module && queue.isWaiting === where.isWaiting)
					.sort((a, b) => getSortableDate(a.createdAt) - getSortableDate(b.createdAt) || a.id - b.id)[0];
				if (!waitingQueue) {
					return null;
				}
				if (waitingQueue.asyncOperationId) {
					waitingQueue.asyncOperation = operations.find((operation) => operation.id === waitingQueue.asyncOperationId) || null;
				} else {
					delete waitingQueue.asyncOperation;
				}
				return waitingQueue;
			},
			findAll: async ({where, limit}) => {
				if (where.updatedAt?.[Op.lt]) {
					return queues
						.filter((queue) => {
							return queue.isWaiting === where.isWaiting
								&& queue.asyncOperationId === where.asyncOperationId
								&& isBeforeDate(queue.updatedAt, where.updatedAt[Op.lt]);
						})
						.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id - b.id)
						.slice(0, limit);
				}
				return queues.filter((queue) => {
					return queue.userId === where.userId && queue.module === where.module && queue.isWaiting === where.isWaiting;
				});
			},
			count: async ({where}) => queues.filter((queue) => {
				return queue.userId === where.userId && queue.module === where.module && queue.isWaiting === where.isWaiting;
			}).length,
			destroy: async ({where}) => {
				if (where.asyncOperationId?.[Op.in]) {
					return removeMatching(queues, (queue) => where.asyncOperationId[Op.in].includes(queue.asyncOperationId));
				}
				if (where.id?.[Op.in]) {
					return removeMatching(queues, (queue) => where.id[Op.in].includes(queue.id));
				}
				return 0;
			},
			update: async (updateData, {where}) => {
				const matchedQueues = queues.filter((item) => {
					if (where.id !== undefined) {
						return item.id === Number(where.id);
					}
					if (where.asyncOperationId !== undefined) {
						return item.asyncOperationId === Number(where.asyncOperationId);
					}
					return false;
				});
				for (const queue of matchedQueues) {
					Object.assign(queue, updateData);
				}
				return [matchedQueues.length];
			}
		},
		UserAsyncOperation: {
			findOne: async ({where}) => operations.find((operation) => operation.id === Number(where.id)) || null,
			findAll: async ({where, limit}) => {
				if (where.updatedAt?.[Op.lt]) {
					return operations
						.filter((operation) => {
							return operation.inProcess === where.inProcess
								&& isBeforeDate(operation.updatedAt, where.updatedAt[Op.lt]);
						})
						.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id - b.id)
						.slice(0, limit);
				}
				return operations.filter((operation) => operation.userId === where.userId);
			},
			destroy: async ({where}) => {
				return removeMatching(operations, (operation) => where.id[Op.in].includes(operation.id));
			},
			update: async (updateData, {where}) => {
				const operation = operations.find((item) => item.id === Number(where.id));
				if (operation) {
					Object.assign(operation, updateData);
				}
				return [operation ? 1 : 0];
			},
			create: async (operation) => {
				const created = {id: operations.length + 1, ...operation};
				operations.push(created);
				return created;
			}
		}
	});
}

describe("async operation ownership controls", function () {
	it("rejects cross-user operation queue reads and missing queues explicitly", async () => {
		const asyncOperations = createAsyncOperationModule({
			queues: [
				{id: 1, userId: 1, module: "staticSiteGenerator", isWaiting: true},
				{id: 2, userId: 2, module: "staticSiteGenerator", isWaiting: true}
			]
		});

		assert.equal((await asyncOperations.getUserOperationQueue(1, 1)).id, 1);
		await assert.rejects(
			() => asyncOperations.getUserOperationQueue(1, 2),
			(error: Error) => error.message === "not_permitted"
		);
		await assert.rejects(
			() => asyncOperations.getUserOperationQueue(1, 404),
			(error: Error) => error.message === "operation_queue_not_found"
		);
	});

	it("lists only the current user's waiting operation queues", async () => {
		const asyncOperations = createAsyncOperationModule({
			queues: [
				{id: 1, userId: 1, module: "staticSiteGenerator", isWaiting: true},
				{id: 2, userId: 2, module: "staticSiteGenerator", isWaiting: true},
				{id: 3, userId: 1, module: "telegramClient", isWaiting: true},
				{id: 4, userId: 1, module: "staticSiteGenerator", isWaiting: false}
			]
		});

		const result = await asyncOperations.getWaitingOperationQueueListByModule(1, "staticSiteGenerator", {
			limit: 20,
			offset: 0,
			sortBy: "createdAt",
			sortDir: "desc"
		});

		assert.deepEqual(result.list.map((queue) => queue.id), [1]);
		assert.equal(result.total, 1);
	});

	it("rejects cross-user async operation reads and cancellation", async () => {
		const operations = [
			{id: 1, userId: 1, name: "render", channel: "user-1", inProcess: true, cancel: false},
			{id: 2, userId: 2, name: "render", channel: "user-2", inProcess: true, cancel: false}
		];
		const asyncOperations = createAsyncOperationModule({operations});

		assert.equal((await asyncOperations.getAsyncOperation(1, 1)).id, 1);
		await assert.rejects(
			() => asyncOperations.getAsyncOperation(1, 2),
			(error: Error) => error.message === "not_permitted"
		);
		await assert.rejects(
			() => asyncOperations.cancelAsyncOperation(1, 2),
			(error: Error) => error.message === "not_permitted"
		);

		await asyncOperations.cancelAsyncOperation(1, 1);
		assert.equal(operations[0].cancel, true);
		assert.equal(operations[1].cancel, false);
	});

	it("processes module queues through async operation lifecycle", async () => {
		const queues = [
			{id: 1, userId: 1, userApiKeyId: 2, module: "storage-space-snapshot", inputJson: "{\"limit\":3}", isWaiting: true, createdAt: new Date("2026-05-01T00:00:00.000Z")},
		];
		const operations = [];
		const asyncOperations = createAsyncOperationModule({operations, queues});

		const result = await asyncOperations.processModuleOperationQueue("storage-space-snapshot", {
			getPayload: (waitingQueue) => JSON.parse(waitingQueue.inputJson),
			getAsyncOperationData: (_waitingQueue, payload) => ({
				name: "refresh-storage-space-snapshot",
				channel: `snapshot:${payload.limit}`,
				percent: 5,
			}),
			run: async (_waitingQueue, asyncOperation, payload) => {
				assert.equal(asyncOperation.inProcess, true);
				assert.equal(asyncOperation.module, "storage-space-snapshot");
				return {refreshed: payload.limit};
			},
		});

		assert.equal(result.processed, 1);
		assert.equal(queues[0].isWaiting, false);
		assert.equal(queues[0].asyncOperationId, 1);
		assert.ok(queues[0].startedAt instanceof Date);
		assert.equal(operations.length, 1);
		assert.equal(operations[0].name, "refresh-storage-space-snapshot");
		assert.equal(operations[0].channel, "snapshot:3");
		assert.equal(operations[0].percent, 100);
		assert.equal(operations[0].inProcess, false);
		assert.equal(operations[0].output, "{\"refreshed\":3}");
	});

	it("keeps async operation wrapper diagnostics out of stderr", async () => {
		const operations = [];
		const asyncOperations = createAsyncOperationModule({
			operations,
			appOverrides: {
				ms: {
					communicator: {
						publishEvent: async () => null
					},
					failingModule: {
						run: async () => {
							throw new Error("expected_async_failure");
						}
					},
					successfulModule: {
						run: async () => ({id: 42})
					}
				}
			}
		});

		const consoleErrorCalls = await captureConsoleErrors(async () => {
			const success = await asyncOperations.asyncOperationWrapper("successfulModule", "run", [{payload: "hidden"}], {
				userId: 1,
				userApiKeyId: 2,
				async: true
			});
			assert.equal(success.asyncOperationId, 1);
			await flushAsyncHandlers();

			const failure = await asyncOperations.asyncOperationWrapper("failingModule", "run", [], {
				userId: 1,
				userApiKeyId: 2,
				async: true
			});
			assert.equal(failure.asyncOperationId, 2);
			await flushAsyncHandlers();
		});

		assert.deepEqual(consoleErrorCalls, []);
		assert.equal(operations[0].inProcess, false);
		assert.equal(operations[0].contentId, 42);
		assert.equal(operations[1].inProcess, false);
		assert.equal(operations[1].errorMessage, "expected_async_failure");
	});

	it("closes completed queue heads before processing the next module queue item", async () => {
		const operations = [
			{id: 1, userId: 1, name: "old-refresh", inProcess: false},
		];
		const queues = [
			{id: 1, userId: 1, module: "storage-space-snapshot", inputJson: "{}", isWaiting: true, asyncOperationId: 1, createdAt: new Date("2026-05-01T00:00:00.000Z")},
			{id: 2, userId: 1, module: "storage-space-snapshot", inputJson: "{}", isWaiting: true, asyncOperationId: null, createdAt: new Date("2026-05-02T00:00:00.000Z")},
		];
		const asyncOperations = createAsyncOperationModule({operations, queues});

		const result = await asyncOperations.processModuleOperationQueue("storage-space-snapshot", {
			getAsyncOperationData: () => ({
				name: "refresh-storage-space-snapshot",
				channel: "snapshot",
				percent: 5,
			}),
			run: async () => ({ok: true}),
		});

		assert.equal(result.processed, 1);
		assert.equal(queues[0].isWaiting, false);
		assert.equal(queues[1].isWaiting, false);
		assert.equal(queues[1].asyncOperationId, 2);
		assert.equal(operations.length, 2);
		assert.equal(operations[1].output, "{\"ok\":true}");
	});

	it("cleans up old finished operations and closed orphan queue rows in bounded batches", async () => {
		const oldDate = new Date("2026-03-01T00:00:00.000Z");
		const recentDate = new Date("2026-04-15T00:00:00.000Z");
		const cutoff = new Date("2026-04-01T00:00:00.000Z");
		const operations = [
			{id: 1, userId: 1, name: "render", inProcess: false, updatedAt: oldDate},
			{id: 2, userId: 1, name: "failed-render", inProcess: false, updatedAt: oldDate},
			{id: 3, userId: 1, name: "running-render", inProcess: true, updatedAt: oldDate},
			{id: 4, userId: 1, name: "recent-render", inProcess: false, updatedAt: recentDate}
		];
		const queues = [
			{id: 1, userId: 1, module: "staticSiteGenerator", isWaiting: false, asyncOperationId: 1, updatedAt: oldDate},
			{id: 2, userId: 1, module: "staticSiteGenerator", isWaiting: false, asyncOperationId: 2, updatedAt: oldDate},
			{id: 3, userId: 1, module: "staticSiteGenerator", isWaiting: false, asyncOperationId: null, updatedAt: oldDate},
			{id: 4, userId: 1, module: "staticSiteGenerator", isWaiting: false, asyncOperationId: 4, updatedAt: oldDate},
			{id: 5, userId: 1, module: "staticSiteGenerator", isWaiting: true, asyncOperationId: null, updatedAt: oldDate},
			{id: 6, userId: 1, module: "staticSiteGenerator", isWaiting: false, asyncOperationId: null, updatedAt: oldDate}
		];
		const asyncOperations = createAsyncOperationModule({operations, queues});

		const result = await asyncOperations.cleanupFinishedAsyncOperations({cutoff, limit: 1});

		assert.equal(result.deletedOperations, 1);
		assert.equal(result.deletedQueues, 2);
		assert.deepEqual(operations.map(operation => operation.id), [2, 3, 4]);
		assert.deepEqual(queues.map(queue => queue.id), [2, 4, 5, 6]);
	});
});

async function captureConsoleErrors(callback) {
	const originalConsoleError = console.error;
	const consoleErrorCalls: any[] = [];
	console.error = ((...args) => {
		consoleErrorCalls.push(args);
	}) as any;
	try {
		await callback();
		return consoleErrorCalls;
	} finally {
		console.error = originalConsoleError;
	}
}

async function flushAsyncHandlers() {
	await new Promise((resolve) => setImmediate(resolve));
}
