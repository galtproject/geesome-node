import {IUserAsyncOperation, IUserOperationQueue} from "../database/interface";

export default interface IGeesomeAsyncOperationModule {

	asyncOperationWrapper(moduleName, funcName, funcArgs, options);

	getAsyncOperation(userId, id): Promise<IUserAsyncOperation>;

	addAsyncOperation(userId, asyncOperationData): Promise<IUserAsyncOperation>;

	updateAsyncOperation(userId, asyncOperationId, percent);

	cancelAsyncOperation(userId, asyncOperationId);

	finishAsyncOperation(userId, asyncOperationId, contentId?);

	errorAsyncOperation(userId, asyncOperationId, errorMessage);

	findAsyncOperations(userId, name?, channelLike?): Promise<IUserAsyncOperation[]>;

	addUserOperationQueue(userId, module, apiKeyId, inputs): Promise<IUserOperationQueue>;

	getWaitingOperationByModule(module): Promise<IUserOperationQueue>;

	getUserOperationQueue(userId, userOperationQueueId): Promise<IUserOperationQueue>;

	setAsyncOperationToUserOperationQueue(userOperationQueueId, userAsyncOperationId): Promise<any>;

	closeUserOperationQueueByAsyncOperationId(userAsyncOperationId): Promise<any>;
}