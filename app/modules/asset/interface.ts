export default interface IGeesomeAssetModule {
	supportsBatches: boolean;

	flushDatabase(): Promise<void>;

	prepareAssetRequest(userId: number, key: string, requestHash: string): Promise<any>;

	createAssetFromUpload(userId: number, data: any, fileName: string, options: any): Promise<any>;

	getAsset(userId: number, storageId: string): Promise<any>;

	linkAssetOperation(requestId: number, operationId: number): Promise<void>;

	createBatch(userId: number, input: any, idempotencyKey: string): Promise<any>;

	getBatch(userId: number, batchId: number): Promise<any>;

	completeBatch(userId: number, batchId: number, userApiKeyId: number): Promise<any>;
}
