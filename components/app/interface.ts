/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {
  CorePermissionName,
  GroupType, GroupView, ICategory,
  IContent,
  IDatabase,
  IFileCatalogItem,
  IGroup, IGroupSection, IListParams,
  IPost,
  IUser, IUserAccount,
  IUserApiKey, IUserAuthMessage,
  IUserLimit, PostStatus, UserLimitName
} from "../database/interface";
import {IStorage} from "../storage/interface";
import {GeesomeEmitter} from "./v1/events";
import {IRender} from "../render/interface";

export interface IGeesomeApp {
  config: any;
  database: IDatabase;
  storage: IStorage;
  events: GeesomeEmitter;
  render: IRender;
  authorization: any;

  frontendStorageId;

  getSecretKey(keyName): Promise<string>;

  setup(userData: IUserInput): Promise<{user: IUser, apiKey: string}>;

  registerUser(userData: IUserInput): Promise<IUser>;

  loginPassword(usernameOrEmail, password): Promise<IUser>;

  loginAuthMessage(authMessageId, address, signature, params?): Promise<IUser>;

  generateUserAccountAuthMessage(accountProvider, accountAddress): Promise<IUserAuthMessageResponse>;

  updateUser(userId, updateData): Promise<IUser>;

  setUserAccount(userId, accountData): Promise<IUserAccount>;

  generateUserApiKey(userId, apiKeyData, skipPermissionCheck?): Promise<string>;

  updateApiKey(userId, id, updateData): Promise<void>;

  getUserByApiKey(apiKey): Promise<IUser>;

  getUserApiKeys(userId, isDisabled?, search?, listParams?: IListParams): Promise<IUserApiKeysListResponse>;

  setUserLimit(adminId, limitData: IUserLimit): Promise<IUserLimit>;

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

  addMemberToCategory(userId, categoryId, memberId, groupPermissions?: string[]): Promise<void>;

  addAdminToCategory(userId, categoryId, memberId, groupPermissions?: string[]): Promise<void>;

  removeMemberFromCategory(userId, categoryId, memberId): Promise<void>;

  isMemberInCategory(userId, categoryId): Promise<boolean>;

  setGroupPermissions(userId, groupId, memberId, groupPermissions?: string[]): Promise<void>;

  addAdminToGroup(userId, groupId, newAdminUserId): Promise<void>;

  removeAdminFromGroup(userId, groupId, removeAdminUserId): Promise<void>;

  setAdminsOfGroup(userId, groupId, adminIds): Promise<void>;

  getPost(userId, postId);

  createPost(userId, postData);

  updatePost(userId, postId, postData);

  createGroup(userId, groupData): Promise<IGroup>;

  createGroupByRemoteStorageId(manifestStorageId): Promise<IGroup>;

  updateGroup(userId, id, updateData): Promise<IGroup>;

  getGroup(groupId): Promise<IGroup>;

  getGroupByParams(params): Promise<IGroup>;

  getPostByParams(params): Promise<IPost>;

  getGroupPosts(groupId, filters?, listParams?: IListParams): Promise<IPostListResponse>;

  getGroupUnreadPostsCount(userId, groupId);

  addOrUpdateGroupRead(userId, groupReadData);

  getCategoryByParams(params): Promise<ICategory>;

  createCategory(userId, categoryData): Promise<ICategory>;

  addGroupToCategory(userId, groupId, categoryId): Promise<void>;

  getCategoryGroups(userId, categoryId, filters?, listParams?: IListParams): Promise<IGroupListResponse>;

  getCategoryPosts(categoryId, filters?, listParams?: IListParams): Promise<IPostListResponse>;

  createGroupSection(userId, groupSectionData): Promise<IGroupSection>;

  updateGroupSection(userId, groupSectionId, groupSectionData): Promise<IGroupSection>;

  getGroupSectionItems(filters?, listParams?: IListParams): Promise<IGroupSectionListResponse>;

  asyncOperationWrapper(methodName, args, options);

  saveData(fileStream, fileName, options): Promise<IContent>;

  saveDataByUrl(url, options): Promise<IContent>;

  getAsyncOperation(userId, id);

  createContentByRemoteStorageId(manifestStorageId): Promise<IContent>;

  createPostByRemoteStorageId(manifestStorageId, groupId, publishedAt?, isEncrypted?): Promise<IPost>;

  getFileStream(filePath, options?);

  checkStorageId(storageId): string;

  getDataStructure(dataId);

  saveDataStructure(data);

  getFileCatalogItems(userId, parentItemId, type?, search?, listParams?: IListParams): Promise<IFileCatalogListResponse>;

  getFileCatalogItemsBreadcrumbs(userId, itemId): Promise<IFileCatalogItem[]>;

  getFileCatalogItemsBreadcrumbs(userId, itemId): Promise<IFileCatalogItem[]>;

  getContentsIdsByFileCatalogIds(catalogIds): Promise<number[]>;

  createUserFolder(userId, parentItemId, folderName): Promise<IFileCatalogItem>;

  addContentToFolder(userId, contentId, folderId): Promise<any>;

  updateFileCatalogItem(userId, fileCatalogId, updateData): Promise<IFileCatalogItem>;

  saveContentByPath(userId, path, contentId): Promise<IFileCatalogItem>;

  getContentByPath(userId, path): Promise<IContent>;

  getFileCatalogItemByPath(userId, path, type): Promise<IFileCatalogItem>;

  publishFolder(userId, fileCatalogId, options?: {bindToStatic?}): Promise<{storageId:string, staticId?:string}>;

  saveManifestsToFolder(userId, path, toSaveList: ManifestToSave[], options?: { groupId? }): Promise<IFileCatalogItem>;

  deleteFileCatalogItem(userId, fileCatalogId, options): Promise<boolean>;

  regenerateUserContentPreviews(userId): Promise<void>;

  getAllUserList(adminId, searchString, listParams?: IListParams): Promise<IUserListResponse>;

  getAllContentList(adminId, searchString, listParams?: IListParams): Promise<IContentListResponse>;

  getAllGroupList(adminId, searchString, listParams?: IListParams): Promise<IGroupListResponse>;

  getUserLimit(adminId, userId, limitName): Promise<IUserLimit>;

  getUserLimitRemained(userId, limitName: UserLimitName): Promise<number>;

  getContent(contentId): Promise<IContent>;

  getContentByStorageId(storageId): Promise<IContent>;

  //TODO: define interface
  getPeers(topic): Promise<any>;

  //TODO: define interface
  getIpnsPeers(ipns): Promise<any>;

  //TODO: define interface
  getGroupPeers(groupId): Promise<any>;

  createStorageAccount(accountName): Promise<string>;

  resolveStaticId(staticId): Promise<string>;

  stop(): Promise<void>;
}

export interface IUserInput {
  name: string;
  email?: string;
  password?: string;

  accounts?: IUserAccountInput[];
  permissions?: CorePermissionName[];
}

export interface IUserAccountInput {
  id?: number;
  provider: string;
  address: string;
  description: string;
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
   * Upload driver from geesome-node/drivers/upload. "youtube-video" for example. Drivers can handle specific contents.
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
