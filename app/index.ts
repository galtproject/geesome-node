/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import fs from "fs";
import _ from 'lodash';
import debug from 'debug';
import pIteration from 'p-iteration';
import uuidAPIKey from "uuid-apikey";
import commonHelper from "geesome-libs/src/common.js";
import ipfsHelper from "geesome-libs/src/ipfsHelper.js";
import IGeesomeEntityJsonManifestModule from "./modules/entityJsonManifest/interface.js";
import IGeesomeAsyncOperationModule from "./modules/asyncOperation/interface.js";
import IGeesomeAccountStorageModule from "./modules/accountStorage/interface.js";
import IGeesomeCommunicatorModule from "./modules/communicator/interface.js";
import IGeesomeStaticIdModule from "./modules/staticId/interface.js";
import IGeesomeStorageModule from "./modules/storage/interface.js";
import IGeesomeDriversModule from "./modules/drivers/interface.js";
import IGeesomeContentModule from "./modules/content/interface.js";
import IGeesomeInviteModule from "./modules/invite/interface.js";
import IGeesomeGroupModule from "./modules/group/interface.js";
import IGeesomeApiModule from "./modules/api/interface.js";
import {IGeesomeApp, IUserInput} from "./interface.js";
import {GeesomeEmitter} from "./events.js";
import {
  CorePermissionName,
  IGeesomeDatabaseModule,
  IListParams,
  IUser,
  IUserLimit,
  UserContentActionName,
  UserLimitName
} from "./modules/database/interface.js";
import appEvents from './events.js';
import helpers from './helpers.js';
import config from './config.js';
const {pick, merge, isUndefined, startsWith, reverse, clone, extend, isString} = _;
const log = debug('geesome:app');

export default async (extendConfig) => {
  const resConfig = merge(config, extendConfig || {});
  const app = getModule(resConfig, await helpers.getSecretKey('app-pass', 'words'));

  if (!app.config.storageConfig.jsNode.pass) {
    app.config.storageConfig.jsNode.pass = await helpers.getSecretKey('accounts-pass', 'words');
  }
  if (!app.config.storageConfig.jsNode.salt) {
    app.config.storageConfig.jsNode.salt = await helpers.getSecretKey('accounts-salt', 'hash');
  }

  app.events = appEvents(app);

  // await appCron(app);
  // await appListener(app);

  log('Init modules...');
  app.ms = {} as any;
  await pIteration.forEachSeries(resConfig.modules, async (moduleName: string) => {
    log(`Start ${moduleName} module...`);
    try {
      app.ms[moduleName] = await (await import(`./modules/${moduleName}/index.js`)).default(app);
    } catch (e) {
      console.error(moduleName + ' module initialization error', e);
    }
  });

  const frontendPath = helpers.getCurDir() + '/../node_modules/@geesome/ui';
  if (fs.existsSync(frontendPath)) {
    const directory = await app.ms.storage.saveDirectory(frontendPath);
    app.frontendStorageId = directory.id;
  }

  return app;
};

function getModule(config, appPass) {
  class GeesomeApp implements IGeesomeApp {
    events: GeesomeEmitter;

    frontendStorageId;

    ms: {
      database: IGeesomeDatabaseModule,
      content: IGeesomeContentModule,
      drivers: IGeesomeDriversModule,
      api: IGeesomeApiModule,
      asyncOperation: IGeesomeAsyncOperationModule,
      staticId: IGeesomeStaticIdModule,
      invite: IGeesomeInviteModule,
      group: IGeesomeGroupModule,
      accountStorage: IGeesomeAccountStorageModule,
      communicator: IGeesomeCommunicatorModule,
      storage: IGeesomeStorageModule,
      entityJsonManifest: IGeesomeEntityJsonManifestModule
    };

    msSupportHookList = {};

    constructor(
        public config
    ) {
    }

    checkModules(modulesList: string[]) {
      modulesList.forEach(module => {
        if (!this.ms[module]) {
          throw Error("module_not_defined:" + module);
        }
      });
    }

    /**
     ===========================================
     USERS ACTIONS
     ===========================================
     **/

    async setup(userData) {
      if ((await this.ms.database.getUsersCount()) > 0) {
        throw new Error('already_setup');
      }
      const adminUser = await this.registerUser(userData);
      await this.ms.accountStorage.getOrCreateAccountStaticId('self', adminUser.id);

      await pIteration.forEach(['AdminAll', 'UserAll'], (permissionName) => {
        return this.ms.database.addCorePermission(adminUser.id, CorePermissionName[permissionName])
      });

      //TODO: do in asyncOperation
      this.setupModules().then(r => {
        return this.ms.staticId.bindToStaticId(adminUser.id, adminUser.manifestStorageId, adminUser.manifestStaticStorageId);
      })
      return {user: adminUser, apiKey: await this.generateUserApiKey(adminUser.id, {type: "password_auth"})};
    }

    async checkNameAndEmail(userId, name, email) {
      userId = parseInt(userId);
      const user = await this.ms.database.getUser(userId);
      if (user && user.name ? false : !name) {
        throw new Error("name_cant_be_null");
      }
      if (email && !helpers.validateEmail(email)) {
        throw new Error("email_invalid");
      }
      if (name && !helpers.validateUsername(name)) {
        throw new Error("forbidden_symbols_in_name");
      } else if (name) {
        const existUserWithName = await this.ms.database.getUserByName(name);
        if (existUserWithName && existUserWithName.id !== userId) {
          throw new Error("username_already_exists");
        }
      }
    }

    async registerUser(userData: IUserInput): Promise<any> {
      const {email, name, password} = userData;

      await this.checkNameAndEmail(null, name, email);

      const passwordHash: any = await helpers.hashPassword(password);

      let newUser = await this.ms.database.addUser({
        passwordHash,
        name,
        email,
      });

      const storageAccountId = await this.ms.staticId.createStaticAccountId(newUser.id, name);

      newUser = await this.ms.database.updateUser(newUser.id, {
        storageAccountId,
        manifestStaticStorageId: storageAccountId
      }).then(() => this.ms.database.getUser(newUser.id));

      await this.callHook('core', 'afterUserRegistering', [newUser.id, userData]);

      const manifestStorageId = await this.generateAndSaveManifest('user', newUser);
      await this.ms.staticId.bindToStaticId(newUser.id, manifestStorageId, newUser.manifestStaticStorageId);
      await this.ms.database.updateUser(newUser.id, {
        storageAccountId,
        manifestStaticStorageId: storageAccountId,
        manifestStorageId
      });

      if (userData.permissions && userData.permissions.length) {
        await this.ms.database.setCorePermissions(newUser.id, userData.permissions);
      }
      return this.ms.database.getUser(newUser.id);
    }

    async loginPassword(usernameOrEmail, password): Promise<any> {
      return this.ms.database.getUserByNameOrEmail(usernameOrEmail).then((user) => {
        if (!user) {
          return null;
        }
        return helpers.comparePasswordWithHash(password, user.passwordHash).then(success => success ? user : null);
      });
    }

    async updateUser(userId, updateData) {
      //TODO: check apiKey UserAccountManagement permission to updateUser
      const {password, email, name} = updateData;
      await this.checkNameAndEmail(userId, name, email);

      let user = await this.ms.database.getUser(userId);
      let passwordHash: any = user.passwordHash;
      if (password) {
        passwordHash = await helpers.hashPassword(password);
      }
      const userData = { passwordHash };
      if (name) {
        userData['name'] = name;
      }
      if (email) {
        userData['email'] = email;
      }
      await this.ms.database.updateUser(userId, userData);

      user = await this.ms.database.getUser(userId);
      if (!user.storageAccountId) {
        const storageAccountId = await this.ms.staticId.createStaticAccountId(userId, user.name);
        await this.ms.database.updateUser(userId, {storageAccountId, manifestStaticStorageId: storageAccountId});
        user = await this.ms.database.getUser(userId);
      }

      const manifestStorageId = await this.generateAndSaveManifest('user', user);
      if (manifestStorageId != user.manifestStorageId) {
        await this.ms.staticId.bindToStaticId(userId, manifestStorageId, user.manifestStaticStorageId);
        await this.ms.database.updateUser(userId, {manifestStorageId});
      }

      return this.ms.database.getUser(userId);
    }

    async checkUserId(userId, targetId, createIfNotExist = true) {
      if (targetId == 'null' || targetId == 'undefined') {
        return null;
      }
      if (!targetId || isUndefined(targetId)) {
        return null;
      }
      if (!commonHelper.isNumber(targetId)) {
        let user = await this.getUserByManifestId(targetId, targetId);
        if (!user && createIfNotExist) {
          user = await this.createUserByRemoteStorageId(userId, targetId);
          return user.id;
        } else if (user) {
          targetId = user.id;
        }
      }
      return targetId;
    }

    async getUserByManifestId(userId, staticId) {
      if (!staticId) {
        const historyItem = await this.ms.staticId.getStaticIdItemByDynamicId(userId);
        if (historyItem) {
          staticId = historyItem.staticId;
        }
      }
      return this.ms.database.getUserByManifestId(userId, staticId);
    }

    async createUserByRemoteStorageId(userId, manifestStorageId) {
      let staticStorageId;
      if (ipfsHelper.isAccountCidHash(manifestStorageId)) {
        staticStorageId = manifestStorageId;
        log('createUserByRemoteStorageId::resolveStaticId', staticStorageId);
        manifestStorageId = await this.ms.staticId.resolveStaticId(staticStorageId);
      }

      let dbUser = await this.getUserByManifestId(manifestStorageId, staticStorageId);
      if (dbUser) {
        //TODO: update user if necessary
        return dbUser;
      }
      log('createUserByRemoteStorageId::manifestIdToDbObject', staticStorageId);
      const userObject: IUser = await this.ms.entityJsonManifest.manifestIdToDbObject(staticStorageId || manifestStorageId, 'user');
      log('createUserByRemoteStorageId::userObject', userObject);
      userObject.isRemote = true;
      return this.createUserByObject(userId, userObject);
    }

    async createUserByObject(userId, userObject) {
      let dbAvatar = await this.ms.database.getContentByManifestId(userObject.avatarImage.manifestStorageId);
      if (!dbAvatar) {
        dbAvatar = await this.ms.content.createContentByObject(userId, userObject.avatarImage);
      }
      const userFields = ['manifestStaticStorageId', 'manifestStorageId', 'name', 'title', 'email', 'isRemote', 'description'];
      const dbUser = await this.ms.database.addUser(extend(pick(userObject, userFields), {
        avatarImageId: dbAvatar ? dbAvatar.id : null
      }) as any);

      if (dbUser.isRemote) {
        this.events.emit(this.events.NewRemoteUser, dbUser);
      }
      return dbUser;
    }

    async generateUserApiKey(userId, data, skipPermissionCheck = false) {
      if (!skipPermissionCheck) {
        await this.checkUserCan(userId, CorePermissionName.UserApiKeyManagement);
      }
      const generated = uuidAPIKey['create']();

      data.userId = userId;
      data.valueHash = generated.uuid;

      if (!data.permissions) {
        data.permissions = JSON.stringify(await this.ms.database.getCorePermissions(userId).then(list => list.map(i => i.name)));
      }

      await this.ms.database.addApiKey(data);

      return generated.apiKey;
    }

    async getUserByApiToken(token) {
      if (!token || token === 'null') {
        return {user: null, apiKey: null};
      }
      const valueHash = uuidAPIKey['toUUID'](token);
      const keyObj = await this.ms.database.getApiKeyByHash(valueHash);
      if (!keyObj) {
        return {user: null, apiKey: null};
      }
      return {
        user: await this.ms.database.getUser(keyObj.userId),
        apiKey: keyObj,
      };
    }

    async getUserApyKeyById(userId, apiKeyId) {
      const keyObj = await this.ms.database.getApiKey(apiKeyId);
      if (keyObj.userId !== userId) {
        throw new Error("not_permitted");
      }
      return keyObj;
    }

    async getUserApiKeys(userId, isDisabled?, search?, listParams?: IListParams) {
      listParams = helpers.prepareListParams(listParams);
      await this.checkUserCan(userId, CorePermissionName.UserApiKeyManagement);
      return {
        list: await this.ms.database.getApiKeysByUser(userId, isDisabled, search, listParams),
        total: await this.ms.database.getApiKeysCountByUser(userId, isDisabled, search)
      };
    }

    async updateApiKey(userId, apiKeyId, updateData) {
      await this.checkUserCan(userId, CorePermissionName.UserApiKeyManagement);
      const keyObj = await this.ms.database.getApiKey(apiKeyId);

      if (keyObj.userId !== userId) {
        throw new Error("not_permitted");
      }

      delete updateData.id;

      return this.ms.database.updateApiKey(keyObj.id, updateData);
    }

    public async setUserLimit(adminId, limitData: IUserLimit) {
      limitData.adminId = adminId;
      await this.checkUserCan(adminId, CorePermissionName.AdminSetUserLimit);

      const existLimit = await this.ms.database.getUserLimit(limitData.userId, limitData.name);
      if (existLimit) {
        await this.ms.database.updateUserLimit(existLimit.id, limitData);
        return this.ms.database.getUserLimit(limitData.userId, limitData.name);
      } else {
        return this.ms.database.addUserLimit(limitData);
      }
    }

    /**
     ===========================================
     CONTENT ACTIONS
     ===========================================
     **/

    async getApyKeyId(apiKey) {
      const apiKeyDb = await this.ms.database.getApiKeyByHash(uuidAPIKey['toUUID'](apiKey));
      if(!apiKeyDb) {
        throw new Error("not_authorized");
      }
      return apiKeyDb.id;
    }

    async getUserLimitRemained(userId, limitName: UserLimitName) {
      const limit = await this.ms.database.getUserLimit(userId, limitName);
      if (!limit || !limit.isActive) {
        return null;
      }
      if (limitName === UserLimitName.SaveContentSize) {
        const uploadSize = await this.ms.database.getUserContentActionsSizeSum(userId, UserContentActionName.Upload, limit.periodTimestamp);
        const pinSize = await this.ms.database.getUserContentActionsSizeSum(userId, UserContentActionName.Pin, limit.periodTimestamp);
        console.log('uploadSize', uploadSize, 'pinSize', pinSize, 'limit.value', limit.value );
        return limit.value - uploadSize - pinSize;
      } else {
        throw new Error("Unknown limit");
      }
    }

    async callHook(callFromModule, name, args) {
      const supportHookListExist = !!this.msSupportHookList[name];
      const modulesList = this.msSupportHookList[name] || this.config.modules;
      if (!supportHookListExist) {
        this.msSupportHookList[name] = [];
      }
      return pIteration.mapSeries(modulesList, (moduleName: string) => {
        if (!this.ms[moduleName] || !this.ms[moduleName][name]) {
          return;
        }
        if (!supportHookListExist) {
          this.msSupportHookList[name].push(moduleName);
        }
        if (moduleName === callFromModule) {
          return;
        }
        log(`Call hook ${name} on ${moduleName} module...`);
        return this.ms[moduleName][name].apply(this.ms[moduleName], args);
      }).then(responses => responses.filter(r => !isUndefined(r)));
    }


    async callHookCheckAllowed(callFromModule, name, args) {
      return this.callHook(callFromModule, name, args).then(responseList => {
        console.log('responseList', responseList);
        return responseList.some(a => !!a);
      })
    }

    /**
     ===========================================
     ETC ACTIONS
     ===========================================
     **/

    async generateAndSaveManifest(entityName, entityObj) {
      const manifestContent = await this.ms.entityJsonManifest.generateManifest(entityName, entityObj);
      const hash = await this.saveDataStructure(manifestContent, {waitForStorage: true});
      // console.log(entityName, hash, JSON.stringify(manifestContent.posts ? {...manifestContent, posts: ['hidden']} : manifestContent, null, ' '));
      return hash;
    }

    async getDataStructure(storageId, isResolve = true) {
      const dataPathSplit = storageId.split('/');
      console.log('ipfsHelper.isAccountCidHash', dataPathSplit[0], ipfsHelper.isAccountCidHash(dataPathSplit[0]));
      if (ipfsHelper.isAccountCidHash(dataPathSplit[0])) {
        try {
          const dynamicIdByStaticId = await this.ms.staticId.resolveStaticId(dataPathSplit[0]);
          if (dynamicIdByStaticId) {
            dataPathSplit[0] = dynamicIdByStaticId;
            storageId = dataPathSplit.join('/');
          }
        } catch (e) {}
      }

      const isPath = dataPathSplit.length > 1;
      const resolveProp = isPath ? isResolve : false;

      const dbObject = await this.ms.database.getObjectByStorageId(storageId, resolveProp);
      if (dbObject) {
        const { data } = dbObject;
        return startsWith(data, '{') || startsWith(data, '[') ? JSON.parse(data) : data;
      }
      return this.ms.storage.getObject(storageId, resolveProp).then((result) => {
        this.ms.database.addObject({storageId, data: isString(result) ? result : JSON.stringify(result)}).catch(() => {/* already saved */});
        return result;
      }).catch(e => {
        console.error('getObject error', e)
      });
    }

    async saveDataStructure(data, options: any = {}) {
      const storageId = await ipfsHelper.getIpldHashFromObject(data);

      await this.ms.database.addObject({ data: JSON.stringify(data), storageId }).catch(() => {/* already saved */});

      const storagePromise = this.ms.storage.saveObject(data, pick(options, ['waitForPin']));
      if(options.waitForStorage) {
        await storagePromise;
      }

      return storageId;
    }

    async getAllUserList(adminId, searchString?, listParams?: IListParams) {
      listParams = helpers.prepareListParams(listParams);
      await this.checkUserCan(adminId, CorePermissionName.AdminRead);
      return {
        list: await this.ms.database.getAllUserList(searchString, listParams),
        total: await this.ms.database.getAllUserCount(searchString)
      }
    }

    async getUserLimit(adminId, userId, limitName) {
      await this.checkUserCan(adminId, CorePermissionName.AdminRead);
      return this.ms.database.getUserLimit(userId, limitName);
    }

    async isUserCan(userId, permission) {
      const userCanAll = await this.ms.database.isHaveCorePermission(userId, CorePermissionName.UserAll);
      if (userCanAll) {
        return true;
      }
      return this.ms.database.isHaveCorePermission(userId, permission);
    }

    async isAdminCan(userId, permission) {
      const adminCanAll = await this.ms.database.isHaveCorePermission(userId, CorePermissionName.AdminAll);
      if (adminCanAll) {
        return true;
      }
      return this.ms.database.isHaveCorePermission(userId, permission);
    }

    async checkUserCan(userId, permission) {
      log('checkUserCan start', userId, permission);
      if (startsWith(permission, 'admin:')) {
        if (await this.isAdminCan(userId, permission).then(can => !can)) {
          throw new Error("not_permitted");
        }
      } else if (await this.isUserCan(userId, permission).then(can => !can)) {
        throw new Error("not_permitted");
      }
      log('checkUserCan finish', userId, permission);
    }

    async encryptTextWithAppPass(text) {
      return helpers.encryptText(text, appPass);
    }

    async decryptTextWithAppPass(text) {
      return helpers.decryptText(text, appPass);
    }

    async getPeers(topic) {
      const peers = await this.ms.communicator.getPeers(topic);
      return {
        count: peers.length,
        list: peers
      }
    }

    async getBootNodes(userId, type = 'ipfs') {
      await this.checkUserCan(userId, CorePermissionName.AdminRead);
      if (type === 'ipfs') {
        return this.ms.storage.getBootNodeList();
      } else {
        return this.ms.communicator.getBootNodeList();
      }
    }

    async addBootNode(userId, address, type = 'ipfs') {
      await this.checkUserCan(userId, CorePermissionName.AdminAddBootNode);
      if (type === 'ipfs') {
        return this.ms.storage.addBootNode(address).catch(e => console.error('storage.addBootNode', e));
      } else {
        return this.ms.communicator.addBootNode(address).catch(e => console.error('communicator.addBootNode', e));
      }
    }

    async removeBootNode(userId, address, type = 'ipfs') {
      await this.checkUserCan(userId, CorePermissionName.AdminRemoveBootNode);
      if (type === 'ipfs') {
        return this.ms.storage.removeBootNode(address).catch(e => console.error('storage.removeBootNode', e));
      } else {
        return this.ms.communicator.removeBootNode(address).catch(e => console.error('communicator.removeBootNode', e));
      }
    }

    async stop() {
      await pIteration.forEachSeries(this.config.modules, async (moduleName: string) => {
        if (this.ms[moduleName] && this.ms[moduleName].stop) {
          log(`Stop ${moduleName} module...`);
          try {
            await this.ms[moduleName].stop();
          } catch (e) {
            console.warn("Warning! Module didnt stop:", e);
          }
        }
      });
    }

    async flushDatabase() {
      await pIteration.forEachSeries(reverse(clone(this.config.modules)), (moduleName: string) => {
        if (this.ms[moduleName] && this.ms[moduleName].flushDatabase) {
          log(`Flush Database ${moduleName} module...`);
          return this.ms[moduleName].flushDatabase();
        }
      });
    }

    async setupModules() {
      await pIteration.forEachSeries(this.config.modules, (moduleName: string) => {
        if (this.ms[moduleName] && this.ms[moduleName].setup) {
          log(`Setup ${moduleName} module...`);
          return this.ms[moduleName].setup();
        }
      });
    }
  }

  return new GeesomeApp(config);
}
