import {FileCatalogItemType, IContent, IFileCatalogItem, IListParams} from "../database/interface";
import {IFileCatalogListResponse, ManifestToSave} from "../../interface";

export default interface IGeesomeFileCatalogModule {

	saveDataToPath(userId: number, dataToSave, path, options?): Promise<IFileCatalogItem>;

	saveContentByPath(userId, path, contentId): Promise<IFileCatalogItem>;

	getContentByPath(userId, path): Promise<IContent>;

	getFileCatalogItems(userId, parentItemId, type?, search?, listParams?: IListParams): Promise<IFileCatalogListResponse>;

	getFileCatalogItemsBreadcrumbs(userId, itemId): Promise<IFileCatalogItem[]>;

	getFileCatalogItemsBreadcrumbs(userId, itemId): Promise<IFileCatalogItem[]>;

	getContentsIdsByFileCatalogIds(catalogIds): Promise<number[]>;

	createUserFolder(userId, parentItemId, folderName): Promise<IFileCatalogItem>;

	addContentToFolder(userId, contentId, folderId): Promise<any>;

	updateFileCatalogItem(userId, fileCatalogId, updateData): Promise<IFileCatalogItem>;

	publishFolder(userId, fileCatalogId, options?: {bindToStatic?}): Promise<{storageId:string, staticId?:string}>;

	saveManifestsToFolder(userId, path, toSaveList: ManifestToSave[], options?: { groupId? }): Promise<IFileCatalogItem>;

	deleteFileCatalogItem(userId, fileCatalogId, options): Promise<boolean>;

	getFileCatalogItemByPath(userId, path, type: FileCatalogItemType): Promise<IFileCatalogItem>;

	addContentToUserFileCatalog(userId, content: IContent, options?: { groupId?, apiKey?, folderId?, path? });
}