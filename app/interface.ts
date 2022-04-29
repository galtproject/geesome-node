/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {
  CorePermissionName, FileCatalogItemType,
  GroupType, GroupView, ICategory,
  IContent,
  IGeesomeDatabaseModule,
  IFileCatalogItem,
  IGroup, IGroupSection, IInvite, IListParams,
  IPost, IStaticIdHistoryItem,
  IUser, IUserAccount,
  IUserApiKey, IUserAsyncOperation,
  IUserLimit, IUserOperationQueue, UserLimitName
} from "./modules/database/interface";
import IGeesomeStorageModule from "./modules/storage/interface";
import {GeesomeEmitter} from "./events";
import {IGeesomeEntityJsonManifestModule} from "./modules/entityJsonManifest/interface";
import IGeesomeCommunicatorModule from "./modules/communicator/interface";
import IGeesomeAccountStorageModule from "./modules/accountStorage/interface";
import IGeesomeApiModule from "./modules/api/interface";
import IGeesomeDriversModule from "./modules/drivers/interface";

export interface IGeesomeApp {
  config: any;
  events: GeesomeEmitter;

  frontendStorageId;

  //modules
  ms: {
    api: IGeesomeApiModule;
    asyncOperation: IGeesomeAsyncOperationModule;
    invite: IGeesomeInviteModule;
    group: IGeesomeGroupModule;
    fileCatalog: IGeesomeFileCatalogModule;
    accountStorage: IGeesomeAccountStorageModule;
    storage: IGeesomeStorageModule;
    communicator: IGeesomeCommunicatorModule;
    entityJsonManifest: IGeesomeEntityJsonManifestModule;
    database: IGeesomeDatabaseModule;
    drivers: IGeesomeDriversModule;
  };

  checkModules(modulesList: string[]);

  getSecretKey(keyName, mode): Promise<string>;

  setup(userData: IUserInput): Promise<{user: IUser, apiKey: string}>;

  registerUser(userData: IUserInput, inviteId?): Promise<IUser>;

  loginPassword(usernameOrEmail, password): Promise<IUser>;

  updateUser(userId, updateData): Promise<IUser>;

  setUserAccount(userId, accountData): Promise<IUserAccount>;

  checkUserId(userId, createIfNotExist?): Promise<number>;

  generateUserApiKey(userId, apiKeyData, skipPermissionCheck?): Promise<string>;

  updateApiKey(userId, id, updateData): Promise<void>;

  getApyKeyId(apiKey): Promise<number>;

  getUserByApiKey(apiKey): Promise<IUser>;

  getUserApiKeys(userId, isDisabled?, search?, listParams?: IListParams): Promise<IUserApiKeysListResponse>;

  setUserLimit(adminId, limitData: IUserLimit): Promise<IUserLimit>;

  checkUserCan(userId, permission): Promise<void>;

  saveData(fileStream, fileName, options): Promise<IContent>;

  saveDataByUrl(url, options): Promise<IContent>;

  saveDirectoryToStorage(userId, dirPath, options): Promise<IContent>;

  createContentByRemoteStorageId(manifestStorageId, options?: { groupId?, userId?, userApiKeyId? }): Promise<IContent>;

  getFileStream(filePath, options?);

  checkStorageId(storageId): string;

  getDataStructure(dataId, isResolve?);

  saveDataStructure(data);

  createContentByObject(contentObject, options?: { groupId?, userId?, userApiKeyId? }): Promise<IContent>;

  regenerateUserContentPreviews(userId): Promise<void>;

  getAllUserList(adminId, searchString, listParams?: IListParams): Promise<IUserListResponse>;

  getAllContentList(adminId, searchString, listParams?: IListParams): Promise<IContentListResponse>;

  getUserLimit(adminId, userId, limitName): Promise<IUserLimit>;

  getUserLimitRemained(userId, limitName: UserLimitName): Promise<number>;

  generateAndSaveManifest(entityName, entityObj): Promise<string>; //returns hash

  // getPreviewContentData()

  getContent(contentId): Promise<IContent>;

  getContentByStorageId(storageId): Promise<IContent>;

  getContentByManifestId(storageId): Promise<IContent>;

  //TODO: define interface
  getPeers(topic): Promise<any>;

  //TODO: define interface
  getStaticIdPeers(ipns): Promise<any>;

  getSelfAccountId(): Promise<string>;

  getBootNodes(userId, type?): Promise<string[]>;

  addBootNode(userId, address, type?): Promise<any>;

  removeBootNode(userId, address, type?): Promise<any>;

  createStorageAccount(accountName): Promise<string>;

  bindToStaticId(dynamicId, staticId): Promise<IStaticIdHistoryItem>;

  resolveStaticId(staticId): Promise<string>;

  stop(): Promise<void>;
}

export interface IGeesomeAsyncOperationModule {

  asyncOperationWrapper(methodName, args, options);

  getAsyncOperation(userId, id): Promise<IUserAsyncOperation>;

  addAsyncOperation(userId, asyncOperationData): Promise<IUserAsyncOperation>;

  updateAsyncOperation(userId, asyncOperationId, percent);

  cancelAsyncOperation(userId, asyncOperationId);

  finishAsyncOperation(userId, asyncOperationId, contentId?);

  errorAsyncOperation(userId, asyncOperationId, errorMessage);

  findAsyncOperations(userId, name?, channelLike?): Promise<IUserAsyncOperation[]>;

  addUserOperationQueue(userId, module, apiKeyId, inputs): Promise<IUserOperationQueue>;

  getWaitingOperationByModule(module): Promise<IUserOperationQueue>;

  getUserOperationQueue(userId, userOperationQueueId): Promise<IUserOperationQueue>;

  setAsyncOperationToUserOperationQueue(userOperationQueueId, userAsyncOperationId): Promise<any>;

  closeUserOperationQueueByAsyncOperationId(userAsyncOperationId): Promise<any>;
}

export interface IGeesomeFileCatalogModule {

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

export interface IGeesomeInviteModule {
  registerUserByInviteCode(inviteCode: string, userData: IUserInput): Promise<{user: IUser, apiKey: IUserApiKey}>;

  createInvite(userId, inviteData: IInvite): Promise<IInvite>;

  updateInvite(userId, inviteId, inviteData: IInvite): Promise<any>;

  getUserInvites(userId, filters?, listParams?: IListParams): Promise<IInvitesListResponse>;
}

export interface IGeesomeGroupModule {

  checkGroupId(groupId, createIfNotExist?): Promise<number>;

  getAllGroupList(adminId, searchString, listParams?: IListParams): Promise<IGroupListResponse>;

  getMemberInGroups(userId, types: GroupType[]): Promise<IGroupListResponse>;

  getAdminInGroups(userId, types: GroupType[]): Promise<IGroupListResponse>;

  getPersonalChatGroups(userId): Promise<IGroupListResponse>;

  addUserFriendById(userId, friendId): Promise<void>;

  removeUserFriendById(userId, friendId): Promise<void>;

  getUserFriends(userId, search?, listParams?: IListParams): Promise<IUserListResponse>;

  canCreatePostInGroup(userId, groupId);

  canEditGroup(userId, groupId);

  isAdminInGroup(userId, groupId): Promise<boolean>;

  isMemberInGroup(userId, groupId): Promise<boolean>;

  addMemberToGroup(userId, groupId, memberId, groupPermissions?: string[]): Promise<void>;

  setMembersOfGroup(userId, groupId, memberIds): Promise<void>;

  removeMemberFromGroup(userId, groupId, memberId): Promise<void>;

  setGroupPermissions(userId, groupId, memberId, groupPermissions?: string[]): Promise<void>;

  addAdminToGroup(userId, groupId, newAdminUserId): Promise<void>;

  removeAdminFromGroup(userId, groupId, removeAdminUserId): Promise<void>;

  setAdminsOfGroup(userId, groupId, adminIds): Promise<void>;

  getPost(userId, postId);

  getPostListByIds(userId, groupId, postIds);

  createPost(userId, postData);

  createPostByRemoteStorageId(manifestStorageId, groupId, publishedAt?, isEncrypted?): Promise<IPost>;

  updatePost(userId, postId, postData);

  createGroup(userId, groupData): Promise<IGroup>;

  createGroupByRemoteStorageId(manifestStorageId): Promise<IGroup>;

  updateGroup(userId, id, updateData): Promise<IGroup>;

  getGroup(groupId): Promise<IGroup>;

  getGroupByParams(params): Promise<IGroup>;

  getPostByParams(params): Promise<IPost>;

  getPostContent(baseStorageUri: string, post: IPost): Promise<{type, mimeType, view, manifestId, text?, url?, previewUrl?}[]>;

  getGroupPosts(groupId, filters?, listParams?: IListParams): Promise<IPostListResponse>;

  getGroupUnreadPostsData(userId, groupId): Promise<{count, readAt}>;

  addOrUpdateGroupRead(userId, groupReadData);

  //TODO: define interface
  getGroupPeers(groupId): Promise<any>;
}

export interface IGeesomeGroupCategoryModule {
  getCategoryByParams(params): Promise<ICategory>;

  createCategory(userId, categoryData): Promise<ICategory>;

  addGroupToCategory(userId, groupId, categoryId): Promise<void>;

  getCategoryGroups(userId, categoryId, filters?, listParams?: IListParams): Promise<IGroupListResponse>;

  getCategoryPosts(categoryId, filters?, listParams?: IListParams): Promise<IPostListResponse>;

  createGroupSection(userId, groupSectionData): Promise<IGroupSection>;

  updateGroupSection(userId, groupSectionId, groupSectionData): Promise<IGroupSection>;

  getGroupSectionItems(filters?, listParams?: IListParams): Promise<IGroupSectionListResponse>;

  addMemberToCategory(userId, categoryId, memberId, groupPermissions?: string[]): Promise<void>;

  addAdminToCategory(userId, categoryId, memberId, groupPermissions?: string[]): Promise<void>;

  removeMemberFromCategory(userId, categoryId, memberId): Promise<void>;

  isMemberInCategory(userId, categoryId): Promise<boolean>;
}

export interface IUserInput {
  name: string;
  email?: string;
  password?: string;

  accounts?: IUserAccountInput[];
  permissions?: CorePermissionName[];

  joinedByInviteId?: number;
}

export interface IUserAccountInput {
  id?: number;
  provider: string;
  address: string;
  description?: string;
  signature?: string;
  type?: string;
}

export interface IUserAuthResponse {
  apiKey: string;
  user: IUser;
}

export interface IUserAuthMessageResponse {
  id: number;
  provider: string;
  address: string;
  message: string;
}

export interface IGroupInput {
  name: string;
  title: string;
  type: GroupType;
  view: GroupView;
  theme: string;
  isPublic: boolean;
  description?: string;
  avatarImageId?: number;
  coverImageId?: number;
}

export interface IContentInput {
  /**
   * Bind content to specific group
   */
  groupId?: any;
  /**
   * Save in specific folder in user file catalog. Not working with "path" field.
   */
  folderId?: number;
  /**
   * Save by specific path in user file catalog. /var/www/my-site/index.html for example
   */
  path?: string;
  /**
   * Enable async operation (File will be saved in background, response will contain "asyncOperationId" property, that can be used in get-async-operation)
   */
  async?: boolean;
}
export interface IFileContentInput extends IContentInput {
  file: File;
}

export interface IDataContentInput {
  /**
   * String or buffer
   */
  content: string;
  fileName: string;
  mimeType: string;
}

export interface IUrlContentInput {
  url: string;
  /**
   * Upload driver from geesome-node/drivers/upload. "youtubeVideo" for example. Drivers can handle specific contents.
   */
  driver: string;
  mimeType: string;
}

export interface IPostInput {
  /**
   * Bind content to specific group
   */
  groupId?: any;
  /**
   * 'published', 'queue', 'draft', 'deleted'
   */
  status?: string;
  /**
   * Content database ids array
   */
  contentsIds: number[];
}

export interface ManifestToSave {
  manifestStorageId;
  path?;
}

export interface IInvitesListResponse {
  list: IInvite[];
  total: number;
}

export interface IFileCatalogListResponse {
  list: IFileCatalogItem[];
  total: number;
}

export interface IUserApiKeysListResponse {
  list: IUserApiKey[];
  total: number;
}

export interface IUserListResponse {
  list: IUser[];
  total: number;
}

export interface IGroupListResponse {
  list: IGroup[];
  total: number;
}

export interface IGroupSectionListResponse {
  list: IGroupSection[];
  total: number;
}

export interface IContentListResponse {
  list: IContent[];
  total: number;
}

export interface IPostListResponse {
  list: IPost[];
  total: number;
}
