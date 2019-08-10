/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

import {
  IContent,
  IDatabase,
  IFileCatalogItem,
  IGroup, IListParams,
  IPost,
  IUser,
  IUserApiKey,
  IUserLimit
} from "../database/interface";
import {IStorage} from "../storage/interface";
import {GeesomeEmitter} from "./v1/events";

export interface IGeesomeApp {
  config: any;
  database: IDatabase;
  storage: IStorage;
  events: GeesomeEmitter;
  authorization: any;

  frontendStorageId;

  getSecretKey(keyName): Promise<string>;

  registerUser(email, name, password): Promise<IUser>;

  loginUser(usernameOrEmail, password): Promise<IUser>;

  updateUser(userId, updateData): Promise<IUser>;

  generateUserApiKey(userId, type?): Promise<string>;

  getUserByApiKey(apiKey): Promise<IUser>;

  getUserApiKeys(userId, isDisabled?, search?, listParams?: IListParams): Promise<IUserApiKeysListResponse>;

  setUserLimit(adminId, limitData: IUserLimit): Promise<IUserLimit>;

  getMemberInGroups(userId): Promise<IGroup[]>;

  getAdminInGroups(userId): Promise<IGroup[]>;

  getPersonalChatGroups(userId): Promise<IGroup[]>;

  addUserFriendById(userId, friendId): Promise<void>;

  removeUserFriendById(userId, friendId): Promise<void>;

  getUserFriends(userId, search?, listParams?: IListParams): Promise<IUserListResponse>;

  canCreatePostInGroup(userId, groupId);

  canEditGroup(userId, groupId);

  isAdminInGroup(userId, groupId): Promise<boolean>;

  isMemberInGroup(userId, groupId): Promise<boolean>;

  addMemberToGroup(userId, groupId): Promise<void>;

  removeMemberFromGroup(userId, groupId): Promise<void>;

  addAdminToGroup(userId, groupId): Promise<void>;

  removeAdminFromGroup(userId, groupId): Promise<void>;

  createPost(userId, postData);

  updatePost(userId, postId, postData);

  createGroup(userId, groupData): Promise<IGroup>;

  updateGroup(userId, id, updateData): Promise<IGroup>;

  getGroup(groupId): Promise<IGroup>;

  getGroupPosts(groupId, listParams?: IListParams): Promise<IPost[]>;

  saveData(fileStream, fileName, options);

  saveDataByUrl(url, options);

  getFileStream(filePath);

  checkStorageId(storageId): string;

  getDataStructure(dataId);

  getDataStructure(dataId);

  getFileCatalogItems(userId, parentItemId, type?, search?, listParams?: IListParams): Promise<IFileCatalogListResponse>;

  getFileCatalogItemsBreadcrumbs(userId, itemId): Promise<IFileCatalogItem[]>;

  getFileCatalogItemsBreadcrumbs(userId, itemId): Promise<IFileCatalogItem[]>;

  getContentsIdsByFileCatalogIds(catalogIds): Promise<number[]>;

  createUserFolder(userId, parentItemId, folderName): Promise<IFileCatalogItem>;

  addContentToFolder(userId, contentId, folderId): Promise<any>;

  updateFileCatalogItem(userId, fileCatalogId, updateData): Promise<IFileCatalogItem>;

  getAllUserList(adminId, searchString, listParams?: IListParams): Promise<IUser[]>;

  getAllContentList(adminId, searchString, listParams?: IListParams): Promise<IContent[]>;

  getAllGroupList(adminId, searchString, listParams?: IListParams): Promise<IGroup[]>;

  getUserLimit(adminId, userId, limitName): Promise<IUserLimit>;

  getContent(contentId): Promise<IContent>;

  //TODO: define interface
  getPeers(topic): Promise<any>;

  //TODO: define interface
  getIpnsPeers(ipns): Promise<any>;

  //TODO: define interface
  getGroupPeers(groupId): Promise<any>;

  resolveStaticId(staticId): Promise<string>;
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
