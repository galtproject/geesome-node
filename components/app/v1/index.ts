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
  IDatabase,
  ContentMimeType,
  PostStatus,
  ContentView,
  IPost,
  IFileCatalogItemType,
  IContent,
  ContentStorageType,
  UserContentActionName,
  UserLimitName,
  IUserLimit,
  CorePermissionName, IGroup, IListParams, IUser, GroupType, GroupView
} from "../../database/interface";
import {IGeesomeApp} from "../interface";
import {IStorage} from "../../storage/interface";
import {IRender} from "../../render/interface";
import {DriverInput, OutputSize} from "../../drivers/interface";
import {GeesomeEmitter} from "./events";
import AbstractDriver from "../../drivers/abstractDriver";

const commonHelper = require('@galtproject/geesome-libs/src/common');
const ipfsHelper = require('@galtproject/geesome-libs/src/ipfsHelper');
const detecterHelper = require('@galtproject/geesome-libs/src/detecter');
const { getPersonalChatHash } = require('@galtproject/geesome-libs/src/name');
let config = require('./config');
const appCron = require('./cron');
const appEvents = require('./events');
const appListener = require('./listener');
const _ = require('lodash');
const fs = require('fs');
const xkcdPassword = require('xkcd-password')();
const uuidAPIKey = require('uuid-apikey');
const bcrypt = require('bcrypt');
const mime = require('mime');
const axios = require('axios');
const Transform = require('stream').Transform;
const saltRounds = 10;

module.exports = async (extendConfig) => {
  config = _.merge(config, extendConfig || {});
  console.log('config', config);
  const app = new GeesomeApp(config);

  app.config.storageConfig.jsNode.pass = await app.getSecretKey('js-ipfs');

  console.log('Start storage...');
  app.storage = await require('../../storage/' + config.storageModule)(app);

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

  await appCron(app);
  await appListener(app);

  console.log('Start api...');
  require('../../api/' + config.apiModule)(app, process.env.PORT || 7711);

  return app;
};

class GeesomeApp implements IGeesomeApp {
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

  async registerUser(email, name, password): Promise<any> {
    const existUserWithName = await this.database.getUserByName(name);
    if (existUserWithName) {
      throw new Error("username_already_exists");
    }

    const storageAccountId = await this.storage.createAccountIfNotExists(name);

    return new Promise((resolve, reject) => {
      bcrypt.hash(password, saltRounds, async (err, passwordHash) => {
        const newUser = await this.database.addUser({
          storageAccountId,
          manifestStaticStorageId: storageAccountId,
          passwordHash,
          name,
          email
        });

        const manifestStorageId = await this.generateAndSaveManifest('user', newUser);

        await this.storage.bindToStaticId(manifestStorageId, newUser.manifestStaticStorageId);

        await this.database.updateUser(newUser.id, {
          manifestStorageId
        });
        
        resolve((await this.database.getUser(newUser.id)) as any);
      });
    });
  }

  async loginUser(usernameOrEmail, password): Promise<any> {
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

  async updateUser(userId, updateData) {
    await this.database.updateUser(userId, updateData);

    const user = await this.database.getUser(userId);
    
    // TODO: remove on update old version node users
    if(!user.manifestStaticStorageId && user.storageAccountId) {
      await this.database.updateUser(userId, {
        manifestStaticStorageId: user.storageAccountId
      });
      user.manifestStaticStorageId = user.storageAccountId;
    }

    const manifestStorageId = await this.generateAndSaveManifest('user', user);

    if (manifestStorageId != user.manifestStorageId) {
      await this.storage.bindToStaticId(manifestStorageId, user.manifestStaticStorageId);

      await this.database.updateUser(userId, {
        manifestStorageId
      });
    }
    
    return this.database.getUser(userId);
  }
  
  async addUserFriendById(userId, friendId) {
    friendId = await this.checkUserId(friendId, true);

    const user = await this.database.getUser(userId);
    const friend = await this.database.getUser(friendId);
    
    const group = await this.createGroup(userId, {
      name: (user.name + "_" + friend.name).replace(/[\W_]+/g,"_"),
      type: GroupType.PersonalChat,
      theme: 'default',
      title: friend.title,
      storageId: friend.manifestStorageId,
      staticStorageId: friend.manifestStaticStorageId,
      avatarImageId: friend.avatarImageId,
      view: GroupView.TelegramLike
    });

    await this.database.addMemberToGroup(userId, group.id);
    await this.database.addAdminToGroup(userId, group.id);
    
    return this.database.addUserFriend(userId, friendId);
  }

  async removeUserFriendById(userId, friendId) {
    friendId = await this.checkUserId(friendId, true);
    
    // TODO: remove personal chat group?

    return this.database.removeUserFriend(userId, friendId);
  }
  
  async getUserFriends(userId, search?, listParams?: IListParams) {
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

  async generateUserApiKey(userId, type?) {
    const generated = uuidAPIKey.create();

    await this.database.addApiKey({
      type,
      userId,
      valueHash: generated.uuid
    });

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
    return {
      list: await this.database.getApiKeysByUser(userId, isDisabled, search, listParams),
      total: await this.database.getApiKeysCountByUser(userId, isDisabled, search)
    };
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

  getMemberInGroups(userId, types) {
    return this.database.getMemberInGroups(userId, types)
  }

  getAdminInGroups(userId, types) {
    return this.database.getAdminInGroups(userId, types)
  }

  getPersonalChatGroups(userId) {
    return this.database.getCreatorInGroupsByType(userId, GroupType.PersonalChat);
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

  async canCreatePostInGroup(userId, groupId) {
    if (!groupId) {
      return false;
    }
    groupId = await this.checkGroupId(groupId);
    return this.database.isAdminInGroup(userId, groupId);
  }

  async createGroup(userId, groupData) {
    groupData.creatorId = userId;
    
    groupData.manifestStaticStorageId = await this.storage.createAccountIfNotExists(groupData['name']);
    if(groupData.type !== GroupType.PersonalChat) {
      groupData.staticStorageId = groupData.manifestStaticStorageId;
    }

    const group = await this.database.addGroup(groupData);

    if(groupData.type !== GroupType.PersonalChat) {
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

  async addMemberToGroup(userId, groupId) {
    groupId = await this.checkGroupId(groupId);
    await this.database.addMemberToGroup(userId, groupId);
  }

  async removeMemberFromGroup(userId, groupId) {
    groupId = await this.checkGroupId(groupId);
    await this.database.removeMemberFromGroup(userId, groupId);
  }

  async addAdminToGroup(userId, groupId) {
    groupId = await this.checkGroupId(groupId);
    await this.database.addAdminToGroup(userId, groupId);
  }

  async removeAdminFromGroup(userId, groupId) {
    groupId = await this.checkGroupId(groupId);
    await this.database.removeAdminFromGroup(userId, groupId);
  }

  async updateGroup(userId, groupId, updateData) {
    groupId = await this.checkGroupId(groupId);
    if (!(await this.canEditGroup(userId, groupId))) {
      throw new Error("not_permitted");
    }
    await this.database.updateGroup(groupId, updateData);

    await this.updateGroupManifest(groupId);

    return this.database.getGroup(groupId);
  }

  async createPost(userId, postData) {
    postData.userId = userId;
    postData.groupId = await this.checkGroupId(postData.groupId);

    if (postData.status === PostStatus.Published) {
      postData.localId = await this.getPostLocalId(postData);
      postData.publishedAt = new Date();
    }

    const contentsIds = postData.contentsIds;
    delete postData.contentsIds;
    
    const user = await this.database.getUser(userId);
    postData.authorStaticStorageId = user.manifestStaticStorageId;

    let post = await this.database.addPost(postData);

    let size = await this.database.getPostSizeSum(post.id);
    await this.database.updatePost(post.id, {size});

    await this.database.setPostContents(post.id, contentsIds);
    await this.updatePostManifest(post.id);
    
    post = await this.database.getPost(post.id);
    
    const group = await this.database.getGroup(postData.groupId);
    if(group.type === GroupType.PersonalChat) {
      //TODO: encrypt by pgp
      await this.storage.publishEventByIpnsId(user.manifestStaticStorageId, getPersonalChatHash([user.manifestStaticStorageId, group.staticStorageId], group.theme), {
        type: 'new_post',
        postIpld: post.manifestStorageId,
        groupIpld: group.manifestStaticStorageId
      });
    }

    return post;
  }

  async updatePost(userId, postId, postData) {
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

      await this.storage.bindToStaticId(manifestStorageId, group.manifestStaticStorageId);
    }

    return this.database.updateGroup(groupId, {
      manifestStorageId,
      storageUpdatedAt,
      staticStorageUpdatedAt
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
  
  /**
   ===========================================
   CONTENT ACTIONS
   ===========================================
   **/

  async createContentByObject(contentObject) {
    const storageId = contentObject.manifestStaticStorageId || contentObject.manifestStorageId;
    if (!storageId) {
      return null;
    }
    let dbContent = await this.database.getContentByStorageId(storageId);
    if (dbContent) {
      return dbContent;
    }
    return null;
  }
  
  checkStorageId(storageId) {
    if (ipfsHelper.isCid(storageId)) {
      storageId = ipfsHelper.cidToHash(storageId);
    }
    return storageId;
  }

  async getPreview(storageId, fullType, source?) {
    let previewDriverName;
    if (source) {
      if (detecterHelper.isYoutubeUrl(source)) {
        previewDriverName = 'youtube-thumbnail';
      }
    }
    //TODO: detect more video types
    if(_.endsWith(fullType, 'mp4') || _.endsWith(fullType, 'avi') || _.endsWith(fullType, 'mov') || _.endsWith(fullType, 'quicktime')) {
      previewDriverName = 'video-thumbnail';
    }
    console.log('previewDriverName', previewDriverName, fullType);
    if (!previewDriverName) {
      previewDriverName = fullType.split('/')[0];
    }
    const extension = fullType.split('/')[1];

    const previewDriver = this.drivers.preview[previewDriverName] as AbstractDriver;
    if (!previewDriver) {
      return {};
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
      let error = null;
      options.onError = (err) => {
        error = err;
      };
      const {stream: resultStream, type, extension} = await previewDriver.processByStream(inputStream, options);

      const content = await this.storage.saveFileByData(resultStream);
      return error ? reject(error) : resolve({ content, type, extension });
    });
  }

  async saveData(fileStream, fileName, options: { userId, groupId, apiKey?, folderId?, mimeType? }) {
    const extension = (fileName || '').split('.').length > 1 ? _.last((fileName || '').split('.')) : null;
    const {resultFile: storageFile, resultMimeType: type, resultExtension} = await this.saveFileByStream(options.userId, fileStream, options.mimeType || mime.getType(fileName), extension);

    let existsContent = await this.database.getContentByStorageId(storageFile.id);
    if (existsContent) {
      console.log(`Content ${storageFile.id} already exists in database, check preview and folder placement`);
      await this.setContentPreviewifNotExist(existsContent);
      await this.addContentToUserFileCatalog(options.userId, existsContent, options);
      return existsContent;
    }

    let {mediumPreviewStorageId, mediumPreviewSize, smallPreviewStorageId, smallPreviewSize, largePreviewStorageId, largePreviewSize, previewType, previewExtension} = await this.getPreview(storageFile.id, type);

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

  async saveDataByUrl(url, options: { userId, groupId, driver?, apiKey?, folderId? }) {
    const name = _.last(url.split('/'));
    let extension = name.split('.').length > 1 ? _.last(name.split('.')) : null;
    let type;

    let storageFile;
    if (options.driver && options.driver != 'none') {
      const dataToSave = await this.handleSourceByUploadDriver(url, options.driver);
      type = dataToSave.type;
      const {resultFile, resultMimeType, resultExtension} = await this.saveFileByStream(options.userId, dataToSave.stream, type, extension);
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
        return this.saveFileByStream(options.userId, data, headers['content-type'] || mime.getType(name), extension);
      });
      console.log('resultFile, resultMimeType, resultExtension', resultFile, resultMimeType, resultExtension);
      type = resultMimeType;
      storageFile = resultFile;
      extension = resultExtension;
    }

    const existsContent = await this.database.getContentByStorageId(storageFile.id);
    if (existsContent) {
      await this.setContentPreviewifNotExist(existsContent);
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
  
  async setContentPreviewifNotExist(content) {
    if(content.mediumPreviewStorageId && content.previewMimeType) {
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

  private async saveFileByStream(userId, stream, mimeType, extension?) {
    // console.log('saveFileByStream', userId, stream, mimeType, extension);
    //TODO: find out best approach to stream videos
    // if(_.startsWith(mimeType, 'video')) {
    //     stream = this.drivers.convert['video-to-streamable'].processByStream(stream, {
    //         extension: _.last(mimeType.split('/'))
    //     });
    //     mimeType = 'application/vnd.apple.mpegurl';
    // }

    const sizeRemained = await this.getUserLimitRemained(userId, UserLimitName.SaveContentSize);

    if (sizeRemained !== null) {
      console.log('sizeRemained', sizeRemained);
      let streamSize = 0;
      const sizeCheckStream = new Transform({
        transform: function (chunk, encoding, callback) {
          streamSize += chunk.length;
          console.log('streamSize', streamSize);
          if (streamSize > sizeRemained) {
            console.error("limit_reached for user", userId);
            callback("limit_reached", null)
          } else {
            callback(false, chunk);
          }
        }
      });
      stream = stream.pipe(sizeCheckStream);
    }

    // console.log('stream.pipe(sizeCheckStream)', stream.pipe(sizeCheckStream));
    // console.log('sizeCheckStream.pipe(stream)', sizeCheckStream.pipe(stream));

    const resultFile = await this.storage.saveFileByData(stream);
    console.log('resultFile', resultFile);
    return {
      resultFile: resultFile,
      resultMimeType: mimeType,
      resultExtension: extension
    };
  }

  private async getUserLimitRemained(userId, limitName: UserLimitName) {
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

  private async addContent(contentData: IContent, options: { groupId, userId, apiKey? }) {
    const groupId = await this.checkGroupId(options.groupId);
    let group;
    if (groupId) {
      contentData.groupId = groupId;
      group = await this.database.getGroup(groupId);
    }
    contentData.isPublic = group && group.isPublic;

    const content = await this.database.addContent(contentData);

    await this.addContentToUserFileCatalog(content.userId, content, options);

    await this.database.addUserContentAction({
      name: UserContentActionName.Upload,
      userId: content.userId,
      size: content.size,
      contentId: content.id,
      apiKey: options.apiKey
    });

    console.log('updateContentManifest', content);

    await this.updateContentManifest(content.id);

    return content;
  }

  async handleSourceByUploadDriver(sourceLink, driver) {
    const previewDriver = this.drivers.upload[driver] as AbstractDriver;
    if (!previewDriver) {
      throw new Error(driver + "_upload_driver_not_found");
    }
    if (!_.includes(previewDriver.supportedInputs, DriverInput.Source)) {
      throw new Error(driver + "_upload_driver_input_not_correct");
    }
    return previewDriver.processBySource(sourceLink, {});
  }
  
  /**
   ===========================================
   FILE CATALOG ACTIONS
   ===========================================
   **/

  public async addContentToFolder(userId, contentId, folderId) {
    const content = await this.database.getContent(contentId);
    return this.addContentToUserFileCatalog(userId, content, {folderId})
  }

  private async addContentToUserFileCatalog(userId, content: IContent, options: { groupId?, apiKey?, folderId? }) {
    const baseType = _.first(content.mimeType.split('/'));

    let parentItemId = options.folderId;
    if (_.isUndefined(parentItemId) || parentItemId === 'undefined') {
      const contentFiles = await this.database.getFileCatalogItemsByContent(userId, content.id, IFileCatalogItemType.File);
      if (contentFiles.length) {
        return content;
      }

      let folder = await this.database.getFileCatalogItemByDefaultFolderFor(userId, baseType);

      if (!folder) {
        folder = await this.database.addFileCatalogItem({
          name: _.upperFirst(baseType) + " Uploads",
          type: IFileCatalogItemType.Folder,
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
    
    if(await this.database.isFileCatalogItemExistWithContent(userId, parentItemId, content.id)) {
      console.log(`Content ${content.id} already exists in folder`);
      return;
    }

    const groupId = (await this.checkGroupId(options.groupId)) || null;

    const resultItem = await this.database.addFileCatalogItem({
      name: content.name || "Unnamed " + new Date().toISOString(),
      type: IFileCatalogItemType.File,
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
    return this.database.addFileCatalogItem({
      name: folderName,
      type: IFileCatalogItemType.Folder,
      position: (await this.database.getFileCatalogItemsCount(userId, parentItemId)) + 1,
      size: 0,
      parentItemId,
      userId
    });
  }

  public async updateFileCatalogItem(userId, fileCatalogId, updateData) {
    const fileCatalogItem = await this.database.getFileCatalogItem(fileCatalogId);
    if (fileCatalogItem.userId !== userId) {
      throw new Error("not_permitted");
    }
    await this.database.updateFileCatalogItem(fileCatalogId, updateData);
    return this.database.getFileCatalogItem(fileCatalogId);
  }

  async updateContentManifest(contentId) {
    return this.database.updateContent(contentId, {
      manifestStorageId: await this.generateAndSaveManifest('content', await this.database.getContent(contentId))
    });
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

  private async generateAndSaveManifest(entityName, entityObj) {
    const manifestContent = await this.render.generateContent(entityName + '-manifest', entityObj);
    const hash = await this.storage.saveObject(manifestContent);
    console.log(entityName, hash, JSON.stringify(manifestContent, null, ' '));
    return hash;
  }

  getFileStream(filePath) {
    return this.storage.getFileStream(filePath)
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

  getGroupPosts(groupId, listParams?: IListParams) {
    return this.database.getGroupPosts(groupId, listParams)
  }

  getContent(contentId) {
    return this.database.getContent(contentId);
  }

  getDataStructure(dataId) {
    return this.storage.getObject(dataId);
  }

  async getFileCatalogItems(userId, parentItemId, type?, search = '', listParams?: IListParams) {
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
    const item = await this.database.getFileCatalogItem(itemId);
    if (item.userId != userId) {
      throw new Error("not_permitted");
    }

    return this.database.getFileCatalogItemsBreadcrumbs(itemId);
  }

  async getContentsIdsByFileCatalogIds(catalogIds) {
    return this.database.getContentsIdsByFileCatalogIds(catalogIds);
  }

  async getAllUserList(adminId, searchString?, listParams?: IListParams) {
    if (!await this.database.isHaveCorePermission(adminId, CorePermissionName.AdminRead)) {
      throw new Error("not_permitted");
    }
    return this.database.getAllUserList(searchString, listParams);
  }

  async getAllGroupList(adminId, searchString?, listParams?: IListParams) {
    if (!await this.database.isHaveCorePermission(adminId, CorePermissionName.AdminRead)) {
      throw new Error("not_permitted");
    }
    return this.database.getAllGroupList(searchString, listParams);
  }

  async getAllContentList(adminId, searchString?, listParams?: IListParams) {
    if (!await this.database.isHaveCorePermission(adminId, CorePermissionName.AdminRead)) {
      throw new Error("not_permitted");
    }
    return this.database.getAllContentList(searchString, listParams);
  }

  async getUserLimit(adminId, userId, limitName) {
    if (!await this.database.isHaveCorePermission(adminId, CorePermissionName.AdminRead)) {
      throw new Error("not_permitted");
    }
    return this.database.getUserLimit(userId, limitName);
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

  async resolveStaticId(staticId) {
    return this.storage.resolveStaticId(staticId).then(async (dynamicId) => {
      try {
        await this.database.addStaticIdHistoryItem({
          staticId: staticId,
          dynamicId: dynamicId,
          isActive: true,
          boundAt: new Date()
        });
        return dynamicId;
      } catch (e) {
        const staticIdItem = await this.database.getActualStaticIdItem(staticId);
        return staticIdItem.dynamicId
      }
    }).catch(async (err) => {
      const staticIdItem = await this.database.getActualStaticIdItem(staticId);
      if (staticIdItem) {
        return staticIdItem.dynamicId;
      } else {
        throw (err);
      }
    })
  }
}
