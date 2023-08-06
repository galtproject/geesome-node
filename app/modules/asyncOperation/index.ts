import {IGeesomeApp} from "../../interface";
import {
	CorePermissionName
} from "../database/interface";
import IGeesomeAsyncOperationModule, {IUserAsyncOperation, IUserOperationQueue} from "./interface";
const _ = require('lodash');
const commonHelper = require('geesome-libs/src/common');
const Op = require("sequelize").Op;

module.exports = async (app: IGeesomeApp) => {
	// app.checkModules([]);
	const module = getModule(app, await require('./models')());
	await module.closeAllAsyncOperation();
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models) {
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
			if (_.isObject(_.last(args))) {
				_.last(args).onProgress = (progress) => {
					console.log('onProgress', progress);
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

			methodPromise
				.then((res: any) => {
					this.updateUserAsyncOperation(asyncOperation.id, {
						inProcess: false,
						contentId: res.id
					});
					return app.ms.communicator ? app.ms.communicator.publishEvent(asyncOperation.channel, res) : null;
				})
				.catch((e) => {
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

		async findAsyncOperations(userId, name, channelLike) {
			return this.getUserAsyncOperationList(userId, name, channelLike);
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

		async finishAsyncOperation(userId, asyncOperationId, contentId = null) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return this.updateUserAsyncOperation(asyncOperationId, {
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
			const asyncOperation = await app.ms.asyncOperation.getAsyncOperation(userId, asyncOperationId);
			if (asyncOperation.cancel) {
				await app.ms.asyncOperation.errorAsyncOperation(userId, asyncOperation.id, "canceled");
				throw new Error("import_canceled");
			}
		}

		async closeImportAsyncOperation(userId, asyncOperation, error) {
			if (finishCallbacks[asyncOperation.id]) {
				finishCallbacks[asyncOperation.id](await app.ms.asyncOperation.getAsyncOperation(userId, asyncOperation.id));
			}
			if (error) {
				return app.ms.asyncOperation.errorAsyncOperation(userId, asyncOperation.id, error.message);
			} else {
				return app.ms.asyncOperation.finishAsyncOperation(userId, asyncOperation.id);
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
			const inputJson = JSON.stringify(input);
			return models.UserOperationQueue.create({
				userId,
				module,
				inputJson,
				userApiKeyId,
				inputHash: commonHelper.hash(inputJson),
				isWaiting: true,
			});
		}

		getWaitingOperationByModule(module) {
			return this.getWaitingOperationQueueByModule(module);
		}

		async getUserOperationQueue(userId, userOperationQueueId) {
			const userOperationQueue = await models.UserOperationQueue.findOne({where: {id: userOperationQueueId}, include: [ {association: 'asyncOperation'} ]}) as IUserOperationQueue;
			if (userOperationQueue.userId != userId) {
				throw new Error("not_permitted");
			}
			return userOperationQueue;
		}

		setAsyncOperationToUserOperationQueue(userOperationQueueId, asyncOperationId) {
			return this.updateUserOperationQueue(userOperationQueueId, { asyncOperationId });
		}

		closeUserOperationQueueByAsyncOperationId(userAsyncOperationId) {
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

	}

	return new AsyncOperationModule();
}