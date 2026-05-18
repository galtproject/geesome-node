import type {IUserOperationQueue} from "../asyncOperation/interface.js";
import type {IListParams} from "../database/interface.js";

export default interface IGeesomeStorageSpaceModule {
  getStorageSpaceOverview(): Promise<IStorageSpaceOverview>;

  getStorageSpaceTypeBreakdown(listParams?: IListParams): Promise<IStorageSpaceTypeBreakdownRow[]>;

  getStorageSpaceTopContents(listParams?: IListParams): Promise<IStorageSpaceContentRow[]>;

  getStorageSpaceTopFileCatalogItems(listParams?: IListParams): Promise<IStorageSpaceFileCatalogRow[]>;

  getStorageSpaceFileCatalogFolders(listParams?: IListParams): Promise<IStorageSpaceFileCatalogFolderRow[]>;

  getStorageSpaceTopGroups(listParams?: IListParams): Promise<IStorageSpaceGroupRow[]>;

  getStorageSpaceGroupPosts(listParams?: IListParams): Promise<IStorageSpaceGroupPostRow[]>;

  getLatestStorageSpaceSnapshot(): Promise<IStorageSpaceSnapshot | null>;

  refreshStorageSpaceSnapshot(userId?: number, listParams?: IListParams): Promise<IStorageSpaceSnapshot>;

  getStorageSpaceSnapshotData(listParams?: IListParams): Promise<IStorageSpaceSnapshotData>;

  queueStorageSpaceSnapshotRefresh(userId: number, userApiKeyId?: number, listParams?: IListParams, options?: any): Promise<IUserOperationQueue>;

  processStorageSpaceSnapshotRefreshQueue(options?: any): Promise<{processed: number}>;
}

export interface IStorageSpaceOverview {
  contentRowsCount: number;
  contentStorageObjectsCount: number;
  logicalContentBytes: number;
  physicalContentBytes: number;
  duplicateStorageIdsCount: number;
  duplicateContentRowsCount: number;
  fileCatalogItemsCount: number;
  fileCatalogLogicalBytes: number;
  groupPostsCount: number;
  groupPostsLogicalBytes: number;
  pinnedStorageObjectsCount: number;
  pinnedPhysicalBytes: number;
}

export interface IStorageSpaceTypeBreakdownRow {
  mimeType: string;
  extension: string;
  contentRowsCount: number;
  storageObjectsCount: number;
  logicalBytes: number;
  physicalBytes: number;
}

export interface IStorageSpaceContentRow {
  id: number;
  userId: number;
  name?: string;
  mimeType?: string;
  extension?: string;
  storageId?: string;
  size: number;
  createdAt?: Date;
}

export interface IStorageSpaceFileCatalogRow {
  id: number;
  userId?: number;
  groupId?: number;
  parentItemId?: number;
  contentId?: number;
  name?: string;
  type?: string;
  mimeType?: string;
  extension?: string;
  storageId?: string;
  size: number;
}

export interface IStorageSpaceFileCatalogFolderRow {
  id: number;
  userId?: number;
  groupId?: number;
  parentItemId?: number;
  name?: string;
  defaultFolderFor?: string;
  childFoldersCount: number;
  directFilesCount: number;
  filesCount: number;
  storageObjectsCount: number;
  logicalBytes: number;
  physicalBytes: number;
}

export interface IStorageSpaceGroupRow {
  id: number;
  name?: string;
  title?: string;
  size: number;
  availablePostsCount: number;
}

export interface IStorageSpaceGroupPostRow {
  id: number;
  groupId?: number;
  userId?: number;
  localId?: number;
  name?: string;
  publishedAt?: Date;
  groupName?: string;
  groupTitle?: string;
  logicalBytes: number;
  attachmentsCount: number;
  attachmentLogicalBytes: number;
  storageObjectsCount: number;
  physicalBytes: number;
}

export interface IStorageSpaceSnapshotData {
  overview: IStorageSpaceOverview;
  typeBreakdown: IStorageSpaceTypeBreakdownRow[];
  topContents: IStorageSpaceContentRow[];
  topFileCatalogItems: IStorageSpaceFileCatalogRow[];
  fileCatalogFolders: IStorageSpaceFileCatalogFolderRow[];
  topGroups: IStorageSpaceGroupRow[];
  groupPosts: IStorageSpaceGroupPostRow[];
}

export interface IStorageSpaceSnapshot {
  id: number;
  userId?: number;
  listLimit: number;
  durationMs: number;
  data: IStorageSpaceSnapshotData;
  createdAt?: Date;
  updatedAt?: Date;
}
