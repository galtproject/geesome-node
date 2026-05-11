import assert from "assert";
import {Op} from "sequelize";
import {getModule as getAsyncOperationModule} from "../app/modules/asyncOperation/index.js";

function isBeforeDate(value, cutoff) {
	return new Date(value).getTime() < cutoff.getTime();
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

function createAsyncOperationModule({queues = [], operations = []}: {queues?: any[], operations?: any[]} = {}) {
	const app = {
		ms: {
			database: {
				setDefaultListParamsValues: (listParams) => {
					listParams.sortBy ||= "createdAt";
					listParams.sortDir ||= "DESC";
					listParams.limit ||= 20;
					listParams.offset ||= 0;
				}
			}
		}
	};

	return getAsyncOperationModule(app as any, {
		UserOperationQueue: {
			findOne: async ({where}) => queues.find((queue) => queue.id === Number(where.id)) || null,
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
				const queue = queues.find((item) => item.id === Number(where.id));
				if (queue) {
					Object.assign(queue, updateData);
				}
				return [queue ? 1 : 0];
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
