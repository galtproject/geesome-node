import assert from "assert";
import {getModule as getAsyncOperationModule} from "../app/modules/asyncOperation/index.js";

function createAsyncOperationModule({queues = [], operations = []}: {queues?: any[], operations?: any[]} = {}) {
	return getAsyncOperationModule({} as any, {
		UserOperationQueue: {
			findOne: async ({where}) => queues.find((queue) => queue.id === Number(where.id)) || null,
			findAll: async ({where}) => queues.filter((queue) => {
				return queue.userId === where.userId && queue.module === where.module && queue.isWaiting === where.isWaiting;
			}),
			count: async ({where}) => queues.filter((queue) => {
				return queue.userId === where.userId && queue.module === where.module && queue.isWaiting === where.isWaiting;
			}).length,
			update: async (updateData, {where}) => {
				const queue = queues.find((item) => item.id === Number(where.id));
				if (queue) {
					Object.assign(queue, updateData);
				}
				return [queue ? 1 : 0];
			}
		},
		UserAsyncOperation: {
			findOne: async ({where}) => operations.find((operation) => operation.id === Number(where.id)) || null,
			findAll: async ({where}) => operations.filter((operation) => operation.userId === where.userId),
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
});
