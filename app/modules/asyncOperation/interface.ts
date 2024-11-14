import {IContent, IListParams} from "../database/interface.js";

export default interface IGeesomeAsyncOperationModule {

	asyncOperationWrapper(moduleName, funcName, funcArgs, options);

	getAsyncOperation(userId, id): Promise<IUserAsyncOperation>;

	addAsyncOperation(userId, asyncOperationData): Promise<IUserAsyncOperation>;

	updateAsyncOperation(userId, asyncOperationId, percent);

	cancelAsyncOperation(userId, asyncOperationId);

	finishAsyncOperation(userId, asyncOperationId, contentId?);

	errorAsyncOperation(userId, asyncOperationId, errorMessage);

	handleOperationCancel(userId, asyncOperationId);

	findAsyncOperations(userId, name?, channelLike?, inProcess?): Promise<IUserAsyncOperation[]>;

	addUserOperationQueue(userId, module, apiKeyId, inputs): Promise<IUserOperationQueue>;

	closeImportAsyncOperation(userId, asyncOperation, error);

	waitForImportAsyncOperation(asyncOperation);

	getWaitingOperationByModule(module): Promise<IUserOperationQueue>;

	getUserOperationQueue(userId, userOperationQueueId): Promise<IUserOperationQueue>;

	getWaitingOperationQueueListByModule(userId, module, listParams: IListParams): Promise<{list: IUserOperationQueue, total: number}>;

	setAsyncOperationToUserOperationQueue(userOperationQueueId, userAsyncOperationId): Promise<any>;

	closeUserOperationQueueByAsyncOperationId(userAsyncOperationId): Promise<any>;

	addUserAsyncOperation(userAsyncOperation): Promise<IUserAsyncOperation>;

	updateUserAsyncOperation(id, updateData): Promise<IUserAsyncOperation>;

	getUserAsyncOperation(operationId): Promise<IUserAsyncOperation>;

	getUserAsyncOperationList(userId, name?, channelLike?): Promise<IUserAsyncOperation[]>;

	closeAllAsyncOperation(): Promise<any>;

	updateUserOperationQueue(id, updateData): Promise<any>;

	getWaitingOperationQueueByModule(module): Promise<IUserOperationQueue>;
}


export interface IUserAsyncOperation {
	id?: number;
	name: string;
	channel: string;
	size: number;
	percent: number;
	finishedAt: Date;
	errorType: string;
	errorMessage: string;
	inProcess: boolean;
	cancel: boolean;

	userId: number;
	contentId?: number;
	content?: IContent;
}

export interface IUserOperationQueue {
	id?: number;
	module: string;
	inputHash: string;
	startedAt: Date;
	inputJson: string;
	isWaiting: boolean;
	userId: number;
	asyncOperationId: number;
	userApiKeyId: number;
	asyncOperation?: IUserAsyncOperation;
}
