import {IGeesomeApp} from "../../interface";
import {
	CorePermissionName
} from "../database/interface";
import IGeesomeAsyncOperationModule from "./interface";
const _ = require('lodash');
const commonHelper = require('geesome-libs/src/common');

module.exports = async (app: IGeesomeApp) => {
	const module = getModule(app);
	await app.ms.database.closeAllAsyncOperation();
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['database']);

	class AsyncOperationModule implements IGeesomeAsyncOperationModule {
		async asyncOperationWrapper(moduleName, funcName, args, options) {
			await app.checkUserCan(options.userId, CorePermissionName.UserSaveData);

			if (!options.async) {
				return app.ms[moduleName][funcName].apply(app, args);
			}

			const asyncOperation = await app.ms.database.addUserAsyncOperation({
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
					app.ms.database.updateUserAsyncOperation(asyncOperation.id, {
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
			const methodPromise = app[funcName].apply(app, args);

			methodPromise
				.then((res: any) => {
					app.ms.database.updateUserAsyncOperation(asyncOperation.id, {
						inProcess: false,
						contentId: res.id
					});
					return app.ms.communicator ? app.ms.communicator.publishEvent(asyncOperation.channel, res) : null;
				})
				.catch((e) => {
					return app.ms.database.updateUserAsyncOperation(asyncOperation.id, {
						inProcess: false,
						errorType: 'unknown',
						errorMessage: e && e.message ? e.message : e
					});
				});

			try {
				await dataSendingPromise;
			} catch(e) {
				await app.ms.database.updateUserAsyncOperation(asyncOperation.id, {
					inProcess: false,
					errorType: 'unknown',
					errorMessage: e && e.message ? e.message : e
				});
			}

			return {asyncOperationId: asyncOperation.id, channel: asyncOperation.channel};
		}


		async getAsyncOperation(userId, operationId) {
			const asyncOperation = await app.ms.database.getUserAsyncOperation(operationId);
			if (asyncOperation.userId != userId) {
				throw new Error("not_permitted");
			}
			return asyncOperation;
		}

		async findAsyncOperations(userId, name, channelLike) {
			return app.ms.database.getUserAsyncOperationList(userId, name, channelLike);
		}

		async addAsyncOperation(userId, asyncOperationData) {
			return app.ms.database.addUserAsyncOperation({
				...asyncOperationData,
				userId,
				inProcess: true,
			});
		}

		async updateAsyncOperation(userId, asyncOperationId, percent) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return app.ms.database.updateUserAsyncOperation(asyncOperationId, { percent });
		}

		async cancelAsyncOperation(userId, asyncOperationId) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return app.ms.database.updateUserAsyncOperation(asyncOperationId, { cancel: true });
		}

		async finishAsyncOperation(userId, asyncOperationId, contentId = null) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return app.ms.database.updateUserAsyncOperation(asyncOperationId, {
				contentId,
				percent: 100,
				inProcess: false,
				finishedAt: new Date()
			});
		}

		async errorAsyncOperation(userId, asyncOperationId, errorMessage) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return app.ms.database.updateUserAsyncOperation(asyncOperationId, { inProcess: false, errorMessage });
		}

		addUserOperationQueue(userId, module, userApiKeyId, input) {
			const inputJson = JSON.stringify(input);
			return app.ms.database.addUserOperationQueue({
				userId,
				module,
				inputJson,
				userApiKeyId,
				inputHash: commonHelper.hash(inputJson),
				isWaiting: true,
			});
		}

		getWaitingOperationByModule(module) {
			return app.ms.database.getWaitingOperationQueueByModule(module);
		}

		async getUserOperationQueue(userId, userOperationQueueId) {
			const userOperationQueue = await app.ms.database.getUserOperationQueue(userOperationQueueId);
			if (userOperationQueue.userId != userId) {
				throw new Error("not_permitted");
			}
			return userOperationQueue;
		}

		setAsyncOperationToUserOperationQueue(userOperationQueueId, asyncOperationId) {
			return app.ms.database.updateUserOperationQueue(userOperationQueueId, { asyncOperationId });
		}

		closeUserOperationQueueByAsyncOperationId(userAsyncOperationId) {
			return app.ms.database.updateUserOperationQueueByAsyncOperationId(userAsyncOperationId, { isWaiting: false });
		}
	}

	return new AsyncOperationModule();
}