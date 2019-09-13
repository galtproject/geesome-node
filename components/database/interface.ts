/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export interface IDatabase {
  getSessionStore(): any;

  flushDatabase(): Promise<void>;

  addApiKey(apiKey): Promise<IUserApiKey>;

  getApiKeyByHash(valueHash: string): Promise<IUserApiKey>;

  getApiKeysByUser(userId: number, isDisabled?: boolean, search?: string, listParams?: IListParams): Promise<IUserApiKey[]>;
  
  getApiKeysCountByUser(userId: number, isDisabled?: boolean, search?: string): Promise<number>;
  
  updateUser(id, updateData: any): Promise<void>;
  
  addContent(content: IContent): Promise<IContent>;

  updateContent(id, updateData: any): Promise<void>;

  deleteContent(id): Promise<void>;

  getContentList(accountAddress, listParams?: IListParams): Promise<IContent[]>;

  getContent(id): Promise<IContent>;

  getContentByStorageId(storageId): Promise<IContent>;

  getContentByManifestId(manifestId): Promise<IContent>;

  addPost(post: IPost): Promise<IPost>;

  getPostByManifestId(manifestStorageId): Promise<IPost>;

  getPostByGroupManifestIdAndLocalId(groupManifestStorageId, localId): Promise<IPost>;

  updatePost(id, updateData: any): Promise<IPost>;

  getPostSizeSum(id): Promise<number>;

  setPostContents(postId, contentsIds): Promise<void>;

  getUsersCount(): Promise<number>;

  addUser(user: IUser): Promise<IUser>;

  getUserByName(name): Promise<IUser>;

  getUserByNameOrEmail(nameOrEmail): Promise<IUser>;

  getUser(id): Promise<IUser>;

  getUserByManifestId(manifestId, staticManifestId): Promise<IUser>;

  addUserFriend(userId, friendId): Promise<void>;

  removeUserFriend(userId, friendId): Promise<void>;

  getUserFriends(userId, search?, limitParams?: IListParams): Promise<IUser[]>;
  
  getUserFriendsCount(userId, search?): Promise<number>;

  getGroup(id): Promise<IGroup>;

  getGroupByManifestId(manifestId, staticManifestId): Promise<IGroup>;

  getGroupWhereStaticOutdated(outdatedForHours): Promise<IGroup[]>;

  getRemoteGroups(): Promise<IGroup[]>;
  
  getPersonalChatGroups(): Promise<IGroup[]>;

  addGroup(group): Promise<IGroup>;

  updateGroup(id, updateData): Promise<void>;

  addMemberToGroup(userId, groupId): Promise<void>;

  removeMemberFromGroup(userId, groupId): Promise<void>;

  getMemberInGroups(userId, types: GroupType[]): Promise<IGroup[]>;

  addAdminToGroup(userId, groupId): Promise<void>;

  removeAdminFromGroup(userId, groupId): Promise<void>;

  getAdminInGroups(userId, types: GroupType[]): Promise<IGroup[]>;

  getCreatorInGroupsByType(userId, type: GroupType): Promise<IGroup[]>;

  getGroupSizeSum(id): Promise<number>;

  addCorePermission(userId, permissionName): Promise<void>;

  removeCorePermission(userId, permissionName): Promise<void>;

  isHaveCorePermission(userId, permissionName): Promise<boolean>;

  isAdminInGroup(userId, groupId): Promise<boolean>;

  isMemberInGroup(userId, groupId): Promise<boolean>;

  getGroupPosts(groupId, listParams?: IListParams): Promise<IPost[]>;

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

  getAllUserList(searchString, listParams?: IListParams): Promise<IUser[]>;

  getAllContentList(searchString, listParams?: IListParams): Promise<IContent[]>;

  getAllGroupList(searchString, listParams?: IListParams): Promise<IGroup[]>;

  addUserContentAction(userContentActionData): Promise<IUserContentAction>;

  getUserContentActionsSizeSum(userId, name, periodTimestamp?): Promise<number>;

  addUserLimit(limitData): Promise<IUserLimit>;

  updateUserLimit(limitId, limitData): Promise<void>;

  getUserLimit(userId, name): Promise<IUserLimit>;

  addStaticIdHistoryItem(staticIdHistoryItem): Promise<IStaticIdHistoryItem>;
  
  setStaticIdPublicKey(staticId, publicKey): Promise<IStaticIdPublicKey>;
  
  getStaticIdPublicKey(staticId): Promise<string>;

  getActualStaticIdItem(staticId): Promise<IStaticIdHistoryItem>;

  getStaticIdItemByDynamicId(dynamicId): Promise<IStaticIdHistoryItem>;

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
  userId;
  view?;
  type?;
  contents?: IContent[];
  size?;
  isPinned?: boolean;
  isRemote?: boolean;
  isEncrypted?: boolean;
  isFullyPinned?: boolean;
  peersCount?: number;
  fullyPeersCount?: number;
  localId?;
  storageId?;
  staticStorageId?;
  manifestStorageId?: string;
  manifestStaticStorageId?: string;
  authorStaticStorageId?: string;

  encryptedManifestStorageId?: string;
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
}

export interface IGroup {
  id?: number;

  name: string;
  title: string;
  type: GroupType;
  view: GroupView;
  theme: string;
  isPublic: boolean;
  isRemote: boolean;

  description?: string;
  creatorId?: number;
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

  encryptedManifestStorageId?: string;

  storageUpdatedAt: Date;
  staticStorageUpdatedAt: Date;
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


export interface IFileCatalogItem {
  id?: number;
  name: string;
  type: IFileCatalogItemType;
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
}

export enum IFileCatalogItemType {
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

export interface IStaticIdHistoryItem {
  id?: number;
  staticId: string;
  dynamicId: string;
  periodTimestamp: number;
  isActive: boolean;
  boundAt: Date;
}

export interface IStaticIdPublicKey {
  id?: number;
  staticId: string;
  publicKey: string;
}

export enum UserLimitName {
  SaveContentSize = 'save_content:size'
}

export enum CorePermissionName {
  AdminRead = 'admin:read',
  AdminAddUser = 'admin:add_user',
  AdminSetPermissions = 'admin:set_permissions',
  AdminSetUserLimit = 'admin:set_user_limit',
  AdminAddUserApiKey = 'admin:add_user_api_key',
  AdminAddBootNode = 'admin:add_boot_node',
  AdminRemoveBootNode = 'admin:remove_boot_node'
}
