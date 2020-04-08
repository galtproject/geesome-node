/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {
  ContentMimeType,
  ContentStorageType,
  ContentView,
  CorePermissionName,
  FileCatalogItemType,
  GroupType,
  GroupView,
  IContent,
  IDatabase,
  IFileCatalogItem,
  IGroup,
  IListParams,
  IPost,
  IUser,
  IUserLimit,
  PostStatus,
  UserContentActionName,
  UserLimitName
} from "../../database/interface";
import {IGeesomeApp, IUserAccountInput, IUserInput, ManifestToSave} from "../interface";
import {IStorage} from "../../storage/interface";
import {IRender} from "../../render/interface";
import {DriverInput, OutputSize} from "../../drivers/interface";
import {GeesomeEmitter} from "./events";
import AbstractDriver from "../../drivers/abstractDriver";

const commonHelper = require('geesome-libs/src/common');
const ipfsHelper = require('geesome-libs/src/ipfsHelper');
const pgpHelper = require('geesome-libs/src/pgpHelper');
const detecterHelper = require('geesome-libs/src/detecter');
const {getPersonalChatTopic} = require('geesome-libs/src/name');
const bs58 = require('bs58');
let config = require('./config');
// const appCron = require('./cron');
const appEvents = require('./events');
// const appListener = require('./listener');
const ethereumAuthorization = require('../../authorization/ethereum');
const _ = require('lodash');
const fs = require('fs');
const xkcdPassword = require('xkcd-password')();
const uuidAPIKey = require('uuid-apikey');
const bcrypt = require('bcrypt');
const mime = require('mime');
const axios = require('axios');
const path = require('path');
const pIteration = require('p-iteration');
const Transform = require('stream').Transform;
const Readable = require('stream').Readable;
const uuidv4 = require('uuid/v4');
const log = require('../../log');
const saltRounds = 10;

module.exports = async (extendConfig) => {
  config = _.merge(config, extendConfig || {});
  console.log('config', config);
  const app = new GeesomeApp(config);

  app.config.storageConfig.jsNode.pass = await app.getSecretKey('js-ipfs');

  console.log('Start storage...');
  app.storage = await require('../../storage/' + config.storageModule)(app);

  // setInterval(() => {
  //   console.log('publishEvent', 'geesome-test');
  //   app.storage.publishEvent('geesome-test', {
  //     lala: 'lolo'
  //   });
  // }, 1000);

  const frontendPath = __dirname + '/../../../frontend/dist';
  if (fs.existsSync(frontendPath)) {
    const directory = await app.storage.saveDirectory(frontendPath);
    app.frontendStorageId = directory.id;
  }

  console.log('Start database...');
  app.database = await require('../../database/' + config.databaseModule)(app);

  app.render = await require('../../render/' + config.renderModule)(app);

  app.drivers = require('../../drivers');

  // if ((await app.database.getUsersCount()) === 0) {
  //   console.log('Run seeds...');
  //   await app.runSeeds();
  // }

  app.authorization = await require('../../authorization/' + config.authorizationModule)(app);

  app.events = appEvents(app);

  // await appCron(app);
  // await appListener(app);

  console.log('Start api...');
  app.api = await require('../../api/' + config.apiModule)(app, process.env.PORT || extendConfig.port || 7711);

  return app;
};

class GeesomeApp implements IGeesomeApp {
  api: any;
  database: IDatabase;
  storage: IStorage;
  render: IRender;
  authorization: any;
  drivers: any;
  events: GeesomeEmitter;

  frontendStorageId;

  constructor(
    public config
  ) {
  }

  async getSecretKey(keyName) {
    const keyPath = `${__dirname}/${keyName}.key`;
    let secretKey;
    try {
      secretKey = fs.readFileSync(keyPath).toString();
      if (secretKey) {
        return secretKey;
      }
    } catch (e) {

    }
    secretKey = (await xkcdPassword.generate({numWords: 8, minLength: 5, maxLength: 8})).join(' ');
    await new Promise((resolve, reject) => {
      fs.writeFile(keyPath, secretKey, resolve);
    });

    return secretKey;
  }

  /**
   ===========================================
   USERS ACTIONS
   ===========================================
   **/

  async setup(userData) {
    if ((await this.database.getUsersCount()) > 0) {
      throw 'already_setup';
    }
    const adminUser = await this.registerUser(userData);

    await pIteration.forEach(['AdminRead', 'AdminAddUser', 'AdminSetUserLimit', 'AdminAddUserApiKey', 'AdminSetPermissions', 'AdminAddBootNode', 'AdminRemoveBootNode', 'UserAll'], (permissionName) => {
      return this.database.addCorePermission(adminUser.id, CorePermissionName[permissionName])
    });

    return {user: adminUser, apiKey: await this.generateUserApiKey(adminUser.id, {type: "password_auth"})};
  }

  async registerUser(userData: IUserInput): Promise<any> {
    const {email, name, password} = userData;

    const existUserWithName = await this.database.getUserByName(name);
    if (existUserWithName) {
      throw new Error("username_already_exists");
    }

    if (!name) {
      throw new Error("name_cant_be_null");
    }

    if (_.includes(name, '@')) {
      throw new Error("forbidden_symbols_in_name");
    }

    const storageAccountId = await this.createStorageAccount(name);

    const passwordHash: any = await new Promise((resolve, reject) => {
      if (!password) {
        return resolve(null);
      }
      bcrypt.hash(password, saltRounds, async (err, passwordHash) => {
        err ? reject(err) : resolve(passwordHash);
      });
    });

    const newUser = await this.database.addUser({
      storageAccountId,
      manifestStaticStorageId: storageAccountId,
      passwordHash,
      name,
      email
    });

    const manifestStorageId = await this.generateAndSaveManifest('user', newUser);

    await this.bindToStaticId(manifestStorageId, newUser.manifestStaticStorageId);

    await this.database.updateUser(newUser.id, {
      manifestStorageId
    });

    if (userData.accounts && userData.accounts.length) {
      await pIteration.forEach(userData.accounts, (userAccount) => {
        return this.setUserAccount(newUser.id, userAccount);
      });
    }

    if (userData.permissions && userData.permissions.length) {
      await pIteration.forEach(userData.permissions, (permissionName) => {
        return this.database.addCorePermission(newUser.id, permissionName)
      });
    }

    return this.database.getUser(newUser.id);
  }

  async loginPassword(usernameOrEmail, password): Promise<any> {
    return new Promise((resolve, reject) => {
      this.database.getUserByNameOrEmail(usernameOrEmail).then((user) => {
        if (!user) {
          return resolve(null);
        }
        bcrypt.compare(password, user.passwordHash, async function (err, result) {
          resolve(result ? user : null);
        });
      }).catch(reject)
    });
  }

  async generateUserAccountAuthMessage(accountProvider, accountAddress) {
    const userAccount = await this.database.getUserAccountByAddress(accountProvider, accountAddress);
    if (!userAccount) {
      throw new Error("not_found");
    }

    const authMessage = await this.database.createUserAuthMessage({
      provider: accountProvider,
      address: accountAddress,
      userAccountId: userAccount.id,
      message: uuidv4()
    });

    delete authMessage.userAccountId;

    return authMessage;
  }

  async loginAuthMessage(authMessageId, address, signature, params: any = {}) {
    if (!address) {
      throw new Error("not_valid");
    }

    const authMessage = await this.database.getUserAuthMessage(authMessageId);
    if (!authMessage || authMessage.address.toLowerCase() != address.toLowerCase()) {
      throw new Error("not_valid");
    }

    const userAccount = await this.database.getUserAccount(authMessage.userAccountId);
    if (!userAccount || userAccount.address.toLowerCase() != address.toLowerCase()) {
      throw new Error("not_valid");
    }

    const isValid = ethereumAuthorization.isSignatureValid(address, signature, authMessage.message, params.fieldName);
    if (!isValid) {
      throw new Error("not_valid");
    }

    return await this.database.getUser(userAccount.userId);
  }

  async updateUser(userId, updateData) {
    await this.database.updateUser(userId, updateData);

    let user = await this.database.getUser(userId);

    if (!user.storageAccountId) {
      const storageAccountId = await this.createStorageAccount(user.name);
      await this.database.updateUser(userId, {storageAccountId, manifestStaticStorageId: storageAccountId});
      user = await this.database.getUser(userId);
    }

    const manifestStorageId = await this.generateAndSaveManifest('user', user);

    if (manifestStorageId != user.manifestStorageId) {
      await this.bindToStaticId(manifestStorageId, user.manifestStaticStorageId);

      await this.database.updateUser(userId, {manifestStorageId});
    }

    return this.database.getUser(userId);
  }

  bindToStaticId(dynamicId, staticId) {
    //TODO: enable when performance will be improved
    // this.storage.bindToStaticId(dynamicId, staticId);

    return this.database.addStaticIdHistoryItem({
      staticId,
      dynamicId,
      isActive: true,
      boundAt: null
    }).catch(() => {/* already have */})
  }

  async setUserAccount(userId, accountData: IUserAccountInput) {
    let userAccount;

    if (accountData.id) {
      userAccount = await this.database.getUserAccount(accountData.id);
    } else {
      userAccount = await this.database.getUserAccountByProvider(userId, accountData.provider);
    }

    accountData['userId'] = userId;

    if (userAccount) {
      if (userAccount.userId !== userId) {
        throw new Error("not_permitted");
      }
      return this.database.updateUserAccount(userAccount.id, accountData);
    } else {
      return this.database.createUserAccount(accountData);
    }
  }

  async addUserFriendById(userId, friendId) {
    await this.checkUserCan(userId, CorePermissionName.UserFriendsManagement);

    friendId = await this.checkUserId(friendId, true);

    const user = await this.database.getUser(userId);
    const friend = await this.database.getUser(friendId);

    const group = await this.createGroup(userId, {
      name: (user.name + "_" + friend.name).replace(/[\W_]+/g, "_") + '_default',
      type: GroupType.PersonalChat,
      theme: 'default',
      title: friend.title,
      storageId: friend.manifestStorageId,
      staticStorageId: friend.manifestStaticStorageId,
      avatarImageId: friend.avatarImageId,
      view: GroupView.TelegramLike,
      isPublic: false,
      isEncrypted: true
    });

    await this.database.addMemberToGroup(userId, group.id);
    await this.database.addAdminToGroup(userId, group.id);

    this.events.emit(this.events.NewPersonalGroup, group);

    return this.database.addUserFriend(userId, friendId);
  }

  async removeUserFriendById(userId, friendId) {
    await this.checkUserCan(userId, CorePermissionName.UserFriendsManagement);

    friendId = await this.checkUserId(friendId, true);

    // TODO: remove personal chat group?

    return this.database.removeUserFriend(userId, friendId);
  }

  async getUserFriends(userId, search?, listParams?: IListParams) {
    await this.checkUserCan(userId, CorePermissionName.UserFriendsManagement);
    return {
      list: await this.database.getUserFriends(userId, search, listParams),
      total: await this.database.getUserFriendsCount(userId, search)
    };
  }

  async checkUserId(userId, createIfNotExist = true) {
    if (userId == 'null' || userId == 'undefined') {
      return null;
    }
    if (!userId || _.isUndefined(userId)) {
      return null;
    }
    if (!commonHelper.isNumber(userId)) {
      let user = await this.getUserByManifestId(userId, userId);
      if (!user && createIfNotExist) {
        user = await this.createUserByRemoteStorageId(userId);
        return user.id;
      } else if (user) {
        userId = user.id;
      }
    }
    return userId;
  }

  async getUserByManifestId(userId, staticId) {
    if (!staticId) {
      const historyItem = await this.database.getStaticIdItemByDynamicId(userId);
      if (historyItem) {
        staticId = historyItem.staticId;
      }
    }
    return this.database.getUserByManifestId(userId, staticId);
  }

  async createUserByRemoteStorageId(manifestStorageId) {
    let staticStorageId;
    if (ipfsHelper.isIpfsHash(manifestStorageId)) {
      staticStorageId = manifestStorageId;
      manifestStorageId = await this.resolveStaticId(staticStorageId);
    }

    let dbUser = await this.getUserByManifestId(manifestStorageId, staticStorageId);
    if (dbUser) {
      //TODO: update user if necessary
      return dbUser;
    }
    const userObject: IUser = await this.render.manifestIdToDbObject(staticStorageId || manifestStorageId);
    userObject.isRemote = true;
    return this.createUserByObject(userObject);
  }

  async createUserByObject(userObject) {
    let dbAvatar = await this.database.getContentByManifestId(userObject.avatarImage.manifestStorageId);
    if (!dbAvatar) {
      dbAvatar = await this.createContentByObject(userObject.avatarImage);
    }
    const userFields = ['manifestStaticStorageId', 'manifestStorageId', 'name', 'title', 'email', 'isRemote', 'description'];
    const dbUser = await this.database.addUser(_.extend(_.pick(userObject, userFields), {
      avatarImageId: dbAvatar ? dbAvatar.id : null
    }));

    if (dbUser.isRemote) {
      this.events.emit(this.events.NewRemoteUser, dbUser);
    }
    return dbUser;
  }

  async generateUserApiKey(userId, data, skipPermissionCheck = false) {
    if(!skipPermissionCheck) {
      await this.checkUserCan(userId, CorePermissionName.UserApiKeyManagement);
    }
    const generated = uuidAPIKey.create();

    data.userId = userId;
    data.valueHash = generated.uuid;

    await this.database.addApiKey(data);

    return generated.apiKey;
  }

  async getUserByApiKey(apiKey) {
    const valueHash = uuidAPIKey.toUUID(apiKey);

    const keyObj = await this.database.getApiKeyByHash(valueHash);
    if (!keyObj) {
      return null;
    }

    return this.database.getUser(keyObj.userId);
  }

  async getUserApiKeys(userId, isDisabled?, search?, listParams?: IListParams) {
    await this.checkUserCan(userId, CorePermissionName.UserApiKeyManagement);
    return {
      list: await this.database.getApiKeysByUser(userId, isDisabled, search, listParams),
      total: await this.database.getApiKeysCountByUser(userId, isDisabled, search)
    };
  }

  async updateApiKey(userId, apiKeyId, updateData) {
    await this.checkUserCan(userId, CorePermissionName.UserApiKeyManagement);
    const keyObj = await this.database.getApiKey(apiKeyId);

    if (keyObj.userId !== userId) {
      throw new Error("not_permitted");
    }

    delete updateData.id;

    return this.database.updateApiKey(keyObj.id, updateData);
  }

  public async setUserLimit(adminId, limitData: IUserLimit) {
    limitData.adminId = adminId;

    const existLimit = await this.database.getUserLimit(limitData.userId, limitData.name);
    if (existLimit) {
      await this.database.updateUserLimit(existLimit.id, limitData);
      return this.database.getUserLimit(limitData.userId, limitData.name);
    } else {
      return this.database.addUserLimit(limitData);
    }
  }

  async getMemberInGroups(userId, types) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    // TODO: use query object instead of types
    return {
      list: await this.database.getMemberInGroups(userId, types),
      total: null
      //TODO: total, limit, offset
    };
  }

  async getAdminInGroups(userId, types) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    // TODO: use query object instead of types
    return {
      list: await this.database.getAdminInGroups(userId, types),
      total: null
      //TODO: total, limit, offset
    };
  }

  async getPersonalChatGroups(userId) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    // TODO: use query object
    return {
      list: await this.database.getCreatorInGroupsByType(userId, GroupType.PersonalChat),
      total: null
      //TODO: total, limit, offset
    };
  }

  /**
   ===========================================
   GROUPS ACTIONS
   ===========================================
   **/

  async checkGroupId(groupId, createIfNotExist = true) {
    if (groupId == 'null' || groupId == 'undefined') {
      return null;
    }
    if (!groupId || _.isUndefined(groupId)) {
      return null;
    }
    if (!commonHelper.isNumber(groupId)) {
      let group = await this.getGroupByManifestId(groupId, groupId);
      if (!group && createIfNotExist) {
        group = await this.createGroupByRemoteStorageId(groupId);
        return group.id;
      } else if (group) {
        groupId = group.id;
      }
    }
    return groupId;
  }

  async checkCategoryId(categoryId, createIfNotExist = true) {
    if (categoryId == 'null' || categoryId == 'undefined') {
      return null;
    }
    if (!categoryId || _.isUndefined(categoryId)) {
      return null;
    }
    if (!commonHelper.isNumber(categoryId)) {
      let group = await this.getCategoryByManifestId(categoryId, categoryId);
      if (!group && createIfNotExist) {
        // TODO: create category by remote storage id
        return null;
        // group = await this.createGroupByRemoteStorageId(categoryId);
        // return group.id;
      } else if (group) {
        categoryId = group.id;
      }
    }
    return categoryId;
  }

  async canCreatePostInGroup(userId, groupId) {
    if (!groupId) {
      return false;
    }
    groupId = await this.checkGroupId(groupId);
    const group = await this.getGroup(groupId);
    return (await this.database.isAdminInGroup(userId, groupId)) || (!group.isOpen && await this.database.isMemberInGroup(userId, groupId));
  }

  async canAddGroupToCategory(userId, categoryId) {
    if (!categoryId) {
      return false;
    }
    categoryId = await this.checkCategoryId(categoryId);
    return this.database.isAdminInCategory(userId, categoryId);
  }

  async createGroup(userId, groupData) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);

    const existUserWithName = await this.database.getGroupByParams({name: groupData['name']});
    if (existUserWithName) {
      throw new Error("name_already_exists");
    }
    if (!groupData['name']) {
      throw new Error("name_cant_be_null");
    }

    groupData.creatorId = userId;

    groupData.manifestStaticStorageId = await this.createStorageAccount(groupData['name']);
    if (groupData.type !== GroupType.PersonalChat) {
      groupData.staticStorageId = groupData.manifestStaticStorageId;
    }

    const group = await this.database.addGroup(groupData);

    if (groupData.type !== GroupType.PersonalChat) {
      await this.database.addAdminToGroup(userId, group.id);
    }

    await this.updateGroupManifest(group.id);

    return this.database.getGroup(group.id);
  }

  async createGroupByRemoteStorageId(manifestStorageId) {
    let staticStorageId;
    if (ipfsHelper.isIpfsHash(manifestStorageId)) {
      staticStorageId = manifestStorageId;
      manifestStorageId = await this.resolveStaticId(staticStorageId);
    }

    let dbGroup = await this.getGroupByManifestId(manifestStorageId, staticStorageId);
    if (dbGroup) {
      //TODO: update group if necessary
      return dbGroup;
    }
    const groupObject: IGroup = await this.render.manifestIdToDbObject(staticStorageId || manifestStorageId);
    groupObject.isRemote = true;
    return this.createGroupByObject(groupObject);
  }

  async createGroupByObject(groupObject) {
    let dbAvatar = await this.database.getContentByManifestId(groupObject.avatarImage.manifestStorageId);
    if (!dbAvatar) {
      dbAvatar = await this.createContentByObject(groupObject.avatarImage);
    }
    let dbCover = await this.database.getContentByManifestId(groupObject.coverImage.manifestStorageId);
    if (!dbCover) {
      dbCover = await this.createContentByObject(groupObject.coverImage);
    }
    const groupFields = ['manifestStaticStorageId', 'manifestStorageId', 'name', 'title', 'view', 'type', 'theme', 'isPublic', 'isRemote', 'description', 'size'];
    const dbGroup = await this.database.addGroup(_.extend(_.pick(groupObject, groupFields), {
      avatarImageId: dbAvatar ? dbAvatar.id : null,
      coverImageId: dbCover ? dbCover.id : null
    }));

    if (dbGroup.isRemote) {
      this.events.emit(this.events.NewRemoteGroup, dbGroup);
    }
    return dbGroup;
  }

  async canEditGroup(userId, groupId) {
    if (!groupId) {
      return false;
    }
    groupId = await this.checkGroupId(groupId);
    return this.database.isAdminInGroup(userId, groupId);
  }

  async canEditCategory(userId, categoryId) {
    if (!categoryId) {
      return false;
    }
    categoryId = await this.checkCategoryId(categoryId);
    return this.database.isAdminInCategory(userId, categoryId);
  }

  async isMemberInGroup(userId, groupId) {
    if (!groupId) {
      return false;
    }
    groupId = await this.checkGroupId(groupId);
    return this.database.isMemberInGroup(userId, groupId);
  }

  async isAdminInGroup(userId, groupId) {
    if (!groupId) {
      return false;
    }
    groupId = await this.checkGroupId(groupId);
    return this.database.isAdminInGroup(userId, groupId);
  }

  async addMemberToGroup(userId, groupId, memberId) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    groupId = await this.checkGroupId(groupId);
    const group = await this.getGroup(groupId);
    if(!(await this.isAdminInGroup(userId, groupId))) {
      if(userId.toString() !== memberId.toString()) {
        throw new Error("not_permitted");
      }
      if(!group.isPublic || !group.isOpen) {
        throw new Error("not_permitted");
      }
    }
    await this.database.addMemberToGroup(memberId, groupId);
  }

  async removeMemberFromGroup(userId, groupId, memberId) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    groupId = await this.checkGroupId(groupId);
    const group = await this.getGroup(groupId);
    if(!(await this.isAdminInGroup(userId, groupId))) {
      if(userId.toString() !== memberId.toString()) {
        throw new Error("not_permitted");
      }
      if(!group.isPublic || !group.isOpen) {
        throw new Error("not_permitted");
      }
    }
    await this.database.removeMemberFromGroup(memberId, groupId);
  }

  async addAdminToGroup(userId, groupId, newAdminUserId) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    if (!(await this.canEditGroup(userId, groupId))) {
      throw new Error("not_permitted");
    }
    groupId = await this.checkGroupId(groupId);
    await this.database.addAdminToGroup(newAdminUserId, groupId);
  }

  async removeAdminFromGroup(userId, groupId, removeAdminUserId) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    if (!(await this.canEditGroup(userId, groupId))) {
      throw new Error("not_permitted");
    }
    groupId = await this.checkGroupId(groupId);
    await this.database.removeAdminFromGroup(removeAdminUserId, groupId);
  }

  async updateGroup(userId, groupId, updateData) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    groupId = await this.checkGroupId(groupId);
    if (!(await this.canEditGroup(userId, groupId))) {
      throw new Error("not_permitted");
    }
    await this.database.updateGroup(groupId, updateData);

    await this.updateGroupManifest(groupId);

    return this.database.getGroup(groupId);
  }

  async createCategory(userId, categoryData) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    categoryData.creatorId = userId;

    categoryData.manifestStaticStorageId = await this.createStorageAccount(categoryData['name']);
    if (categoryData.type !== GroupType.PersonalChat) {
      categoryData.staticStorageId = categoryData.manifestStaticStorageId;
    }

    const category = await this.database.addCategory(categoryData);

    await this.database.addAdminToCategory(userId, category.id);

    await this.updateCategoryManifest(category.id);

    return this.database.getCategory(category.id);
  }

  async addGroupToCategory(userId, groupId, categoryId) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    if (!(await this.canEditCategory(userId, categoryId))) {
      throw new Error("not_permitted");
    }

    await this.database.addGroupToCategory(groupId, categoryId);
  }

  async getCategoryByParams(params) {
    return this.database.getCategoryByParams(_.pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId']));
  }

  async getGroupByParams(params) {
    return this.database.getGroupByParams(_.pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId']));
  }

  async getPostByParams(params) {
    return this.database.getPostByParams(_.pick(params, ['name', 'staticStorageId', 'manifestStorageId', 'manifestStaticStorageId']));
  }

  async createPost(userId, postData) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    postData.userId = userId;
    postData.groupId = await this.checkGroupId(postData.groupId);
    const group = await this.database.getGroup(postData.groupId);

    if(!(await this.canCreatePostInGroup(userId, postData.groupId))) {
      throw new Error("not_permitted");
    }

    if (postData.status === PostStatus.Published) {
      postData.localId = await this.getPostLocalId(postData);
      postData.publishedAt = new Date();
    }

    const contentsIds = postData.contents.map(c => c.id);
    delete postData.contents;

    const user = await this.database.getUser(userId);

    postData.authorStorageId = user.manifestStorageId;
    postData.authorStaticStorageId = user.manifestStaticStorageId;

    postData.groupStorageId = group.manifestStorageId;
    postData.groupStaticStorageId = group.manifestStaticStorageId;

    console.log('addPost', postData);
    let post = await this.database.addPost(postData);

    if(post.replyToId) {
      const repliesCount = await this.database.getAllPostsCount({
        replyToId: post.replyToId
      });
      await this.database.updatePost(post.replyToId, {repliesCount});
    }

    await this.database.setPostContents(post.id, contentsIds);

    let size = await this.database.getPostSizeSum(post.id);
    await this.database.updatePost(post.id, {size});

    await this.updatePostManifest(post.id);

    post = await this.database.getPost(post.id);

    if (group.isEncrypted && group.type === GroupType.PersonalChat) {
      // Encrypt post id
      const keyForEncrypt = await this.database.getStaticIdPublicKey(group.staticStorageId);

      const userKey = await this.storage.keyLookup(user.manifestStaticStorageId);
      const userPrivateKey = await pgpHelper.transformKey(userKey.marshal());
      const userPublicKey = await pgpHelper.transformKey(userKey.public.marshal(), true);
      const publicKeyForEncrypt = await pgpHelper.transformKey(bs58.decode(keyForEncrypt), true);
      const encryptedText = await pgpHelper.encrypt([userPrivateKey], [publicKeyForEncrypt, userPublicKey], post.manifestStorageId);

      await this.storage.publishEventByIpnsId(user.manifestStaticStorageId, getPersonalChatTopic([user.manifestStaticStorageId, group.staticStorageId], group.theme), {
        type: 'new_post',
        postId: encryptedText,
        groupId: group.manifestStaticStorageId,
        isEncrypted: true,
        sentAt: (post.publishedAt || post.createdAt).toString()
      });

      await this.database.updatePost(post.id, {isEncrypted: true, encryptedManifestStorageId: encryptedText});
      await this.updateGroupManifest(group.id);
    } else {
      // Send plain post id
      await this.storage.publishEventByIpnsId(user.manifestStaticStorageId, getPersonalChatTopic([user.manifestStaticStorageId, group.staticStorageId], group.theme), {
        type: 'new_post',
        postId: post.manifestStorageId,
        groupId: group.manifestStaticStorageId,
        isEncrypted: false,
        sentAt: (post.publishedAt || post.createdAt).toString()
      });
    }

    return post;
  }

  async updatePost(userId, postId, postData) {
    await this.checkUserCan(userId, CorePermissionName.UserGroupManagement);
    const contentsIds = postData.contentsIds;
    delete postData.contentsIds;

    const oldPost = await this.database.getPost(postId);

    if (postData.status === PostStatus.Published && !oldPost.localId) {
      postData.localId = await this.getPostLocalId(postData);
    }

    await this.database.setPostContents(postId, contentsIds);

    postData.size = await this.database.getPostSizeSum(postId);

    await this.database.updatePost(postId, postData);
    await this.updatePostManifest(postId);

    return this.database.getPost(postId);
  }

  async getPostLocalId(post: IPost) {
    if (!post.groupId) {
      return null;
    }
    const group = await this.database.getGroup(post.groupId);
    group.publishedPostsCount++;
    await this.database.updateGroup(group.id, {publishedPostsCount: group.publishedPostsCount});
    return group.publishedPostsCount;
  }

  async updateGroupManifest(groupId) {
    const group = await this.database.getGroup(groupId);

    group.size = await this.database.getGroupSizeSum(groupId);
    await this.database.updateGroup(groupId, {size: group.size});

    const manifestStorageId = await this.generateAndSaveManifest('group', group);
    let storageUpdatedAt = group.storageUpdatedAt;
    let staticStorageUpdatedAt = group.staticStorageUpdatedAt;

    if (manifestStorageId != group.manifestStorageId) {
      storageUpdatedAt = new Date();
      staticStorageUpdatedAt = new Date();

      await this.bindToStaticId(manifestStorageId, group.manifestStaticStorageId);
    }

    return this.database.updateGroup(groupId, {
      manifestStorageId,
      storageUpdatedAt,
      staticStorageUpdatedAt
    });
  }

  async updateCategoryManifest(categoryId) {
    const post = await this.database.getCategory(categoryId);

    return this.database.updateCategory(categoryId, {
      manifestStorageId: await this.generateAndSaveManifest('category', post)
    });
  }

  async updatePostManifest(postId) {
    const post = await this.database.getPost(postId);

    await this.database.updatePost(postId, {
      manifestStorageId: await this.generateAndSaveManifest('post', post)
    });

    return this.updateGroupManifest(post.groupId);
  }

  async getGroupPeers(groupId) {
    let ipnsId;
    if (ipfsHelper.isIpfsHash(groupId)) {
      ipnsId = groupId;
    } else {
      const group = await this.database.getGroup(groupId);
      ipnsId = group.manifestStaticStorageId;
    }
    return this.getIpnsPeers(ipnsId);
  }

  async createPostByRemoteStorageId(manifestStorageId, groupId, publishedAt = null, isEncrypted = false) {
    const postObject: IPost = await this.render.manifestIdToDbObject(manifestStorageId, 'post-manifest', {
      isEncrypted,
      groupId,
      publishedAt
    });
    postObject.isRemote = true;
    postObject.status = PostStatus.Published;
    postObject.localId = await this.getPostLocalId(postObject);

    const {contents} = postObject;
    delete postObject.contents;

    let post = await this.database.addPost(postObject);

    if (!isEncrypted) {
      // console.log('postObject', postObject);
      await this.database.setPostContents(post.id, contents.map(c => c.id));
    }

    await this.updateGroupManifest(post.groupId);

    return this.database.getPost(post.id);
  }

  /**
   ===========================================
   CONTENT ACTIONS
   ===========================================
   **/

  async createContentByObject(contentObject, options: { groupId?, userId?, userApiKeyId? } = {}) {
    const storageId = contentObject.manifestStaticStorageId || contentObject.manifestStorageId;
    let dbContent = await this.database.getContentByStorageId(storageId);
    if (dbContent) {
      return dbContent;
    }
    return this.addContent(contentObject, options);
  }

  async createContentByRemoteStorageId(manifestStorageId, options: { groupId?, userId?, userApiKeyId? } = {}) {
    let dbContent = await this.database.getContentByManifestId(manifestStorageId);
    if (dbContent) {
      return dbContent;
    }
    const contentObject: IContent = await this.render.manifestIdToDbObject(manifestStorageId);
    contentObject.isRemote = true;
    return this.createContentByObject(contentObject);
  }

  async getPreview(storageId, fullType, source?) {
    let previewDriverName;
    if (source) {
      if (detecterHelper.isYoutubeUrl(source)) {
        previewDriverName = 'youtube-thumbnail';
      }
    }
    if (!fullType) {
      fullType = '';
    }
    if (this.isVideoType(fullType)) {
      previewDriverName = 'video-thumbnail';
    }
    console.log('previewDriverName', previewDriverName, fullType);
    if (!previewDriverName) {
      previewDriverName = fullType.split('/')[0];
    }
    let extension = fullType.split('/')[1];

    let previewDriver = this.drivers.preview[previewDriverName] as AbstractDriver;
    if (!previewDriver) {
      return {};
    }

    if(previewDriverName === 'video-thumbnail') {
      const {content: originalVideoImage, extension: imageExtension} = await this.getPreviewStreamContent(previewDriver, storageId, {
        extension
      });
      storageId = originalVideoImage.id;
      extension = imageExtension;
      previewDriverName = 'image';
      previewDriver = this.drivers.preview[previewDriverName] as AbstractDriver;
      if (!previewDriver) {
        return {};
      }
    }
    try {
      if (previewDriver.isInputSupported(DriverInput.Stream)) {
        const {content: mediumFile, type, extension: resultExtension} = await this.getPreviewStreamContent(previewDriver, storageId, {
          extension,
          size: OutputSize.Medium
        });

        let smallFile;
        if (previewDriver.isOutputSizeSupported(OutputSize.Small)) {
          smallFile = await this.getPreviewStreamContent(previewDriver, storageId, {
            extension,
            size: OutputSize.Small
          });
          smallFile = smallFile.content;
        }

        let largeFile;
        if (previewDriver.isOutputSizeSupported(OutputSize.Large)) {
          largeFile = await this.getPreviewStreamContent(previewDriver, storageId, {
            extension,
            size: OutputSize.Large
          });
          largeFile = largeFile.content;
        }

        return {
          smallPreviewStorageId: smallFile ? smallFile.id : null,
          smallPreviewSize: smallFile ? smallFile.size : null,
          largePreviewStorageId: largeFile ? largeFile.id : null,
          largePreviewSize: smallFile ? smallFile.size : null,
          mediumPreviewStorageId: mediumFile.id,
          mediumPreviewSize: mediumFile.size,
          previewType: type,
          previewExtension: resultExtension
        };
      } else if (previewDriver.isInputSupported(DriverInput.Content)) {
        const data = await this.storage.getFileData(storageId);

        const {content: mediumData, type, extension: resultExtension} = await previewDriver.processByContent(data, {
          extension,
          size: OutputSize.Medium
        });
        const mediumFile = await this.storage.saveFileByData(mediumData);

        let smallFile;
        if (previewDriver.isOutputSizeSupported(OutputSize.Small)) {
          const {content: smallData} = await previewDriver.processByContent(data, {extension, size: OutputSize.Small});
          smallFile = await this.storage.saveFileByData(smallData);
        }

        let largeFile;
        if (previewDriver.isOutputSizeSupported(OutputSize.Large)) {
          const {content: largeData} = await previewDriver.processByContent(data, {extension, size: OutputSize.Large});
          largeFile = await this.storage.saveFileByData(largeData);
        }

        return {
          smallPreviewStorageId: smallFile ? smallFile.id : null,
          smallPreviewSize: smallFile ? smallFile.size : null,
          largePreviewStorageId: largeFile ? largeFile.id : null,
          largePreviewSize: smallFile ? smallFile.size : null,
          mediumPreviewStorageId: mediumFile.id,
          mediumPreviewSize: mediumFile.size,
          previewType: type,
          previewExtension: resultExtension
        };
      } else if (previewDriver.isInputSupported(DriverInput.Source)) {
        const {content: resultData, path, extension: resultExtension, type} = await previewDriver.processBySource(source, {});
        console.log('path', path);
        let storageFile;
        if (path) {
          storageFile = await this.storage.saveFileByPath(path);
        } else {
          storageFile = await this.storage.saveFileByData(resultData);
        }

        //TODO: other sizes?
        return {
          smallPreviewStorageId: null,
          smallPreviewSize: null,
          largePreviewStorageId: null,
          largePreviewSize: null,
          mediumPreviewStorageId: storageFile.id,
          mediumPreviewSize: storageFile.size,
          previewType: type,
          previewExtension: resultExtension
        };
      }
    } catch (e) {
      console.error(e);
      return {};
    }
    throw new Error(previewDriver + "_preview_driver_input_not_found");
  }

  async getPreviewStreamContent(previewDriver, storageId, options): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const inputStream = await this.storage.getFileStream(storageId);
      options.onError = (err) => {
        reject(err);
      };
      const {stream: resultStream, type, extension} = await previewDriver.processByStream(inputStream, options);

      const content = await this.storage.saveFileByData(resultStream);
      return resolve({content, type, extension});
    });
  }

  async asyncOperationWrapper(methodName, args, options) {
    await this.checkUserCan(options.userId, CorePermissionName.UserSaveData);
    if (options.apiKey) {
      const apiKey = await this.database.getApiKeyByHash(uuidAPIKey.toUUID(options.apiKey));
      if(!apiKey) {
        throw new Error("not_authorized");
      }
      options.userApiKeyId = apiKey.id;
    }

    if (!options.async) {
      return this[methodName].apply(this, args);
    }

    const asyncOperation = await this.database.addUserAsyncOperation({
      userId: options.userId,
      userApiKeyId: options.userApiKeyId,
      name: 'save-data',
      inProcess: true,
      channel: uuidv4()
    });

    // TODO: fix hotfix
    if (_.isObject(_.last(args))) {
      _.last(args).onProgress = (progress) => {
        console.log('onProgress', progress);
        this.database.updateUserAsyncOperation(asyncOperation.id, {
          percent: progress.percent
        });
      }
    }

    let dataSendingPromise = new Promise((resolve, reject) => {
      if (args[0].on) {
        //TODO: close that stream on limit reached error
        args[0].on('end', () => resolve());
        args[0].on('error', (e) => reject(e));
        args[0].on('limit', () => reject("limit_reached"));
      } else {
        resolve();
      }
    });
    const methodPromise = this[methodName].apply(this, args);

    methodPromise
      .then((res: any) => {
        this.database.updateUserAsyncOperation(asyncOperation.id, {
          inProcess: false,
          contentId: res.id
        });
        return this.storage.publishEvent(asyncOperation.channel, res);
      })
      .catch((e) => {
        return this.database.updateUserAsyncOperation(asyncOperation.id, {
          inProcess: false,
          errorType: 'unknown',
          errorMessage: e && e.message ? e.message : e
        });
      });

    try {
      await dataSendingPromise;
    } catch(e) {
      await this.database.updateUserAsyncOperation(asyncOperation.id, {
        inProcess: false,
        errorType: 'unknown',
        errorMessage: e && e.message ? e.message : e
      });
    }

    return {asyncOperationId: asyncOperation.id, channel: asyncOperation.channel};
  }

  async saveData(dataToSave, fileName, options: { userId, groupId,  driver?, apiKey?, userApiKeyId?, folderId?, mimeType?, path?, onProgress? }) {
    log('saveData');
    await this.checkUserCan(options.userId, CorePermissionName.UserSaveData);
    log('checkUserCan');
    if (options.path) {
      fileName = this.getFilenameFromPath(options.path);
    }
    const extension = this.getExtensionFromName(fileName);

    if (options.apiKey && !options.userApiKeyId) {
      const apiKey = await this.database.getApiKeyByHash(uuidAPIKey.toUUID(options.apiKey));
      log('apiKey');
      if(!apiKey) {
        throw new Error("not_authorized");
      }
      options.userApiKeyId = apiKey.id;
    }

    if(dataToSave.type === "Buffer") {
      dataToSave = Buffer.from(dataToSave.data)
    }

    if(_.isArray(dataToSave)) {
      dataToSave = Buffer.from(dataToSave)
    }

    let fileStream;
    if(_.isString(dataToSave) || _.isBuffer(dataToSave)) {
      fileStream = new Readable();
      fileStream._read = () => {};
      fileStream.push(dataToSave);
      fileStream.push(null);
    } else {
      fileStream = dataToSave;
    }

    const {resultFile: storageFile, resultMimeType: type, resultExtension} = await this.saveFileByStream(options.userId, fileStream, options.mimeType || mime.getType(fileName) || extension, {
      extension,
      driver: options.driver,
      onProgress: options.onProgress
    }).catch(e => {
      dataToSave.emit('end');
      dataToSave.destroy && dataToSave.destroy();
      throw e;
    });
    log('saveFileByStream');

    let existsContent = await this.database.getContentByStorageAndUserId(storageFile.id, options.userId);
    log('existsContent');
    if (existsContent) {
      console.log(`Content ${storageFile.id} already exists in database, check preview and folder placement`);
      await this.setContentPreviewIfNotExist(existsContent);
      if(await this.isUserCan(options.userId, CorePermissionName.UserFileCatalogManagement)) {
        await this.addContentToUserFileCatalog(options.userId, existsContent, options);
      }
      return existsContent;
    }

    let {mediumPreviewStorageId, mediumPreviewSize, smallPreviewStorageId, smallPreviewSize, largePreviewStorageId, largePreviewSize, previewType, previewExtension} = await this.getPreview(storageFile.id, type);
    log('getPreview');

    return this.addContent({
      mediumPreviewStorageId,
      mediumPreviewSize,

      smallPreviewStorageId,
      smallPreviewSize,

      largePreviewStorageId,
      largePreviewSize,

      previewExtension,
      storageType: ContentStorageType.IPFS,
      extension: resultExtension,
      mimeType: type,
      previewMimeType: previewType as any,
      userId: options.userId,
      view: ContentView.Contents,
      storageId: storageFile.id,
      size: storageFile.size,
      name: fileName,
    }, options);
  }

  async saveDataByUrl(url, options: { userId, groupId, driver?, apiKey?, userApiKeyId?, folderId?, mimeType?, path?, onProgress? }) {
    await this.checkUserCan(options.userId, CorePermissionName.UserSaveData);
    let name;
    if (options.path) {
      name = this.getFilenameFromPath(options.path);
    } else {
      name = _.last(url.split('/'))
    }
    let extension = this.getExtensionFromName(name);
    let type;

    if (options.apiKey && !options.userApiKeyId) {
      const apiKey = await this.database.getApiKeyByHash(uuidAPIKey.toUUID(options.apiKey));
      if(!apiKey) {
        throw new Error("not_authorized");
      }
      options.userApiKeyId = apiKey.id;
    }

    let storageFile;
    const uploadDriver = options.driver && this.drivers.upload[options.driver] as AbstractDriver;
    if (uploadDriver && uploadDriver.isInputSupported(DriverInput.Source)) {
      const dataToSave = await this.handleSourceByUploadDriver(url, options.driver);
      type = dataToSave.type;
      const {resultFile, resultMimeType, resultExtension} = await this.saveFileByStream(options.userId, dataToSave.stream, type, {
        extension,
        onProgress: options.onProgress
      });
      type = resultMimeType;
      storageFile = resultFile;
      extension = resultExtension;
    } else {
      const {resultFile, resultMimeType, resultExtension} = await axios({
        url,
        method: 'get',
        responseType: 'stream'
      }).then((response) => {
        const {status, statusText, data, headers} = response;
        if (status !== 200) {
          throw statusText;
        }
        return this.saveFileByStream(options.userId, data, headers['content-type'] || mime.getType(name) || extension, {extension, driver: options.driver});
      });
      console.log('resultFile, resultMimeType, resultExtension', resultFile, resultMimeType, resultExtension);
      type = resultMimeType;
      storageFile = resultFile;
      extension = resultExtension;
    }

    const existsContent = await this.database.getContentByStorageAndUserId(storageFile.id, options.userId);
    if (existsContent) {
      await this.setContentPreviewIfNotExist(existsContent);
      await this.addContentToUserFileCatalog(options.userId, existsContent, options);
      return existsContent;
    }

    let {mediumPreviewStorageId, mediumPreviewSize, smallPreviewStorageId, smallPreviewSize, largePreviewStorageId, largePreviewSize, previewType, previewExtension} = await this.getPreview(storageFile.id, type, url);

    return this.addContent({
      mediumPreviewStorageId,
      mediumPreviewSize,

      smallPreviewStorageId,
      smallPreviewSize,

      largePreviewStorageId,
      largePreviewSize,

      extension,
      previewExtension,
      storageType: ContentStorageType.IPFS,
      mimeType: type,
      previewMimeType: previewType as any,
      userId: options.userId,
      view: ContentView.Attachment,
      storageId: storageFile.id,
      size: storageFile.size,
      name: name
    }, options);
  }

  async setContentPreviewIfNotExist(content) {
    if (content.mediumPreviewStorageId && content.previewMimeType) {
      return;
    }
    let {mediumPreviewStorageId, mediumPreviewSize, smallPreviewStorageId, smallPreviewSize, largePreviewStorageId, largePreviewSize, previewType, previewExtension} = await this.getPreview(content.storageId, content.mimeType);
    await this.database.updateContent(content.id, {
      mediumPreviewStorageId,
      mediumPreviewSize,
      smallPreviewStorageId,
      smallPreviewSize,
      largePreviewStorageId,
      largePreviewSize,
      previewMimeType: previewType as any,
      previewExtension
    });
    await this.updateContentManifest(content.id);
    const updatedContent = await this.database.getContent(content.id);
    _.extend(content, updatedContent);
  }

  async getAsyncOperation(userId, operationId) {
    const asyncOperation = await this.database.getUserAsyncOperation(operationId);
    if (asyncOperation.userId != userId) {
      throw new Error("not_permitted");
    }
    return asyncOperation;
  }

  getFilenameFromPath(path) {
    return _.trim(path, '/').split('/').slice(-1)[0];
  }

  getExtensionFromName(fileName) {
    return (fileName || '').split('.').length > 1 ? _.last((fileName || '').split('.')) : null
  }

  isVideoType(fullType) {
    //TODO: detect more video types
    return _.startsWith(fullType, 'video') || _.endsWith(fullType, 'mp4') || _.endsWith(fullType, 'avi') || _.endsWith(fullType, 'mov') || _.endsWith(fullType, 'quicktime');
  }

  private async saveFileByStream(userId, stream, mimeType, options: any = {}): Promise<any> {
    return new Promise(async (resolve, reject) => {
      let extension = options.extension || _.last(mimeType.split('/'));

      if (this.isVideoType(mimeType)) {
        const convertResult = await this.drivers.convert['video-to-streamable'].processByStream(stream, {
          extension: extension,
          onProgress: options.onProgress,
          onError: reject
        });
        stream = convertResult.stream;
      }

      const sizeRemained = await this.getUserLimitRemained(userId, UserLimitName.SaveContentSize);

      if (sizeRemained !== null) {
        console.log('sizeRemained', sizeRemained);
        let streamSize = 0;
        const sizeCheckStream = new Transform({
          transform: function (chunk, encoding, callback) {
            streamSize += chunk.length;
            console.log('streamSize', streamSize);
            if (streamSize >= sizeRemained) {
              console.error("limit_reached for user", userId);
              // callback("limit_reached", null);
              reject("limit_reached");
              // stream.emit('error', "limit_reached");
              stream.end();
              sizeCheckStream.end();
            } else {
              callback(false, chunk);
            }
          }
        });
        sizeCheckStream.on('error', reject);
        stream = stream.pipe(sizeCheckStream);
      }

      log('options.driver', options.driver);

      let resultFile;
      if(options.driver === 'archive') {
        const uploadResult = await this.drivers.upload['archive'].processByStream(stream, {
          extension,
          onProgress: options.onProgress,
          onError: reject
        });
        resultFile = await this.storage.saveDirectory(uploadResult.tempPath);
        if(uploadResult.emitFinish) {
          uploadResult.emitFinish();
        }
        mimeType = 'directory';
        extension = 'none';
        console.log('uploadResult', uploadResult);
        resultFile.size = uploadResult.size;
      } else {
        resultFile = await this.storage.saveFileByData(stream);
        // get actual size from fileStat. Sometimes resultFile.size is bigger than fileStat size
        const storageContentStat = await this.storage.getFileStat(resultFile.id);
        resultFile.size = storageContentStat.size;
      }

      resolve({
        resultFile: resultFile,
        resultMimeType: mimeType,
        resultExtension: extension
      });
    });
  }

  async getUserLimitRemained(userId, limitName: UserLimitName) {
    const limit = await this.database.getUserLimit(userId, limitName);
    if (!limit || !limit.isActive) {
      return null;
    }
    if (limitName === UserLimitName.SaveContentSize) {
      const uploadSize = await this.database.getUserContentActionsSizeSum(userId, UserContentActionName.Upload, limit.periodTimestamp);
      const pinSize = await this.database.getUserContentActionsSizeSum(userId, UserContentActionName.Pin, limit.periodTimestamp);
      console.log('uploadSize', uploadSize);
      console.log('pinSize', pinSize);
      return limit.value - uploadSize - pinSize;
    } else {
      throw new Error("Unknown limit");
    }
  }

  private async addContent(contentData: IContent, options: { groupId?, userId?, userApiKeyId? } = {}) {
    log('addContent');
    if (options.groupId) {
      const groupId = await this.checkGroupId(options.groupId);
      let group;
      if (groupId) {
        contentData.groupId = groupId;
        group = await this.database.getGroup(groupId);
      }
      contentData.isPublic = group && group.isPublic;
    }

    if(!contentData.size) {
      const storageContentStat = await this.storage.getFileStat(contentData.storageId);
      log('storageContentStat');

      contentData.size = storageContentStat.size;
    }

    if(!contentData.userId && options.userId) {
      contentData.userId = options.userId;
    }

    const content = await this.database.addContent(contentData);
    log('content');

    if (content.userId && await this.isUserCan(content.userId, CorePermissionName.UserFileCatalogManagement)) {
      log('isUserCan');
      await this.addContentToUserFileCatalog(content.userId, content, options);
      log('addContentToUserFileCatalog');
    }

    await this.database.addUserContentAction({
      name: UserContentActionName.Upload,
      userId: content.userId,
      size: content.size,
      contentId: content.id,
      userApiKeyId: options.userApiKeyId
    });
    log('addUserContentAction');

    if (!contentData.manifestStorageId) {
      await this.updateContentManifest(content.id);
    }
    log('updateContentManifest');

    return this.database.getContent(content.id);
  }

  async handleSourceByUploadDriver(sourceLink, driver) {
    const uploadDriver = this.drivers.upload[driver] as AbstractDriver;
    if (!uploadDriver) {
      throw new Error(driver + "_upload_driver_not_found");
    }
    if (!_.includes(uploadDriver.supportedInputs, DriverInput.Source)) {
      throw new Error(driver + "_upload_driver_input_not_correct");
    }
    return uploadDriver.processBySource(sourceLink, {});
  }

  /**
   ===========================================
   FILE CATALOG ACTIONS
   ===========================================
   **/

  public async addContentToFolder(userId, contentId, folderId) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    const content = await this.database.getContent(contentId);
    return this.addContentToUserFileCatalog(userId, content, {folderId})
  }

  private async addContentToUserFileCatalog(userId, content: IContent, options: { groupId?, apiKey?, folderId?, path? }) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    const baseType = content.mimeType ? _.first(content.mimeType.split('/')) : 'other';

    let parentItemId;

    const groupId = (await this.checkGroupId(options.groupId)) || null;

    if (options.path) {
      return this.saveContentByPath(content.userId, options.path, content.id);
    }

    parentItemId = options.folderId;

    if (_.isUndefined(parentItemId) || parentItemId === 'undefined') {
      const contentFiles = await this.database.getFileCatalogItemsByContent(userId, content.id, FileCatalogItemType.File);
      if (contentFiles.length) {
        return content;
      }

      let folder = await this.database.getFileCatalogItemByDefaultFolderFor(userId, baseType);

      if (!folder) {
        folder = await this.database.addFileCatalogItem({
          name: _.upperFirst(baseType) + " Uploads",
          type: FileCatalogItemType.Folder,
          position: (await this.database.getFileCatalogItemsCount(userId, null)) + 1,
          defaultFolderFor: baseType,
          userId
        });
      }
      parentItemId = folder.id;
    }

    if (parentItemId === 'null') {
      parentItemId = null;
    }

    if (await this.database.isFileCatalogItemExistWithContent(userId, parentItemId, content.id)) {
      console.log(`Content ${content.id} already exists in folder`);
      return;
    }

    const resultItem = await this.database.addFileCatalogItem({
      name: content.name || "Unnamed " + new Date().toISOString(),
      type: FileCatalogItemType.File,
      position: (await this.database.getFileCatalogItemsCount(userId, parentItemId)) + 1,
      contentId: content.id,
      size: content.size,
      groupId,
      parentItemId,
      userId
    });

    if (parentItemId) {
      const size = await this.database.getFileCatalogItemsSizeSum(parentItemId);
      await this.database.updateFileCatalogItem(parentItemId, {size});
    }

    return resultItem;
  }

  async createUserFolder(userId, parentItemId, folderName) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    return this.database.addFileCatalogItem({
      name: folderName,
      type: FileCatalogItemType.Folder,
      position: (await this.database.getFileCatalogItemsCount(userId, parentItemId)) + 1,
      size: 0,
      parentItemId,
      userId
    });
  }

  public async updateFileCatalogItem(userId, fileCatalogId, updateData) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    const fileCatalogItem = await this.database.getFileCatalogItem(fileCatalogId);
    if (fileCatalogItem.userId !== userId) {
      throw new Error("not_permitted");
    }
    await this.database.updateFileCatalogItem(fileCatalogId, updateData);
    return this.database.getFileCatalogItem(fileCatalogId);
  }

  async getFileCatalogItems(userId, parentItemId, type?, search = '', listParams?: IListParams) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    if (parentItemId == 'null') {
      parentItemId = null;
    }
    if (_.isUndefined(parentItemId) || parentItemId === 'undefined')
      parentItemId = undefined;

    return {
      list: await this.database.getFileCatalogItems(userId, parentItemId, type, search, listParams),
      total: await this.database.getFileCatalogItemsCount(userId, parentItemId, type, search)
    };
  }

  async getFileCatalogItemsBreadcrumbs(userId, itemId) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    const item = await this.database.getFileCatalogItem(itemId);
    if (item.userId != userId) {
      throw new Error("not_permitted");
    }

    return this.database.getFileCatalogItemsBreadcrumbs(itemId);
  }

  async getContentsIdsByFileCatalogIds(catalogIds) {
    return this.database.getContentsIdsByFileCatalogIds(catalogIds);
  }

  async regenerateUserContentPreviews(userId) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    (async () => {
      const previousIpldToNewIpld = [];

      let userContents = [];

      let offset = 0;
      let limit = 100;
      do {
        userContents = await this.database.getContentList(userId, {
          offset,
          limit
        });

        await pIteration.forEach(userContents, async (content: IContent) => {
          const previousIpldToNewIpldItem = [content.manifestStorageId];
          let {mediumPreviewStorageId, mediumPreviewSize, smallPreviewStorageId, smallPreviewSize, largePreviewStorageId, largePreviewSize, previewType, previewExtension} = await this.getPreview(content.storageId, content.mimeType);

          await this.database.updateContent(content.id, {
            mediumPreviewStorageId,
            mediumPreviewSize,

            smallPreviewStorageId,
            smallPreviewSize,

            largePreviewStorageId,
            largePreviewSize,

            previewExtension,
            previewMimeType: previewType
          });

          await this.updateContentManifest(content.id);
          const updatedContent = await this.database.getContent(content.id);

          previousIpldToNewIpldItem.push(updatedContent.manifestStorageId);

          previousIpldToNewIpld.push(previousIpldToNewIpldItem);
        });

        offset += limit;
      } while (userContents.length === limit);

      console.log('previousIpldToNewIpld', previousIpldToNewIpld);
      console.log('previousIpldToNewIpld JSON', JSON.stringify(previousIpldToNewIpld));
    })();
  }

  public async makeFolderStorageDir(fileCatalogItem: IFileCatalogItem) {
    const breadcrumbs = await this.getFileCatalogItemsBreadcrumbs(fileCatalogItem.userId, fileCatalogItem.id);

    // breadcrumbs.push(fileCatalogItem);

    const {storageAccountId: userStaticId} = await this.database.getUser(fileCatalogItem.userId);

    const path = `/${userStaticId}/` + breadcrumbs.map(b => b.name).join('/') + '/';

    await this.storage.makeDir(path);

    return path;
  }

  public async makeFolderChildrenStorageDirsAndCopyFiles(fileCatalogItem, storageDirPath) {
    const fileCatalogChildrenFolders = await this.database.getFileCatalogItems(fileCatalogItem.userId, fileCatalogItem.id, FileCatalogItemType.Folder);

    console.log('makeFolderChildrenStorageDirsAndCopyFiles sPath', storageDirPath);
    console.log('fileCatalogChildrenFolders.length', fileCatalogChildrenFolders.length);
    await pIteration.forEachSeries(fileCatalogChildrenFolders, async (fItem: IFileCatalogItem) => {
      const sPath = await this.makeFolderStorageDir(fItem);
      return this.makeFolderChildrenStorageDirsAndCopyFiles(fItem, sPath)
    });

    const fileCatalogChildrenFiles = await this.database.getFileCatalogItems(fileCatalogItem.userId, fileCatalogItem.id, FileCatalogItemType.File);

    console.log('fileCatalogChildrenFiles.length', fileCatalogChildrenFiles.length);
    await pIteration.forEachSeries(fileCatalogChildrenFiles, async (fileCatalogItem: IFileCatalogItem) => {
      console.log('copy', storageDirPath + fileCatalogItem.name);
      await this.storage.copyFileFromId(fileCatalogItem.content.storageId, storageDirPath + fileCatalogItem.name);
    });
  }

  public async publishFolder(userId, fileCatalogId, options: {bindToStatic?} = {}) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    const fileCatalogItem = await this.database.getFileCatalogItem(fileCatalogId);

    const storageDirPath = await this.makeFolderStorageDir(fileCatalogItem);

    console.log('publishFolder storageDirPath', storageDirPath);
    await this.makeFolderChildrenStorageDirsAndCopyFiles(fileCatalogItem, storageDirPath);

    const storageId = await this.storage.getDirectoryId(storageDirPath);

    const user = await this.database.getUser(userId);

    if(!options.bindToStatic) {
      return { storageId };
    }

    const staticId = await this.createStorageAccount(user.name + '@directory:' + storageDirPath);
    await this.bindToStaticId(storageId, staticId);

    return {
      storageId,
      staticId
    }
  }

  public async findCatalogItemByPath(userId, path, type, createFoldersIfNotExists = false): Promise<{ foundCatalogItem: IFileCatalogItem, lastFolderId: number }> {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    const pathArr = _.trim(path, '/').split('/');
    const foldersArr = pathArr.slice(0, -1);
    const lastItemName = pathArr.slice(-1)[0];

    console.log('foldersArr', foldersArr);
    console.log('lastItemName', lastItemName);
    let currentFolderId = null;
    let breakSearch = false;
    await pIteration.forEachSeries(foldersArr, async (name) => {
      console.log('name', name, 'breakSearch', breakSearch, 'currentFolderId', currentFolderId);
      if (breakSearch) {
        return;
      }
      const foundItems = await this.database.getFileCatalogItems(userId, currentFolderId, FileCatalogItemType.Folder, name);

      if (foundItems.length) {
        currentFolderId = foundItems[0].id;
      } else if (createFoldersIfNotExists) {
        const newFileCatalogFolder = await this.database.addFileCatalogItem({
          name,
          userId,
          type: FileCatalogItemType.Folder,
          position: (await this.database.getFileCatalogItemsCount(userId, currentFolderId)) + 1,
          parentItemId: currentFolderId
        });
        currentFolderId = newFileCatalogFolder.id;
      } else {
        breakSearch = true;
      }
    });

    if (breakSearch) {
      return null;
    }

    const results = await this.database.getFileCatalogItems(userId, currentFolderId, type, lastItemName);
    if (results.length > 1) {
      await pIteration.forEach(results.slice(1), item => this.database.updateFileCatalogItem(item.id, {isDeleted: true}));
      console.log('remove excess file items: ', lastItemName);
    }

    console.log('lastFolderId', currentFolderId);
    return {
      lastFolderId: currentFolderId,
      foundCatalogItem: results[0]
    };
  }

  public async saveContentByPath(userId, path, contentId, options: { groupId? } = {}) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    const fileName = _.trim(path, '/').split('/').slice(-1)[0];
    console.log('saveContentByPath', 'path:', path, 'fileName:', fileName);

    let {foundCatalogItem: fileItem, lastFolderId} = await this.findCatalogItemByPath(userId, path, FileCatalogItemType.File, true);

    const content = await this.database.getContent(contentId);
    if (fileItem) {
      console.log('saveContentByPath', 'fileItem.name:', fileItem.name, contentId);
      await this.database.updateFileCatalogItem(fileItem.id, {contentId, size: content.size});
    } else {
      console.log('saveContentByPath', 'addFileCatalogItem', fileName, contentId);
      fileItem = await this.database.addFileCatalogItem({
        userId,
        contentId,
        name: fileName,
        type: FileCatalogItemType.File,
        position: (await this.database.getFileCatalogItemsCount(userId, lastFolderId)) + 1,
        parentItemId: lastFolderId,
        groupId: options.groupId,
        size: content.size
      });
    }
    if (fileItem.parentItemId) {
      const size = await this.database.getFileCatalogItemsSizeSum(fileItem.parentItemId);
      await this.database.updateFileCatalogItem(fileItem.parentItemId, {size});
    }
    return this.database.getFileCatalogItem(fileItem.id);
  }

  public async saveManifestsToFolder(userId, folderPath, toSaveList: ManifestToSave[], options: { groupId? } = {}) {
    await pIteration.map(toSaveList, async (item: ManifestToSave) => {
      const content = await this.createContentByRemoteStorageId(item.manifestStorageId, {
        userId,
        ...options
      });
      return this.saveContentByPath(userId, path.join(folderPath, item.path || content.name), content.id, options)
    });

    return this.getFileCatalogItemByPath(userId, folderPath, FileCatalogItemType.Folder);
  }

  public async getContentByPath(userId, path) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    const {foundCatalogItem: fileCatalogItem} = await this.findCatalogItemByPath(userId, path, FileCatalogItemType.File);
    return fileCatalogItem ? await this.database.getContent(fileCatalogItem.contentId) : null;
  }

  public async getFileCatalogItemByPath(userId, path, type: FileCatalogItemType) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    const {foundCatalogItem: fileCatalogItem} = await this.findCatalogItemByPath(userId, path, type);
    return fileCatalogItem;
  }

  public async deleteFileCatalogItem(userId, itemId, options: { deleteContent? } = {}) {
    await this.checkUserCan(userId, CorePermissionName.UserFileCatalogManagement);
    const fileCatalogItem = await this.database.getFileCatalogItem(itemId);
    if (fileCatalogItem.userId != userId) {
      throw new Error("not_permitted");
    }

    if(options.deleteContent) {
      const content = await this.database.getContent(fileCatalogItem.contentId);
      if (content.userId != userId) {
        throw new Error("not_permitted");
      }
      await this.storage.unPin(content.storageId).catch(() => {/*not pinned*/});
      await this.storage.remove(content.storageId).catch(() => {/*not found*/});

      await fileCatalogItem['destroy']();
      await content['destroy']();
    } else {
      await fileCatalogItem['destroy']();
    }

    return true;
  }

  /**
   ===========================================
   ETC ACTIONS
   ===========================================
   **/

  private detectType(storageId, fileName) {
    // const ext = _.last(fileName.split('.')).toLowerCase();
    return mime.getType(fileName) || ContentMimeType.Unknown;
  }

  async updateContentManifest(contentId) {
    return this.database.updateContent(contentId, {
      manifestStorageId: await this.generateAndSaveManifest('content', await this.database.getContent(contentId))
    });
  }

  private async generateAndSaveManifest(entityName, entityObj) {
    const manifestContent = await this.render.generateContent(entityName + '-manifest', entityObj);
    const hash = await this.saveDataStructure(manifestContent, {waitForStorage: true});
    console.log(entityName, hash, JSON.stringify(manifestContent, null, ' '));
    return hash;
  }

  getFileStream(filePath, options = {}) {
    return this.storage.getFileStream(filePath, options)
  }

  async getGroup(groupId) {
    groupId = await this.checkGroupId(groupId);
    return this.database.getGroup(groupId);
  }

  async getGroupByManifestId(groupId, staticId) {
    if (!staticId) {
      const historyItem = await this.database.getStaticIdItemByDynamicId(groupId);
      if (historyItem) {
        staticId = historyItem.staticId;
      }
    }
    return this.database.getGroupByManifestId(groupId, staticId);
  }

  async getCategoryByManifestId(groupId, staticId) {
    if (!staticId) {
      const historyItem = await this.database.getStaticIdItemByDynamicId(groupId);
      if (historyItem) {
        staticId = historyItem.staticId;
      }
    }
    return this.database.getCategoryByParams({
      manifestStaticStorageId: staticId
    });
  }

  async getGroupPosts(groupId, filters = {}, listParams?: IListParams) {
    return {
      list: await this.database.getGroupPosts(groupId, filters, listParams),
      total: await this.database.getGroupPostsCount(groupId, filters)
    };
  }

  async getCategoryPosts(categoryId, filters = {}, listParams?: IListParams) {
    return {
      list: await this.database.getCategoryPosts(categoryId, filters, listParams),
      total: await this.database.getCategoryPostsCount(categoryId, filters)
    };
  }

  getContent(contentId) {
    return this.database.getContent(contentId);
  }

  getContentByStorageId(storageId) {
    return this.database.getContentByStorageId(storageId);
  }

  async getDataStructure(storageId) {
    const dbObject = await this.database.getObjectByStorageId(storageId);
    if(dbObject) {
      return JSON.parse(dbObject.data);
    }
    return this.storage.getObject(storageId).then((result) => {
      this.database.addObject({storageId, data: JSON.stringify(result)}).catch(() => {/* already saved */});
      return result;
    });
  }

  async saveDataStructure(data, options: any = {}) {
    const storageId = await ipfsHelper.getIpldHashFromObject(data);

    await this.database.addObject({
      data: JSON.stringify(data),
      storageId
    }).catch(() => {/* already saved */});

    const storagePromise = this.storage.saveObject(data);
    if(options.waitForStorage) {
      await storagePromise;
    }

    return storageId;
  }

  async getAllUserList(adminId, searchString?, listParams?: IListParams) {
    if (!await this.database.isHaveCorePermission(adminId, CorePermissionName.AdminRead)) {
      throw new Error("not_permitted");
    }
    return {
      list: await this.database.getAllUserList(searchString, listParams),
      total: await this.database.getAllUserCount(searchString)
    }
  }

  async getAllGroupList(adminId, searchString?, listParams?: IListParams) {
    if (!await this.database.isHaveCorePermission(adminId, CorePermissionName.AdminRead)) {
      throw new Error("not_permitted");
    }
    return {
      list: await this.database.getAllGroupList(searchString, listParams),
      total: await this.database.getAllGroupCount(searchString)
    };
  }

  async getAllContentList(adminId, searchString?, listParams?: IListParams) {
    if (!await this.database.isHaveCorePermission(adminId, CorePermissionName.AdminRead)) {
      throw new Error("not_permitted");
    }
    return {
      list: await this.database.getAllContentList(searchString, listParams),
      total: await this.database.getAllContentCount(searchString)
    }
  }

  async getUserLimit(adminId, userId, limitName) {
    if (!await this.database.isHaveCorePermission(adminId, CorePermissionName.AdminRead)) {
      throw new Error("not_permitted");
    }
    return this.database.getUserLimit(userId, limitName);
  }

  async isUserCan(userId, permission) {
    const userCanAll = await this.database.isHaveCorePermission(userId, CorePermissionName.UserAll);
    if (userCanAll) {
      return true;
    }
    return this.database.isHaveCorePermission(userId, permission);
  }

  async checkUserCan(userId, permission) {
    const userCanAll = await this.database.isHaveCorePermission(userId, CorePermissionName.UserAll);
    if (userCanAll) {
      return;
    }
    if (!await this.database.isHaveCorePermission(userId, permission)) {
      throw new Error("not_permitted");
    }
  }

  runSeeds() {
    return require('./seeds')(this);
  }

  async getPeers(topic) {
    const peers = await this.storage.getPeers(topic);
    return {
      count: peers.length,
      list: peers
    }
  }

  async getIpnsPeers(ipnsId) {
    const peers = await this.storage.getIpnsPeers(ipnsId);
    return {
      count: peers.length,
      list: peers
    }
  }

  checkStorageId(storageId) {
    if (ipfsHelper.isCid(storageId)) {
      storageId = ipfsHelper.cidToHash(storageId);
    }

    if (storageId['/']) {
      storageId = storageId['/'];
    }

    return storageId;
  }

  async createStorageAccount(name) {
    // const existsAccountId = await this.storage.getAccountIdByName(name);
    // TODO: use it in future for public nodes
    // if(existsAccountId) {
    //   throw "already_exists";
    // }
    const nameIpfsHash = await ipfsHelper.getIpfsHashFromString(name);
    console.log('createStorageAccount', name, nameIpfsHash);
    const storageAccountId = await this.storage.createAccountIfNotExists(nameIpfsHash);

    this.storage.getAccountPublicKey(storageAccountId).then(publicKey => {
      return this.database.setStaticIdPublicKey(storageAccountId, bs58.encode(publicKey)).catch(() => {
        /*dont do anything*/
      });
    }).catch(e => {
      console.warn('error public key caching', e);
    });
    return storageAccountId;
  }

  async resolveStaticId(staticId): Promise<any> {
    this.storage.resolveStaticIdEntry(staticId).then(entry => {
      return this.database.setStaticIdPublicKey(staticId, bs58.encode(entry.pubKey)).catch(() => {
        /* already added */
      });
    }).catch(() => {});

    return new Promise(async (resolve, reject) => {
      let alreadyHandled = false;

      const staticIdItem = await this.database.getActualStaticIdItem(staticId);

      setTimeout(() => {
        if(staticIdItem && staticIdItem.dynamicId && !alreadyHandled) {
          alreadyHandled = true;
          resolve(staticIdItem.dynamicId);
        }
      }, 1000);

      let dynamicId;
      try {
        setTimeout(async () => {
          const staticIdItem = await this.database.getActualStaticIdItem(staticId);
          if (staticIdItem) {
            alreadyHandled = true;
            resolve(staticIdItem.dynamicId);
          } else {
            resolve(null);
          }
        }, 1000);
        dynamicId = await this.storage.resolveStaticId(staticId);
      } catch (err) {
        const staticIdItem = await this.database.getActualStaticIdItem(staticId);
        if (staticIdItem) {
          alreadyHandled = true;
          return resolve(staticIdItem.dynamicId);
        } else {
          throw (err);
        }
      }

      try {
        await this.database.addStaticIdHistoryItem({
          staticId: staticId,
          dynamicId: dynamicId,
          isActive: true,
          boundAt: new Date()
        });
        alreadyHandled = true;
        return resolve(dynamicId);
      } catch (e) {
        const staticIdItem = await this.database.getActualStaticIdItem(staticId);
        alreadyHandled = true;
        return resolve(staticIdItem.dynamicId);
      }
    });
  }

  async stop() {
    await this.storage.node.stop();
    await this.api.close();
  }
}
