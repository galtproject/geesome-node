import {IContent, IListParams} from "../database/interface";
import {IContentListResponse} from "../../interface";

export default interface IGeesomeContentModule {
	getFileStream(filePath, options?);

	getAllContentList(adminId, searchString, listParams?: IListParams): Promise<IContentListResponse>;

	getContent(contentId): Promise<IContent>;

	getContentByStorageId(storageId): Promise<IContent>;

	getContentByManifestId(storageId): Promise<IContent>;

	createContentByObject(contentObject, options?: { groupId?, userId?, userApiKeyId? }): Promise<IContent>;

	regenerateUserContentPreviews(userId): Promise<void>;

	saveData(userId, fileStream, fileName, options): Promise<IContent>;

	saveDataByUrl(userId, url, options): Promise<IContent>;

	saveDirectoryToStorage(userId, dirPath, options): Promise<IContent>;

	createContentByRemoteStorageId(manifestStorageId, options?: { groupId?, userId?, userApiKeyId? }): Promise<IContent>;

	getFileStreamForApiRequest(req, res, dataPath);
}