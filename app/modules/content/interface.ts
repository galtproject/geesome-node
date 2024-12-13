import {IContent, IListParams} from "../database/interface.js";
import {IContentListResponse} from "../../interface.js";

export default interface IGeesomeContentModule {
	getFileStream(filePath, options?);

	getAllContentList(adminId, searchString, listParams?: IListParams): Promise<IContentListResponse>;

	getContent(contentId): Promise<IContent>;

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