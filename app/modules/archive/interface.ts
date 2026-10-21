export interface IContentArchive {
	originalStorageId: string;
	archivedStorageId: string;
}

export default interface IGeesomeArchiveModule {
	requestArchive(userId: number, storageId: string, apiKeyId?: number): Promise<any>;
	getArchive(storageId: string): Promise<IContentArchive | null>;
	processQueue(): Promise<any>;
	stop(): Promise<void>;
}
