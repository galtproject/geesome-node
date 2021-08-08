/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGroupInput, IUserAccountInput} from "../app/interface";

export interface IDatabase {
  getSessionStore(): any;

  flushDatabase(): Promise<void>;

  addApiKey(apiKey): Promise<IUserApiKey>;

  getApiKey(id): Promise<IUserApiKey>;

  getApiKeyByHash(valueHash: string): Promise<IUserApiKey>;

  getApiKeysByUser(userId: number, isDisabled?: boolean, search?: string, listParams?: IListParams): Promise<IUserApiKey[]>;

  getApiKeysCountByUser(userId: number, isDisabled?: boolean, search?: string): Promise<number>;

  updateApiKey(id, updateData): Promise<void>;

  addContent(content: IContent): Promise<IContent>;

  updateContent(id, updateData: any): Promise<void>;

  deleteContent(id): Promise<void>;

  getContentList(accountAddress, listParams?: IListParams): Promise<IContent[]>;

  getContent(id): Promise<IContent>;

  getContentByStorageId(storageId, findByPreviews?): Promise<IContent>;

  getContentByStorageAndUserId(storageId, userId): Promise<IContent>;

  getContentByManifestId(manifestId): Promise<IContent>;

  getObjectByStorageId(storageId): Promise<IObject>;

  addObject(objectData): Promise<IObject>;

  addPost(post: IPost): Promise<IPost>;

  getPostByManifestId(manifestStorageId): Promise<IPost>;

  getPostByGroupManifestIdAndLocalId(groupManifestStorageId, localId): Promise<IPost>;

  updatePost(id, updateData: any): Promise<IPost>;

  getPostSizeSum(id): Promise<number>;

  setPostContents(postId, contentsIds): Promise<void>;

  getUsersCount(): Promise<number>;

  addUser(user: IUser): Promise<IUser>;

  updateUser(id, updateData: any): Promise<void>;

  getUserByName(name): Promise<IUser>;

  getUserByNameOrEmail(nameOrEmail): Promise<IUser>;

  getUser(id): Promise<IUser>;

  getUserByManifestId(manifestId, staticManifestId): Promise<IUser>;

  addUserFriend(userId, friendId): Promise<void>;

  removeUserFriend(userId, friendId): Promise<void>;

  getUserFriends(userId, search?, limitParams?: IListParams): Promise<IUser[]>;

  getUserFriendsCount(userId, search?): Promise<number>;

  getUserAccount(id): Promise<IUserAccount>;

  getUserAccountByProvider(userId, provider): Promise<IUserAccount>;

  getUserAccountByAddress(provider, address): Promise<IUserAccount>;

  getUserAccountList(userId): Promise<IUserAccount[]>;

  createUserAccount(accountData): Promise<IUserAccount>;

  updateUserAccount(id, updateData): Promise<IUserAccount>;

  getUserAuthMessage(id): Promise<IUserAuthMessage>;

  createUserAuthMessage(authMessageData): Promise<IUserAuthMessage>;

  getGroup(id): Promise<IGroup>;

  getGroupByManifestId(manifestId, staticManifestId): Promise<IGroup>;

  getGroupWhereStaticOutdated(outdatedForHours): Promise<IGroup[]>;

  getRemoteGroups(): Promise<IGroup[]>;

  getPersonalChatGroups(): Promise<IGroup[]>;

  addGroup(group): Promise<IGroup>;

  updateGroup(id, updateData): Promise<void>;

  addMemberToGroup(userId, groupId): Promise<void>;

  removeMemberFromGroup(userId, groupId): Promise<void>;

  setMembersToGroup(userIds, groupId): Promise<void>;

  getGroupSection(sectionId): Promise<IGroupSection>;

  addGroupSection(section): Promise<IGroupSection>;

  updateGroupSection(id, updateData): Promise<void>;

  getGroupSections(filters?, listParams?): Promise<IGroupSection[]>;

  getGroupSectionsCount(filters?): Promise<number>;

  addMemberToCategory(userId, categoryId): Promise<void>;

  removeMemberFromCategory(userId, categoryId): Promise<void>;

  getMemberInGroups(userId, types: GroupType[]): Promise<IGroup[]>;

  addAdminToGroup(userId, groupId): Promise<void>;

  removeAdminFromGroup(userId, groupId): Promise<void>;

  setAdminsToGroup(userIds, groupId): Promise<void>;

  getAdminInGroups(userId, types: GroupType[]): Promise<IGroup[]>;

  getCreatorInGroupsByType(userId, type: GroupType): Promise<IGroup[]>;

  getGroupSizeSum(id): Promise<number>;

  getGroupByParams(params: {name?, staticStorageId?, manifestStorageId?, manifestStaticStorageId?}): Promise<IGroup>;

  getPostByParams(params: {name?, staticStorageId?, manifestStorageId?, manifestStaticStorageId?}): Promise<IPost>;

  getGroupRead(userId, groupId): Promise<IGroupRead>;

  addGroupRead(groupReadData): Promise<IGroupRead>;

  removeGroupRead(userId, groupId): Promise<any>;

  updateGroupRead(id, updateData): Promise<any>;

  getCategory(categoryId): Promise<ICategory>;

  getCategoryByParams(params: {name?, staticStorageId?, manifestStorageId?, manifestStaticStorageId?}): Promise<ICategory>;

  addCategory(category): Promise<ICategory>;

  updateCategory(id, updateData): Promise<void>;

  addAdminToCategory(userId, categoryId): Promise<void>;

  removeAdminFromCategory(userId, categoryId): Promise<void>;

  addGroupToCategory(groupId, categoryId): Promise<void>;

  removeGroupFromCategory(groupId, categoryId): Promise<void>;

  isAdminInCategory(userId, categoryId): Promise<boolean>;

  addCorePermission(userId, permissionName): Promise<void>;

  removeCorePermission(userId, permissionName): Promise<void>;

  getCorePermissions(userId): Promise<ICorePermission[]>;

  isHaveCorePermission(userId, permissionName): Promise<boolean>;

  addGroupPermission(userId, groupId, permissionName): Promise<void>;

  removeGroupPermission(userId, groupId, permissionName): Promise<void>;

  removeAllGroupPermission(userId, groupId): Promise<void>;

  getGroupPermissions(userId, groupId): Promise<ICorePermission[]>;

  isHaveGroupPermission(userId, groupId, permissionName): Promise<boolean>;

  isAdminInGroup(userId, groupId): Promise<boolean>;

  isMemberInGroup(userId, groupId): Promise<boolean>;

  isMemberInCategory(userId, categoryId): Promise<boolean>;

  getGroupPosts(groupId, filters?, listParams?: IListParams): Promise<IPost[]>;

  getGroupPostsCount(groupId, filters?): Promise<number>;

  getCategoryPosts(categoryId, filters?, listParams?: IListParams): Promise<IPost[]>;

  getCategoryPostsCount(categoryId, filters?): Promise<number>;

  getCategoryGroups(categoryId, filters?, listParams?: IListParams): Promise<IGroup[]>;

  getCategoryGroupsCount(categoryId, filters?): Promise<number>;

  getAllPosts(filters?, listParams?: IListParams): Promise<IPost[]>;

  getAllPostsCount(filters?): Promise<number>;

  getPost(postId): Promise<IPost>;

  getFileCatalogItem(itemId): Promise<IFileCatalogItem>;

  getFileCatalogItemByDefaultFolderFor(userId, defaultFolderFor): Promise<IFileCatalogItem>;

  getFileCatalogItems(userId, parentItemId, type?, search?, listParams?: IListParams): Promise<IFileCatalogItem[]>;

  getFileCatalogItemsByContent(userId, contentId, type?, listParams?: IListParams): Promise<IFileCatalogItem[]>;

  getFileCatalogItemsBreadcrumbs(itemId): Promise<IFileCatalogItem[]>;

  getFileCatalogItemsCount(userId, parentItemId, type?, search?): Promise<number>;

  isFileCatalogItemExistWithContent(userId, parentItemId, contentId): Promise<boolean>;

  getContentsIdsByFileCatalogIds(catalogIds): Promise<number[]>;

  addFileCatalogItem(item: IFileCatalogItem): Promise<IFileCatalogItem>;

  updateFileCatalogItem(id, updateData): Promise<void>;

  getFileCatalogItemsSizeSum(parentItemId): Promise<number>;

  getAllUserList(searchString?, listParams?: IListParams): Promise<IUser[]>;

  getAllUserCount(searchString): Promise<number>;

  getAllContentList(searchString, listParams?: IListParams): Promise<IContent[]>;

  getAllContentCount(searchString): Promise<number>;

  getAllGroupList(searchString?, listParams?: IListParams): Promise<IGroup[]>;

  getAllGroupCount(searchString?): Promise<number>;

  addUserContentAction(userContentActionData): Promise<IUserContentAction>;

  getUserContentActionsSizeSum(userId, name, periodTimestamp?): Promise<number>;

  addUserAsyncOperation(userLimitData): Promise<IUserAsyncOperation>;

  updateUserAsyncOperation(id, updateData): Promise<IUserAsyncOperation>;

  getUserAsyncOperation(operationId): Promise<IUserAsyncOperation>;

  addUserLimit(limitData): Promise<IUserLimit>;

  updateUserLimit(limitId, limitData): Promise<void>;

  getUserLimit(userId, name): Promise<IUserLimit>;

  addStaticIdHistoryItem(staticIdHistoryItem: IStaticIdHistoryItem): Promise<IStaticIdHistoryItem>;

  setStaticIdKey(staticId, publicKey, name?, encryptedPrivateKey?): Promise<IStaticIdKey>;

  getStaticIdPublicKey(staticId, name?): Promise<string>;

  getStaticIdByName(name): Promise<string>;

  getStaticIdEncryptedPrivateKey(staticId, name?): Promise<string>;

  destroyStaticId(staticId, name?): Promise<void>;

  getActualStaticIdItem(staticId): Promise<IStaticIdHistoryItem>;

  getStaticIdItemByDynamicId(dynamicId): Promise<IStaticIdHistoryItem>;

  destroyStaticIdHistory(staticId): Promise<void>;

  getValue(key: string): Promise<string>;

  setValue(key: string, content: string): Promise<void>;

  clearValue(key: string): Promise<void>;
}

export interface IListParams {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: string;
}

export interface IUserApiKey {
  id?: number;
  title?: string;
  userId: number;
  valueHash: string;
  expiredOn?: Date;
  isDisabled: boolean;
}

export interface IContent {
  id?: number;
  storageType: ContentStorageType;
  mimeType: ContentMimeType;
  isRemote?: boolean;
  extension?: string;
  view?: ContentView;
  name?: string;
  description?: string;
  size?: number;
  server?: string;
  isPublic?: boolean;
  isPinned?: boolean;
  peersCount?: number;
  userId: number;
  groupId?: number;
  localId?: number;
  largePreviewSize?: number;
  largePreviewStorageId?: string;
  mediumPreviewSize?: number;
  mediumPreviewStorageId?: string;
  smallPreviewSize?: number;
  smallPreviewStorageId?: string;
  previewMimeType?: ContentMimeType;
  previewExtension?: string;
  storageId?: string;
  staticStorageId?: string;
  manifestStorageId?: string;
  manifestStaticStorageId?: string;

  encryptedManifestStorageId?: string;
  propertiesJson?: string;
}

export interface IObject {
  id?: number;

  storageId: string;
  data: string;
}

export enum ContentStorageType {
  IPFS = 'ipfs',
  IPLD = 'ipld'
}

export enum ContentMimeType {
  Unknown = 'unknown',
  Text = 'text',
  TextHtml = 'text/html',
  TextMarkdown = 'text/md',
  ImagePng = 'image/png',
  ImageJpg = 'image/jpg'
}

export enum ContentView {
  Attachment = 'attachment',
  Contents = 'contents'
}

export interface IPost {
  id?: number;
  status: PostStatus;
  publishedAt?;
  publishOn?;
  groupId;
  group?: IGroup;
  userId;
  view?;
  type?;
  contents?: IContent[];
  size?;
  isPinned?: boolean;
  isRemote?: boolean;
  isEncrypted?: boolean;
  isFullyPinned?: boolean;
  isReplyForbidden?: boolean;
  peersCount?: number;
  fullyPeersCount?: number;
  propertiesJson?: string;
  localId?;
  storageId?;
  staticStorageId?;
  manifestStorageId?: string;
  manifestStaticStorageId?: string;

  authorStaticStorageId?: string;
  authorStorageId?: string;

  groupStaticStorageId?: string;
  groupStorageId?: string;

  replyToId?: number;
  repostOfId?: string;

  encryptedManifestStorageId?: string;

  createdAt;
  updatedAt;
}

export enum PostStatus {
  Queue = 'queue',
  Published = 'published',
  Draft = 'draft',
  Deleted = 'deleted'
}

export interface IUser {
  id?: number;
  name: string;
  description?: string;
  email: string;
  passwordHash: string;
  title?: string;
  storageAccountId?: string;
  isRemote?: boolean;
  avatarImageId?: number;
  avatarImage?: IContent;
  manifestStorageId?: string;
  manifestStaticStorageId?: string;

  accounts?: [any];
}

export interface IUserAccount {
  id?: number;
  userId: number;
  title: string;
  provider: string;
  type: string;
  description: string;
  address: string;
  signature: string;

  toJSON?();
}

export interface IUserAuthMessage {
  id: number;
  userAccountId: number;
  provider: string;
  address: string;
  message: string;
}

export interface IGroup {
  id: number;

  name: string;
  title: string;
  type: GroupType;
  view: GroupView;
  theme: string;
  isPublic: boolean;
  isRemote: boolean;
  isOpen: boolean;
  isReplyForbidden: boolean;

  description?: string;
  creatorId: number;
  avatarImageId?: number;
  avatarImage?: IContent;
  coverImageId?: number;
  coverImage?: IContent;
  size?: number;
  isPinned?: boolean;
  isFullyPinned?: boolean;
  isEncrypted?: boolean;
  peersCount?: number;
  fullyPeersCount?: number;
  storageId?: string;
  staticStorageId?: string;
  manifestStorageId?: string;
  manifestStaticStorageId?: string;
  publishedPostsCount?: number;
  availablePostsCount?: number;

  encryptedManifestStorageId?: string;

  membershipOfCategoryId?: number;

  storageUpdatedAt: Date;
  staticStorageUpdatedAt: Date;
}

export interface IGroupSection {
  id: number;

  name: string;
  title: string;

  description?: string;
  creatorId: number;
  categoryId: number;
  avatarImageId?: number;
  avatarImage?: IContent;
  coverImageId?: number;
  coverImage?: IContent;
  isGlobal?: boolean;
  storageId?: string;
  staticStorageId?: string;
  manifestStorageId?: string;
  manifestStaticStorageId?: string;
}

export interface ICategory {
  id: number;

  name: string;
  title: string;

  description?: string;
  creatorId: number;
  avatarImageId?: number;
  avatarImage?: IContent;
  coverImageId?: number;
  coverImage?: IContent;
  isGlobal?: boolean;
  storageId?: string;
  staticStorageId?: string;
  manifestStorageId?: string;
  manifestStaticStorageId?: string;
}

export enum GroupType {
  Channel = 'channel',
  Chat = 'chat',
  PersonalChat = 'personal_chat'
}

export enum GroupView {
  PinterestLike = 'pinterest-like',
  InstagramLike = 'instagram-like',
  TumblrLike = 'tumblr-like',
  TelegramLike = 'telegram-like'
}

export interface IGroupRead {
  id?: number;
  readFrom?;
  readAt?;
  userId: number;
  groupId: number;
  cachedPostsCount: number;
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

export interface IUserContentAction {
  id?: number;
  name: UserContentActionName;
  size: number;
  userId: number;
  userApiKeyId?: number;
  contentId?: number;
}

export enum UserContentActionName {
  Upload = 'upload',
  Pin = 'pin'
}

export interface IUserLimit {
  id?: number;
  name: UserLimitName;
  value: number;
  userId: number;
  adminId: number;
  periodTimestamp: number;
  isActive: boolean;
}

export interface IUserAsyncOperation {
  id?: number;
  name: string;
  channel: string;
  size: number;
  percent: number;
  finishedAt: Date;
  errorType: string;
  errorMessage: string;
  inProcess: boolean;

  userId: number;
  contentId?: number;
  content?: IContent;
}

export interface IStaticIdHistoryItem {
  id?: number;
  staticId: string;
  dynamicId: string;
  periodTimestamp?: number;
  isActive: boolean;
  boundAt: Date;
}

export interface IStaticIdKey {
  id?: number;
  name?: number;
  staticId: string;
  publicKey: string;
  encryptedPrivateKey?: string;
}

export enum UserLimitName {
  SaveContentSize = 'save_content:size'
}

export interface ICorePermission {
  id?: number;
  name: string;
  title?: string;
  isActive: boolean;
  userId: number;
}

export enum CorePermissionName {
  UserAll = 'user:all',
  UserSaveData = 'user:save_data',
  UserApiKeyManagement = 'user:api_key_management',
  UserFileCatalogManagement = 'user:file_catalog_management',
  UserGroupManagement = 'user:group_management',
  UserFriendsManagement = 'user:friends_management',
  UserAccountManagement = 'user:account_management',

  AdminRead = 'admin:read',
  AdminAddUser = 'admin:add_user',
  AdminSetPermissions = 'admin:set_permissions',
  AdminSetUserLimit = 'admin:set_user_limit',
  AdminAddUserApiKey = 'admin:add_user_api_key',
  AdminAddBootNode = 'admin:add_boot_node',
  AdminRemoveBootNode = 'admin:remove_boot_node'
}

export enum GroupPermissionName {
  EditGeneralData = 'group:edit_general'
}
