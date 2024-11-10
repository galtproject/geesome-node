/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import IGeesomeEntityJsonManifestModule from "./modules/entityJsonManifest/interface.js";
import IGeesomeAccountStorageModule from "./modules/accountStorage/interface.js";
import IGeesomeAsyncOperationModule from "./modules/asyncOperation/interface.js";
import IGeesomeCommunicatorModule from "./modules/communicator/interface.js";
import IGeesomeStaticIdModule from "./modules/staticId/interface.js";
import IGeesomeStorageModule from "./modules/storage/interface.js";
import IGeesomeDriversModule from "./modules/drivers/interface.js";
import IGeesomeContentModule from "./modules/content/interface.js";
import IGeesomeInviteModule from "./modules/invite/interface.js";
import IGeesomeGroupModule from "./modules/group/interface.js";
import IGeesomeApiModule from "./modules/api/interface.js";
import {GeesomeEmitter} from "./events.js";
import {
  CorePermissionName,
  IContent,
  IGeesomeDatabaseModule,
  IInvite,IListParams,
  IUser, IUserApiKey,
  IUserLimit, UserLimitName
} from "./modules/database/interface.js";

export interface IGeesomeApp {
  config: any;
  events: GeesomeEmitter;

  frontendStorageId;

  //modules
  ms: {
    api: IGeesomeApiModule;
    content: IGeesomeContentModule,
    asyncOperation: IGeesomeAsyncOperationModule;
    staticId: IGeesomeStaticIdModule;
    invite: IGeesomeInviteModule;
    group: IGeesomeGroupModule;
    accountStorage: IGeesomeAccountStorageModule;
    storage: IGeesomeStorageModule;
    communicator: IGeesomeCommunicatorModule;
    entityJsonManifest: IGeesomeEntityJsonManifestModule;
    database: IGeesomeDatabaseModule;
    drivers: IGeesomeDriversModule;
  };

  checkModules(modulesList: string[]);

  setup(userData: IUserInput): Promise<{user: IUser, apiKey: string}>;

  registerUser(userData: IUserInput): Promise<IUser>;

  loginPassword(usernameOrEmail, password): Promise<IUser>;

  updateUser(userId, updateData): Promise<IUser>;

  checkUserId(userId, targetId, createIfNotExist?): Promise<number>;

  generateUserApiKey(userId, apiKeyData, skipPermissionCheck?): Promise<string>;

  updateApiKey(userId, id, updateData): Promise<void>;

  getApyKeyId(apiKey): Promise<number>;

  getUserApyKeyById(userId, apiKeyId): Promise<IUserApiKey>;

  getUserByApiToken(apiKey): Promise<{user: IUser | null, apiKey: IUserApiKey | null}>;

  getUserApiKeys(userId, isDisabled?, search?, listParams?: IListParams): Promise<IUserApiKeysListResponse>;

  setUserLimit(adminId, limitData: IUserLimit): Promise<IUserLimit>;

  checkUserCan(userId, permission): Promise<void>;

  isUserCan(userId, permission): Promise<boolean>;

  isAdminCan(userId, permission): Promise<boolean>;

  getDataStructure(dataId, isResolve?);

  saveDataStructure(data);

  getAllUserList(adminId, searchString, listParams?: IListParams): Promise<IUserListResponse>;

  getUserLimit(adminId, userId, limitName): Promise<IUserLimit>;

  getUserLimitRemained(userId, limitName: UserLimitName): Promise<number>;

  generateAndSaveManifest(entityName, entityObj): Promise<string>; //returns hash

  encryptTextWithAppPass(text): Promise<string>;

  decryptTextWithAppPass(text): Promise<string>;

  // getPreviewContentData()

  callHook(callFromModule, name, args): Promise<any>;

  //TODO: define interface
  getPeers(topic): Promise<any>;

  getBootNodes(userId, type?): Promise<string[]>;

  addBootNode(userId, address, type?): Promise<any>;

  removeBootNode(userId, address, type?): Promise<any>;

  stop(): Promise<void>;

  flushDatabase(): Promise<void>;
}

export interface IUserInput extends Record<string, any> {
  name: string;
  email?: string;
  password?: string;

  permissions?: CorePermissionName[];

  joinedByInviteId?: number;
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

export interface IUrlContentInput {
  url: string;
  /**
   * Upload driver from geesome-node/drivers/upload. "youtubeVideo" for example. Drivers can handle specific contents.
   */
  driver: string;
  mimeType: string;
}

export interface ManifestToSave {
  manifestStorageId;
  path?;
}

export interface IInvitesListResponse {
  list: IInvite[];
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

export interface IContentListResponse {
  list: IContent[];
  total: number;
}

