import {IFileCatalogListResponse, ManifestToSave} from "../../interface";
import {IContent, IListParams} from "../database/interface";

export default interface IGeesomeFileCatalogModule {
	getFileCatalogItem(itemId): Promise<IFileCatalogItem>;

	getFileCatalogItemByDefaultFolderFor(userId, defaultFolderFor): Promise<IFileCatalogItem>;

	getFileCatalogItemsByContent(userId, contentId, type?, listParams?: IListParams): Promise<IFileCatalogItem[]>;

	getFileCatalogItemsCount(userId, parentItemId, type?, search?): Promise<number>;

	isFileCatalogItemExistWithContent(userId, parentItemId, contentId): Promise<boolean>;

	addFileCatalogItem(item: IFileCatalogItem): Promise<IFileCatalogItem>;

	getFileCatalogItemsSizeSum(parentItemId): Promise<number>;

	saveDataToPath(userId: number, dataToSave, path, options?): Promise<IFileCatalogItem>;

	saveContentByPath(userId, path, contentId): Promise<IFileCatalogItem>;

	getContentByPath(userId, path): Promise<IContent>;

	getFileCatalogItems(userId, parentItemId, type?, search?, listParams?: IListParams): Promise<IFileCatalogListResponse>;

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

export interface IFileCatalogItem {
	id?: number;
	name: string;
	type: FileCatalogItemType;
	position: number;
	userId: number;
	defaultFolderFor?: string;
	linkOfId?: number;
	parentItemId?: number;
	contentId?: number;
	groupId?: number;
	size?: number;
	manifestStorageId?: string;
	nativeStorageId?: string;

	content?: IContent;
}

export enum FileCatalogItemType {
	Folder = 'folder',
	File = 'file'
}
