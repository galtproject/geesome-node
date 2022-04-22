import {IGeesomeApp, IGeesomeAsyncOperationModule} from "../../../interface";
import {
	CorePermissionName
} from "../../../../database/interface";
const _ = require('lodash');
const commonHelper = require('geesome-libs/src/common');

module.exports = (app: IGeesomeApp) => {
	const module = getModule(app);
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {

	class AsyncOperationModule implements IGeesomeAsyncOperationModule {
		async asyncOperationWrapper(methodName, args, options) {
			await app.checkUserCan(options.userId, CorePermissionName.UserSaveData);
			options.userApiKeyId = await app.getApyKeyId(options.apiKey);

			if (!options.async) {
				return this[methodName].apply(this, args);
			}

			const asyncOperation = await app.database.addUserAsyncOperation({
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
					app.database.updateUserAsyncOperation(asyncOperation.id, {
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
			const methodPromise = this[methodName].apply(this, args);

			methodPromise
				.then((res: any) => {
					app.database.updateUserAsyncOperation(asyncOperation.id, {
						inProcess: false,
						contentId: res.id
					});
					return app.communicator.publishEvent(asyncOperation.channel, res);
				})
				.catch((e) => {
					return app.database.updateUserAsyncOperation(asyncOperation.id, {
						inProcess: false,
						errorType: 'unknown',
						errorMessage: e && e.message ? e.message : e
					});
				});

			try {
				await dataSendingPromise;
			} catch(e) {
				await app.database.updateUserAsyncOperation(asyncOperation.id, {
					inProcess: false,
					errorType: 'unknown',
					errorMessage: e && e.message ? e.message : e
				});
			}

			return {asyncOperationId: asyncOperation.id, channel: asyncOperation.channel};
		}


		async getAsyncOperation(userId, operationId) {
			const asyncOperation = await app.database.getUserAsyncOperation(operationId);
			if (asyncOperation.userId != userId) {
				throw new Error("not_permitted");
			}
			return asyncOperation;
		}

		async findAsyncOperations(userId, name, channelLike) {
			return app.database.getUserAsyncOperationList(userId, name, channelLike);
		}

		async addAsyncOperation(userId, asyncOperationData) {
			return app.database.addUserAsyncOperation({
				...asyncOperationData,
				userId,
				inProcess: true,
			});
		}

		async updateAsyncOperation(userId, asyncOperationId, percent) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return app.database.updateUserAsyncOperation(asyncOperationId, { percent });
		}

		async cancelAsyncOperation(userId, asyncOperationId) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return app.database.updateUserAsyncOperation(asyncOperationId, { cancel: true });
		}

		async finishAsyncOperation(userId, asyncOperationId, contentId = null) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return app.database.updateUserAsyncOperation(asyncOperationId, {
				contentId,
				percent: 100,
				inProcess: false,
				finishedAt: new Date()
			});
		}

		async errorAsyncOperation(userId, asyncOperationId, errorMessage) {
			await this.getAsyncOperation(userId, asyncOperationId);
			return app.database.updateUserAsyncOperation(asyncOperationId, { inProcess: false, errorMessage });
		}

		addUserOperationQueue(userId, module, userApiKeyId, input) {
			const inputJson = JSON.stringify(input);
			return app.database.addUserOperationQueue({
				userId,
				module,
				inputJson,
				userApiKeyId,
				inputHash: commonHelper.hash(inputJson),
				isWaiting: true,
			});
		}

		getWaitingOperationByModule(module) {
			return app.database.getWaitingOperationQueueByModule(module);
		}

		async getUserOperationQueue(userId, userOperationQueueId) {
			const userOperationQueue = await app.database.getUserOperationQueue(userOperationQueueId);
			if (userOperationQueue.userId != userId) {
				throw new Error("not_permitted");
			}
			return userOperationQueue;
		}

		setAsyncOperationToUserOperationQueue(userOperationQueueId, asyncOperationId) {
			return app.database.updateUserOperationQueue(userOperationQueueId, { asyncOperationId });
		}

		closeUserOperationQueueByAsyncOperationId(userAsyncOperationId) {
			return app.database.updateUserOperationQueueByAsyncOperationId(userAsyncOperationId, { isWaiting: false });
		}
	}

	return new AsyncOperationModule();
}