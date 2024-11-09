/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export interface IGeesomeDatabaseModule {
  sequelize: any;
  models: any;
  config: any;

  getDriver():  Promise<any>;

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

  getUserContentListByIds(userId, contentIds): Promise<IContent[]>;

  getContent(id): Promise<IContent>;

  getContentByStorageId(storageId, findByPreviews?): Promise<IContent>;

  getContentByStorageAndUserId(storageId, userId): Promise<IContent>;

  getContentByManifestId(manifestId): Promise<IContent>;

  getObjectByStorageId(storageId, resolveProp?): Promise<IObject>;

  addObject(objectData): Promise<IObject>;

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

  addCorePermission(userId, permissionName): Promise<void>;

  removeCorePermission(userId, permissionName): Promise<void>;

  setCorePermissions(userId, permissionNames: string[]): Promise<void>;

  getCorePermissions(userId): Promise<ICorePermission[]>;

  isHaveCorePermission(userId, permissionName): Promise<boolean>;

  getAllUserList(searchString?, listParams?: IListParams): Promise<IUser[]>;

  getAllUserCount(searchString): Promise<number>;

  getAllContentList(searchString, listParams?: IListParams): Promise<IContent[]>;

  getAllContentCount(searchString): Promise<number>;

  addUserContentAction(userContentActionData): Promise<IUserContentAction>;

  getUserContentActionsSizeSum(userId, name, periodTimestamp?): Promise<number>;

  addUserLimit(limitData): Promise<IUserLimit>;

  updateUserLimit(limitId, limitData): Promise<void>;

  getUserLimit(userId, name): Promise<IUserLimit>;

  getValue(key: string): Promise<string>;

  setValue(key: string, content: string): Promise<void>;

  clearValue(key: string): Promise<void>;

  setDefaultListParamsValues(listParams: IListParams, defaultParams?: IListParams);
}

export interface IInvite {
  id?: number;
  title?: string;
  code?: string;
  limits?: string;
  permissions?: string;
  groupsToJoin?: string;
  maxCount?: number;
  isActive?: boolean;
  createdById?: number;
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
  postsContents?: {position?, view?};

  encryptedManifestStorageId?: string;
  propertiesJson?: string;
  toJSON?(): string;
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
  Directory = 'directory',
  Text = 'text',
  TextHtml = 'text/html',
  TextMarkdown = 'text/md',
  ImagePng = 'image/png',
  ImageJpg = 'image/jpg'
}

export enum ContentView {
  Attachment = 'attachment',
  Media = 'media',
  Contents = 'contents',
  Link = 'link'
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

  joinedByInviteId?: number;

  addFriends?(users: IUser[]);
  removeFriends?(users: IUser[]);
  getFriends?(options): IUser[];
  countFriends?(options?): number;
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
  UserFileCatalogManagement = 'user:fileCatalog:all',
  UserGroupManagement = 'user:group:all',
  UserFriendsManagement = 'user:friends_management',
  UserAccountManagement = 'user:account_management',

  AdminAll = 'admin:all',
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
