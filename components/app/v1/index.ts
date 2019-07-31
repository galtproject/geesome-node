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
  GroupType,
  GroupView,
  ContentMimeType,
  PostStatus,
  ContentView,
  IPost,
  IFileCatalogItemType,
  IContent,
  IUser,
  ContentStorageType,
  UserContentActionName,
  UserLimitName,
  IUserLimit,
  CorePermissionName, IGroup
} from "../../database/interface";
import {IGeesomeApp} from "../interface";
import {IStorage} from "../../storage/interface";
import {IRender} from "../../render/interface";
import {DriverInput, IDriver} from "../../drivers/interface";
import {GeesomeEmitter} from "./events";

const commonHelper = require('@galtproject/geesome-libs/src/common');
const ipfsHelper = require('@galtproject/geesome-libs/src/ipfsHelper');
const detecterHelper = require('@galtproject/geesome-libs/src/detecter');
let config = require('./config');
const appCron = require('./cron');
const appEvents = require('./events');
const appListener = require('./listener');
const _ = require('lodash');
const request = require('request');
const fs = require('fs');
const xkcdPassword = require('xkcd-password')();
const uuidAPIKey = require('uuid-apikey');
const bcrypt = require('bcrypt');
const mime = require('mime');
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
          passwordHash,
          name,
          email
        });
        resolve(newUser as any);
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
    groupData.userId = userId;
    groupData.storageAccountId = await this.storage.createAccountIfNotExists(groupData['name']);
    groupData.manifestStaticStorageId = groupData.storageAccountId;

    const group = await this.database.addGroup(groupData);

    await this.database.addAdminToGroup(userId, group.id);

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
    const groupFields = ['manifestStaticStorageId', 'manifestStorageId', 'name', 'title', 'view', 'isPublic', 'isRemote', 'description', 'size'];
    const dbGroup = await this.database.addGroup(_.extend(_.pick(groupObject, groupFields), {
      avatarImageId: dbAvatar ? dbAvatar.id : null,
      coverImageId: dbCover ? dbCover.id : null
    }));

    if (dbGroup.isRemote) {
      this.events.emit(this.events.NewRemoteGroup, dbGroup);
    }
    return dbGroup;
  }

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

    const post = await this.database.addPost(postData);

    let size = await this.database.getPostSizeSum(post.id);
    await this.database.updatePost(post.id, {size});

    await this.database.setPostContents(post.id, contentsIds);
    await this.updatePostManifest(post.id);

    return this.database.getPost(post.id);
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

  async getPreview(storageId, fullType, source?) {
    let type;
    if (source) {
      if (detecterHelper.isYoutubeUrl(source)) {
        type = 'youtube-thumbnail';
      }
    }
    if (!type) {
      type = fullType.split('/')[0];
    }
    const extension = fullType.split('/')[1];

    const previewDriver = this.drivers.preview[type] as IDriver;
    if (!previewDriver) {
      return {};
    }
    try {
      if (previewDriver.supportedInputs[0] === DriverInput.Stream) {
        const inputStream = await this.storage.getFileStream(storageId);
        const {stream: resultStream, type, extension: resultExtension} = await previewDriver.processByStream(inputStream, {extension});
        const storageFile = await this.storage.saveFileByData(resultStream);
        return {
          previewStorageId: storageFile.id,
          previewType: type,
          previewExtension: resultExtension
        };
      } else if (previewDriver.supportedInputs[0] === DriverInput.Content) {
        const data = await this.storage.getFileData(storageId);
        const {content: resultData, type, extension: resultExtension} = await previewDriver.processByContent(data, {extension});
        const storageFile = await this.storage.saveFileByData(resultData);
        return {
          previewStorageId: storageFile.id,
          previewType: type,
          previewExtension: resultExtension
        };
      } else if (previewDriver.supportedInputs[0] === DriverInput.Source) {
        const {content: resultData, path, extension: resultExtension, type} = await previewDriver.processBySource(source, {});
        console.log('path', path);
        let storageFile;
        if (path) {
          storageFile = await this.storage.saveFileByPath(path);
        } else {
          storageFile = await this.storage.saveFileByData(resultData);
        }

        return {
          previewStorageId: storageFile.id,
          previewType: type,
          previewExtension: resultExtension
        };
      }
    } catch (e) {
      return {};
    }
    throw new Error(type + "_preview_driver_input_not_found");
  }

  async saveData(fileStream, fileName, options: { userId, groupId, apiKey?, folderId? }) {
    const extension = (fileName || '').split('.').length > 1 ? _.last(fileName.split('.')) : null;
    const {resultFile: storageFile, resultMimeType: type, resultExtension} = await this.saveFileByStream(options.userId, fileStream, mime.getType(fileName), extension);

    const existsContent = await this.database.getContentByStorageId(storageFile.id);
    if (existsContent) {
      await this.addContentToUserFileCatalog(options.userId, existsContent, options);
      return existsContent;
    }

    let {previewStorageId, previewType, previewExtension} = await this.getPreview(storageFile.id, type);

    return this.addContent({
      previewStorageId,
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
      const {resultFile, resultMimeType, resultExtension} = await new Promise((resolve, reject) => {
        request.get(url).on('response', (responseStream) => {
          const {statusCode} = responseStream;
          if (statusCode !== 200) {
            return reject();
          }
          const contentType = responseStream.headers['content-type'];
          resolve(this.saveFileByStream(options.userId, responseStream.client, contentType || mime.getType(name), extension))
        })
      }) as any;
      type = resultMimeType;
      storageFile = resultFile;
      extension = resultExtension;
    }

    const existsContent = await this.database.getContentByStorageId(storageFile.id);
    if (existsContent) {
      await this.addContentToUserFileCatalog(options.userId, existsContent, options);
      return existsContent;
    }

    let {previewStorageId, previewType, previewExtension} = await this.getPreview(storageFile.id, type, url);

    return this.addContent({
      previewStorageId,
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

    return {
      resultFile: await this.storage.saveFileByData(stream),
      resultMimeType: mimeType,
      resultExtension: extension
    };
  }

  private async getUserLimitRemained(userId, limitName: UserLimitName) {
    const limit = await this.database.getUserLimit(userId, limitName);
    console.log('limit', limit);
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

  async handleSourceByUploadDriver(sourceLink, driver) {
    const previewDriver = this.drivers.upload[driver] as IDriver;
    if (!previewDriver) {
      throw new Error(driver + "_upload_driver_not_found");
    }
    if (!_.includes(previewDriver.supportedInputs, DriverInput.Source)) {
      throw new Error(driver + "_upload_driver_input_not_correct");
    }
    return previewDriver.processBySource(sourceLink, {});
  }

  async updatePostManifest(postId) {
    const post = await this.database.getPost(postId);

    await this.database.updatePost(postId, {
      manifestStorageId: await this.generateAndSaveManifest('post', post)
    });

    return this.updateGroupManifest(post.groupId);
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

  async updateContentManifest(contentId) {
    return this.database.updateContent(contentId, {
      manifestStorageId: await this.generateAndSaveManifest('content', await this.database.getContent(contentId))
    });
  }

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

  getMemberInGroups(userId) {
    return this.database.getMemberInGroups(userId)
  }

  getAdminInGroups(userId) {
    return this.database.getAdminInGroups(userId)
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

  getGroupPosts(groupId, sortDir, limit, offset) {
    return this.database.getGroupPosts(groupId, sortDir, limit, offset)
  }

  getContent(contentId) {
    return this.database.getContent(contentId);
  }

  getDataStructure(dataId) {
    return this.storage.getObject(dataId);
  }


  async getFileCatalogItems(userId, parentItemId, type?, sortField?, sortDir?, limit?, offset?) {
    if (!parentItemId)
      parentItemId = null;
    if (!sortField)
      sortField = 'createdAt';
    if (!sortDir)
      sortDir = 'desc';
    if (!limit)
      limit = 20;
    if (!offset)
      offset = 0;
    return {
      list: await this.database.getFileCatalogItems(userId, parentItemId, type, sortField, sortDir, limit, offset),
      total: await this.database.getFileCatalogItemsCount(userId, parentItemId, type)
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

  async getAllUserList(adminId, searchString?, sortField?, sortDir?, limit?, offset?) {
    if (!await this.database.isHaveCorePermission(adminId, CorePermissionName.AdminRead)) {
      throw new Error("not_permitted");
    }
    if (!sortField)
      sortField = 'createdAt';
    if (!sortDir)
      sortDir = 'desc';
    if (!limit)
      limit = 20;
    if (!offset)
      offset = 0;
    return this.database.getAllUserList(searchString, sortField, sortDir, limit, offset);
  }

  async getAllGroupList(adminId, searchString?, sortField?, sortDir?, limit?, offset?) {
    if (!await this.database.isHaveCorePermission(adminId, CorePermissionName.AdminRead)) {
      throw new Error("not_permitted");
    }
    if (!sortField)
      sortField = 'createdAt';
    if (!sortDir)
      sortDir = 'desc';
    if (!limit)
      limit = 20;
    if (!offset)
      offset = 0;
    return this.database.getAllGroupList(searchString, sortField, sortDir, limit, offset);
  }

  async getAllContentList(adminId, searchString?, sortField?, sortDir?, limit?, offset?) {
    if (!await this.database.isHaveCorePermission(adminId, CorePermissionName.AdminRead)) {
      throw new Error("not_permitted");
    }
    if (!sortField)
      sortField = 'createdAt';
    if (!sortDir)
      sortDir = 'desc';
    if (!limit)
      limit = 20;
    if (!offset)
      offset = 0;
    return this.database.getAllContentList(searchString, sortField, sortDir, limit, offset);
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
