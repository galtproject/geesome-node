import _ from 'lodash';
import debug from 'debug';
import {Op} from "sequelize";
import commonHelper from "geesome-libs/src/common.js";
import IGeesomeAsyncOperationModule, {IModuleOperationQueueProcessorOptions, IUserAsyncOperation, IUserOperationQueue} from "./interface.js";
import {CorePermissionName, IListParams, IListParamsOptions} from "../database/interface.js";
import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
const {isObject, last} = _;
const log = debug('geesome:app:asyncOperation');
const operationQueueListParams: IListParamsOptions = {
	sortBy: 'createdAt',
	allowedSortBy: ['createdAt', 'updatedAt', 'id'],
	maxLimit: 100
};
const finishedOperationRetentionDays = 30;
const finishedOperationCleanupBatchLimit = 1000;
const moduleOperationQueuesInProcess = new Set<string>();

export default async (app: IGeesomeApp) => {
	// app.checkModules([]);
	const module = getModule(app, await (await import('./models.js')).default(app.ms.database.sequelize));
	await module.closeAllAsyncOperation();
	await module.cleanupFinishedAsyncOperations();
	(await import('./api.js')).default(app, module);
	return module;
}

export function getModule(app: IGeesomeApp, models) {
	let finishCallbacks = {

	};

	class AsyncOperationModule implements IGeesomeAsyncOperationModule {
		async asyncOperationWrapper(moduleName, funcName, args, options) {
			await app.checkUserCan(options.userId, CorePermissionName.UserSaveData);

			if (!options.async) {
				return this.executeOperation(moduleName, funcName, args);
			}

			const asyncOperation = await this.addUserAsyncOperation({
				userId: options.userId,
				userApiKeyId: options.userApiKeyId,
				name: 'save-data',
				inProcess: true,
				channel: await commonHelper.random()
			});

			// TODO: fix hotfix
			if (isObject(last(args))) {
				(last(args) as any).onProgress = (progress) => {
					log('onProgress', progress);
					this.updateUserAsyncOperation(asyncOperation.id, {
						percent: progress.percent
					});
				}
			}

			let dataSendingPromise = new Promise((resolve, reject) => {
				if (args[0].on) {
					//TODO: close that stream on limit reached error
					args[0].on('end', () => resolve(true));
					args[0].on('error', (e) => reject(e));
					args[0].on('limit', () => reject("limit_reached"));
				} else {
					resolve(true);
				}
			});
			const methodPromise = this.executeOperation(moduleName, funcName, args);

			console.error('executeOperation', moduleName, funcName, args);
			methodPromise
				.then((res: any) => {
					console.error('res.id', res.id, 'asyncOperation.id', asyncOperation.id);
					this.updateUserAsyncOperation(asyncOperation.id, {
						inProcess: false,
						contentId: res.id
					});
					return app.ms.communicator ? app.ms.communicator.publishEvent(asyncOperation.channel, res) : null;
				})
				.catch((e) => {
					console.error('asyncOperationWrapper', e);
					return this.updateUserAsyncOperation(asyncOperation.id, {
						inProcess: false,
						errorType: 'unknown',
						errorMessage: e && e.message ? e.message : e
					});
				});

			try {
				await dataSendingPromise;
			} catch(e) {
				await this.updateUserAsyncOperation(asyncOperation.id, {
					inProcess: false,
					errorType: 'unknown',
					errorMessage: e && e.message ? e.message : e
				});
			}

			return {asyncOperationId: asyncOperation.id, channel: asyncOperation.channel};
		}

		async executeOperation(moduleName, funcName, args) {
			return app.ms[moduleName][funcName].apply(app.ms[moduleName], args);
		}

		async getAsyncOperation(userId, operationId) {
			const asyncOperation = await this.getUserAsyncOperation(operationId);
			if (!asyncOperation) {
				return null;
			}
			if (asyncOperation.userId != userId) {
				throw new Error("not_permitted");
			}
			return asyncOperation;
		}

		async findAsyncOperations(userId, name, channelLike, inProcess) {
			return this.getUserAsyncOperationList(userId, name, channelLike, inProcess);
		}

		async addAsyncOperation(userId, asyncOperationData) {
			return this.addUserAsyncOperation({
				...asyncOperationData,
				userId,
				inProcess: true,
			});
		}

		async updateAsyncOperation(userId, asyncOperationId, percent) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return this.updateUserAsyncOperation(asyncOperationId, { percent });
		}

		async cancelAsyncOperation(userId, asyncOperationId) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return this.updateUserAsyncOperation(asyncOperationId, { cancel: true });
		}

		async finishAsyncOperation(userId, asyncOperationId, contentId = null, output = null) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return this.updateUserAsyncOperation(asyncOperationId, {
				output,
				contentId,
				percent: 100,
				inProcess: false,
				finishedAt: new Date()
			});
		}

		async errorAsyncOperation(userId, asyncOperationId, errorMessage) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return this.updateUserAsyncOperation(asyncOperationId, { inProcess: false, errorMessage });
		}

		async handleOperationCancel(userId, asyncOperationId) {
			const asyncOperation = await this.getAsyncOperation(userId, asyncOperationId);
			if (asyncOperation.cancel) {
				await this.errorAsyncOperation(userId, asyncOperation.id, "canceled");
				throw new Error("import_canceled");
			}
		}

		async closeImportAsyncOperation(userId, asyncOperation, error) {
			if (finishCallbacks[asyncOperation.id]) {
				finishCallbacks[asyncOperation.id](await this.getAsyncOperation(userId, asyncOperation.id));
			}
			if (error) {
				return this.errorAsyncOperation(userId, asyncOperation.id, error.message);
			} else {
				return this.finishAsyncOperation(userId, asyncOperation.id);
			}
		}

		async waitForImportAsyncOperation(asyncOperation) {
			const finishedOperation = await new Promise((resolve) => {
				finishCallbacks[asyncOperation.id] = resolve;
			});
			delete finishCallbacks[asyncOperation.id];
			return finishedOperation;
		}

		addUserOperationQueue(userId, module, userApiKeyId, input) {
			const {inputJson, inputHash} = getOperationQueueInputData(input);
			return models.UserOperationQueue.create({
				userId,
				module,
				inputJson,
				userApiKeyId,
				inputHash,
				isWaiting: true,
			});
		}

		async addUniqueUserOperationQueue(userId, module, userApiKeyId, input) {
			const {inputJson, inputHash} = getOperationQueueInputData(input);
			const existingQueue = await models.UserOperationQueue.findOne({
				where: {module, inputHash, isWaiting: true},
				order: [['createdAt', 'ASC'], ['id', 'ASC']],
				include: [ {association: 'asyncOperation'} ]
			});

			if (existingQueue) {
				return existingQueue;
			}

			return models.UserOperationQueue.create({
				userId,
				module,
				inputJson,
				userApiKeyId,
				inputHash,
				isWaiting: true,
			});
		}

		getWaitingOperationByModule(module) {
			return this.getWaitingOperationQueueByModule(module);
		}

		async processModuleOperationQueue(moduleName: string, options: IModuleOperationQueueProcessorOptions) {
			if (moduleOperationQueuesInProcess.has(moduleName)) {
				return {processed: 0};
			}

			moduleOperationQueuesInProcess.add(moduleName);
			let processed = 0;
			const limit = helpers.parsePositiveInteger(options.limit, Number.MAX_SAFE_INTEGER);

			try {
				while (processed < limit) {
					const waitingQueue = await this.getNextProcessableOperationQueue(moduleName);
					if (!waitingQueue) {
						return {processed};
					}

					await this.processModuleOperationQueueItem(waitingQueue, options);
					processed += 1;
				}
				return {processed};
			} finally {
				moduleOperationQueuesInProcess.delete(moduleName);
			}
		}

		async getNextProcessableOperationQueue(moduleName: string) {
			while (true) {
				const waitingQueue = await this.getWaitingOperationQueueByModule(moduleName);
				if (!waitingQueue) {
					return null;
				}
				if (!waitingQueue.asyncOperation) {
					return waitingQueue;
				}
				if (waitingQueue.asyncOperation.inProcess) {
					return null;
				}

				await this.closeUserOperationQueue(waitingQueue.id);
			}
		}

		async processModuleOperationQueueItem(waitingQueue: IUserOperationQueue, options: IModuleOperationQueueProcessorOptions) {
			let payload;
			try {
				payload = options.getPayload ? await options.getPayload(waitingQueue) : null;
			} catch (e) {
				await this.closeUserOperationQueue(waitingQueue.id);
				return null;
			}

			await this.updateUserOperationQueue(waitingQueue.id, {startedAt: new Date()});
			const asyncOperationData = await options.getAsyncOperationData(waitingQueue, payload);
			const asyncOperation = await this.addAsyncOperation(waitingQueue.userId, {
				userApiKeyId: waitingQueue.userApiKeyId,
				module: waitingQueue.module,
				...asyncOperationData,
			});

			await this.setAsyncOperationToUserOperationQueue(waitingQueue.id, asyncOperation.id);

			try {
				const result = await options.run(waitingQueue, asyncOperation, payload);
				await this.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
				await this.finishAsyncOperation(waitingQueue.userId, asyncOperation.id, null, getOperationQueueOutput(result));
				return result;
			} catch (e) {
				await this.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
				await this.errorAsyncOperation(waitingQueue.userId, asyncOperation.id, getErrorMessage(e));
				return null;
			}
		}

		async getUserOperationQueue(userId, userOperationQueueId) {
			const userOperationQueue = await models.UserOperationQueue.findOne({where: {id: userOperationQueueId}, include: [ {association: 'asyncOperation'} ]}) as IUserOperationQueue;
			if (!userOperationQueue) {
				throw new Error("operation_queue_not_found");
			}
			if (userOperationQueue.userId != userId) {
				throw new Error("not_permitted");
			}
			return userOperationQueue;
		}

		setAsyncOperationToUserOperationQueue(userOperationQueueId, asyncOperationId) {
			return this.updateUserOperationQueue(userOperationQueueId, { asyncOperationId });
		}

		closeUserOperationQueue(id: number) {
			return models.UserOperationQueue.update({ isWaiting: false }, {where: {id}});
		}

		closeUserOperationQueueByAsyncOperationId(userAsyncOperationId: number) {
			return models.UserOperationQueue.update({ isWaiting: false }, {where: {asyncOperationId: userAsyncOperationId}});
		}

		async addUserAsyncOperation(asyncOperationData) {
			return models.UserAsyncOperation.create(asyncOperationData);
		}

		async updateUserAsyncOperation(id, updateData) {
			return models.UserAsyncOperation.update(updateData, {where: {id}});
		}

		async closeAllAsyncOperation() {
			return models.UserAsyncOperation.update({inProcess: false, errorType: 'node-restart'}, {where: {inProcess: true}});
		}

		async cleanupFinishedAsyncOperations(options: any = {}) {
			const cutoff = options.cutoff ?? getFinishedOperationCleanupCutoff(options.retentionDays);
			const limit = options.limit ?? finishedOperationCleanupBatchLimit;
			let deletedOperations = 0;
			let deletedQueues = 0;
			const oldOperations = await models.UserAsyncOperation.findAll({
				attributes: ['id'],
				where: {
					inProcess: false,
					updatedAt: {[Op.lt]: cutoff}
				},
				order: [['updatedAt', 'ASC'], ['id', 'ASC']],
				limit
			});
			const operationIds = oldOperations.map(operation => operation.id);

			if (operationIds.length) {
				deletedQueues += await models.UserOperationQueue.destroy({where: {asyncOperationId: {[Op.in]: operationIds}}});
				deletedOperations += await models.UserAsyncOperation.destroy({where: {id: {[Op.in]: operationIds}}});
			}

			const oldOrphanQueues = await models.UserOperationQueue.findAll({
				attributes: ['id'],
				where: {
					isWaiting: false,
					asyncOperationId: null,
					updatedAt: {[Op.lt]: cutoff}
				},
				order: [['updatedAt', 'ASC'], ['id', 'ASC']],
				limit
			});
			const orphanQueueIds = oldOrphanQueues.map(operationQueue => operationQueue.id);

			if (orphanQueueIds.length) {
				deletedQueues += await models.UserOperationQueue.destroy({where: {id: {[Op.in]: orphanQueueIds}}});
			}

			return {deletedOperations, deletedQueues, cutoff};
		}

		async flushDatabase() {
			await models.UserOperationQueue.destroy({where: {}});
			await models.UserAsyncOperation.destroy({where: {}});
		}

		async getUserAsyncOperation(id) {
			return models.UserAsyncOperation.findOne({where: {id}}) as IUserAsyncOperation;
		}

		async getUserAsyncOperationList(userId, name = null, channelLike = null, inProcess = true) {
			const where = {userId};
			if (inProcess !== null && inProcess !== undefined) {
				where['inProcess'] = inProcess;
			}
			if (name) {
				where['name'] = name;
			}
			if (channelLike) {
				where['channel'] = {[Op.like]: channelLike};
			}
			return models.UserAsyncOperation.findAll({where, order: [['createdAt', 'DESC']], limit: 10});
		}

		async updateUserOperationQueue(id, updateData) {
			return models.UserOperationQueue.update(updateData, {where: {id}});
		}

		async getWaitingOperationQueueByModule(module) {
			return models.UserOperationQueue.findOne({where: {module, isWaiting: true}, order: [['createdAt', 'ASC']], include: [ {association: 'asyncOperation'} ]}) as IUserOperationQueue;
		}

		async getWaitingOperationQueueListByModule(userId, module, listParams: IListParams) {
			listParams = helpers.prepareListParams(listParams, operationQueueListParams);
			app.ms.database.setDefaultListParamsValues(listParams, operationQueueListParams);

			const {limit, offset, sortBy, sortDir} = listParams;
			const where = {userId, module, isWaiting: true};
			return {
				list: await models.UserOperationQueue.findAll({where, order: [[sortBy, sortDir.toUpperCase()]], limit, offset, include: [ {association: 'asyncOperation'} ]}),
				total: await models.UserOperationQueue.count({where})
			};
		}

	}

	return new AsyncOperationModule();
}

function getFinishedOperationCleanupCutoff(retentionDays = finishedOperationRetentionDays) {
	return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
}

function getOperationQueueInputData(input) {
	const inputJson = JSON.stringify(input);
	return {
		inputJson,
		inputHash: commonHelper.hash(inputJson)
	};
}

function getOperationQueueOutput(result) {
	if (result === null || result === undefined) {
		return null;
	}
	if (typeof result === 'string') {
		return result;
	}
	return JSON.stringify(result);
}

function getErrorMessage(error) {
	return error?.message || String(error);
}
