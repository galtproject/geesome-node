import {IContent, IListParams} from "../database/interface.js";
import {IContentListResponse} from "../../interface.js";

export default interface IGeesomeContentModule {
	getFileStream(filePath, options?);

	getAllContentList(adminId, searchString, listParams?: IListParams): Promise<IContentListResponse>;

	getDeletedContentList(adminId, searchString, listParams?: IListParams): Promise<IContentListResponse>;

	getDeletedContentPurgeCandidates(adminId, options?): Promise<IContentTombstonePurgeCandidateListResponse>;

	purgeDeletedContentTombstones(adminId, options?): Promise<IContentTombstonePurgeResult>;

	restoreDeletedContent(adminId, contentId): Promise<IContent>;

	getContent(contentId): Promise<IContent>;

	getPublicContentMetadata(contentId, userId?): Promise<Partial<IContent>>;

	getContentByStorageId(storageId): Promise<IContent>;

	getContentByStorageAndUserId(storageId, userId): Promise<IContent>;

	getContentByStorageIdListAndUserId(storageIdList, userId): Promise<IContent[]>;

	getContentByManifestId(storageId): Promise<IContent>;

	createContentByObject(userId, contentObject, options?: { groupId?, userApiKeyId? }): Promise<IContent>;

	regenerateUserContentPreviews(userId): Promise<void>;

	saveData(userId, fileStream, fileName, options?): Promise<IContent>;

	saveDataByUrl(userId, url, options?): Promise<IContent>;

	saveDirectoryToStorage(userId, dirPath, options?): Promise<IContent>;

	createContentByRemoteStorageId(userId, manifestStorageId, options?: { groupId?, userApiKeyId? }): Promise<IContent>;

	getFileStreamForApiRequest(req, res, dataPath);

	getContentHead(req, res, hash);
}

export interface IContentTombstonePurgeCandidate {
	content: IContent;
	safety: any;
	retentionExpired: boolean;
	storageExists?: boolean;
	storageCheckError?: string;
	safeToPurge: boolean;
	purgeBlockers: string[];
}

export interface IContentTombstonePurgeCandidateListResponse {
	list: IContentTombstonePurgeCandidate[];
	total: number;
	retentionDays: number;
	cutoff: Date;
}

export interface IContentTombstonePurgeRow extends IContentTombstonePurgeCandidate {
	purged: boolean;
}

export interface IContentTombstonePurgeResult {
	list: IContentTombstonePurgeRow[];
	purged: number;
	skipped: number;
	retentionDays: number;
	cutoff: Date;
}
