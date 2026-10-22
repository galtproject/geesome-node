export interface IContentArchive {
	originalStorageId: string;
	archivedStorageId: string;
}

export default interface IGeesomeArchiveModule {
	requestArchive(userId: number, storageId: string, apiKeyId?: number): Promise<any>;
	getArchive(storageId: string): Promise<IContentArchive | null>;
	retireArchive(userId: number, storageId: string, expectedArchiveStorageId: string | null): Promise<void>;
	processQueue(): Promise<any>;
	stop(): Promise<void>;
}
