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
import {Sequelize, Op, Transaction} from "sequelize";
import expressSession from 'express-session';
import expressSessionSequelize from 'express-session-sequelize';
import {IGeesomeApp} from "../../interface.js";
import config from './config.js';
import {
  ContentDeleteSafetyBlockerScope,
  IContent,
  IContentDeleteSafetyBlocker,
  IGeesomeDatabaseModule,
  IListParams,
  IListParamsOptions,
  IObject,
  IStorageSpaceSnapshotData,
  IUser,
  IUserApiKey,
  IUserContentAction,
  IUserLimit,
  UserContentActionName,
  UserLimitName
} from "./interface.js";
import {countDerivedStorageIdReferences} from './storageReferenceHelpers.js';
import * as storageSpaceUsage from './storageSpaceUsageHelpers.js';
const {merge, isUndefined} = _;
const log = debug('geesome:app:database');
const SessionStore = expressSessionSequelize(expressSession.Store);
const maxListLimit = 10000;
const apiKeyListParams: IListParamsOptions = {
  sortBy: 'createdAt',
  allowedSortBy: ['createdAt', 'updatedAt', 'id', 'title', 'expiredOn', 'isDisabled'],
  maxLimit: 100
};
const adminUserListParams: IListParamsOptions = {
  sortBy: 'createdAt',
  allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'email', 'storageAccountId'],
  maxLimit: 100
};
const userFriendListParams: IListParamsOptions = {
  sortBy: 'createdAt',
  allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'email', 'storageAccountId'],
  maxLimit: 100
};
const adminContentListParams: IListParamsOptions = {
  sortBy: 'createdAt',
  allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'storageId', 'manifestStorageId', 'size'],
  maxLimit: 100
};
const storageSpaceListParams: IListParamsOptions = {
  limit: 20,
  maxLimit: 100
};
const storageSpaceSnapshotQueueModuleName = 'storage-space-snapshot';
const storageSpaceSnapshotQueueKickBatchLimit = parsePositiveInteger(process.env.STORAGE_SPACE_SNAPSHOT_QUEUE_KICK_BATCH_LIMIT, 1);

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value as any, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value as any, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function sanitizeSortBy(value, fallback, allowedSortBy?: string[]) {
  const fallbackSortBy = allowedSortBy?.includes(fallback) || !allowedSortBy?.length ? fallback : allowedSortBy[0];
  if (typeof value !== 'string') {
    return fallbackSortBy;
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    return fallbackSortBy;
  }
  if (allowedSortBy?.length && !allowedSortBy.includes(value)) {
    return fallbackSortBy;
  }
  return value;
}

function sanitizeSortDir(value, fallback) {
  const sortDir = typeof value === 'string' ? value.toUpperCase() : fallback.toUpperCase();
  if (sortDir !== 'ASC' && sortDir !== 'DESC') {
    return fallback.toUpperCase();
  }
  return sortDir;
}

function getListLimitCap(defaultParams: IListParamsOptions) {
  const cap = parseNonNegativeInteger(defaultParams.maxLimit, maxListLimit);
  return Math.min(cap, maxListLimit);
}

export default async function (app: IGeesomeApp) {
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
  }
  const resConfig = merge(config, app.config.databaseConfig || {});
  let models, sequelize;
  try {
    sequelize = new Sequelize(resConfig);
    models = await (await import('./models/index.js')).default(sequelize);
  } catch (e) {
    throw e;
  }

  return new PostgresDatabase(app, sequelize, models, config) as IGeesomeDatabaseModule;
};

class PostgresDatabase implements IGeesomeDatabaseModule {
  app: IGeesomeApp;
  sequelize: any;
  models: any;
  config: any;

  constructor(_app, _sequelize, _models, _config) {
    this.app = _app;
    this.sequelize = _sequelize;
    this.models = _models;
    this.config = _config;
  }

  async getDriver() {
    return {
      type: 'sql',
      models: this.models,
      sequelize: this.sequelize,
    };
  }

  async addApiKey(apiKey) {
    return this.models.UserApiKey.create(apiKey);
  }

  async getApiKey(id) {
    return this.models.UserApiKey.findOne({where: {id}}) as IUserApiKey;
  }

  async updateApiKey(id, updateData) {
    await this.models.UserApiKey.update(updateData, {where: {id}})
  }

  async getApiKeyByHash(valueHash) {
    return this.models.UserApiKey.findOne({where: {valueHash, isDisabled: false}}) as IUserApiKey;
  }

  async getApiKeysByUser(userId, isDisabled?, search?, listParams: IListParams = {}) {
    this.setDefaultListParamsValues(listParams, apiKeyListParams);

    const {limit, offset, sortBy, sortDir} = listParams;

    const where = {userId};

    if (search) {
      where['title'] = {[Op.like]: search};
    }
    if (!isUndefined(isDisabled)) {
      where['isDisabled'] = isDisabled;
    }

    return this.models.UserApiKey.findAll({
      where,
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getApiKeysCountByUser(userId, isDisabled?, search?) {
    const where = {userId};

    if (search) {
      where['title'] = {[Op.like]: search};
    }
    if (!isUndefined(isDisabled)) {
      where['isDisabled'] = isDisabled;
    }

    return this.models.UserApiKey.count({where});
  }

  async updateUser(id, updateData) {
    return this.models.User.update(updateData, {where: {id}})
  }

  getSessionStore() {
    return new SessionStore({
      db: this.sequelize,
    });
  }

  async flushDatabase() {
    await pIteration.forEachSeries([
      'CorePermission', 'UserContentAction', 'UserLimit', 'Content', 'StorageObject', 'StorageSpaceSnapshot', 'UserApiKey', 'User', 'Value', 'Object'
    ], (modelName) => {
      return this.models[modelName].destroy({where: {}});
    });
  }

  async addContent(contentData) {
    return this.sequelize.transaction(async (transaction) => {
      const content = await this.models.Content.create(contentData, {transaction});
      await this.syncStorageObjectForContent(content, {transaction});
      return content;
    });
  }

  async updateContent(id, updateData) {
    log('updateContent', 'id', id, 'updateData', updateData);
    const result = await this.models.Content.update(updateData, {where: {id}});
    if (hasStorageObjectMetadata(updateData)) {
      await this.syncStorageObjectForContentId(id);
    }
    return result;
  }

  async deleteContent(id) {
    return this.models.Content.destroy({where: {id}})
  }

  async getStorageObjectByStorageId(storageId) {
    return this.models.StorageObject.findOne({where: {storageId}});
  }

  async markStorageObjectPinnedByContent(content, options: any = {}) {
    const storageObject = await this.syncStorageObjectForContent(content, options);
    if (!storageObject) {
      return null;
    }
    if (storageObject.isPinned === true) {
      return storageObject;
    }
    await storageObject.update({isPinned: true}, {transaction: options.transaction});
    return storageObject;
  }

  // Shared physical metadata reads prefer StorageObject, with Content fallback for pre-registry rows.
  async getSharedStorageMetadataByStorageId(storageId, opts: {includePreviews?: boolean} = {}) {
    if (!storageId) {
      return null;
    }
    const storageObject = await this.models.StorageObject.findOne({where: {storageId}});
    if (storageObject) {
      return storageObject;
    }
    if (opts.includePreviews) {
      const previewStorageObject = await this.models.StorageObject.findOne({
        where: {
          [Op.or]: [
            {largePreviewStorageId: storageId},
            {mediumPreviewStorageId: storageId},
            {smallPreviewStorageId: storageId},
          ],
        },
        order: [['id', 'ASC']],
      });
      if (previewStorageObject) {
        return previewStorageObject;
      }
    }
    return this.getSharedContentByStorageId(storageId, opts);
  }

  async getContentList(userId, listParams: IListParams = {}) {
    const {limit, offset} = listParams;
    return this.models.Content.findAll({
      where: {userId},
      order: [ ['createdAt', 'DESC'] ],
      limit,
      offset
    });
  }

  async getContent(id) {
    return this.models.Content.findOne({where: {id}}) as IContent;
  }

  async getContentByStorageId(storageId, findByPreviews = false) {
    return this.getSharedContentByStorageId(storageId, {includePreviews: findByPreviews});
  }

  // A1 shared-content seam (see docs/database-scalability-review.md). Returns a single Content row
  // for shared metadata reads (public file/preview headers, MIME type, size). Multiple users may own
  // separate Content rows with the same storageId or manifestStorageId; pick the oldest by id for
  // deterministic tie-breaking so shared reads always resolve to the same metadata row across calls.
  // New physical-object reads should prefer getSharedStorageMetadataByStorageId() so StorageObject
  // can be the canonical source while old rows still fall back to Content.
  async getSharedContentByStorageId(storageId, opts: {includePreviews?: boolean} = {}) {
    const where = opts.includePreviews
      ? {[Op.or]: [{storageId}, {largePreviewStorageId: storageId}, {mediumPreviewStorageId: storageId}, {smallPreviewStorageId: storageId}]}
      : {storageId};
    return this.models.Content.findOne({where, order: [['id', 'ASC']]}) as IContent;
  }

  async getSharedContentByManifestId(manifestStorageId) {
    return this.models.Content.findOne({where: {manifestStorageId}, order: [['id', 'ASC']]}) as IContent;
  }

  // A1 reference-count helper for physical storage objects. Used by deleteFileCatalogItem before
  // unpinning/removing the storage object so a delete by one user cannot break another user's row,
  // a Content row that uses the storageId as a preview, or a future canonical asset.
  async countStorageIdReferences(storageId, excludeContentId?: number, options: {excludeFileCatalogItemId?: number} = {}) {
    const otherContentsWhere: any = {storageId};
    if (excludeContentId) {
      otherContentsWhere.id = {[Op.ne]: excludeContentId};
    }
    const [otherContents, previewRefs, pinnedStorageObjects, derivedStorageRefs] = await Promise.all([
      this.models.Content.count({where: otherContentsWhere}),
      this.models.Content.count({
        where: {
          [Op.or]: [
            {largePreviewStorageId: storageId},
            {mediumPreviewStorageId: storageId},
            {smallPreviewStorageId: storageId},
          ],
        },
      }),
      this.models.StorageObject.count({where: {storageId, isPinned: true}}),
      countDerivedStorageIdReferences(this.models, this.sequelize, storageId, options),
    ]);
    return {otherContents, previewRefs, pinnedStorageObjects, derivedStorageRefs};
  }

  // A1 reference-count helper for a specific Content row. Used by delete paths to detect
  // attachments/avatars/covers/file-catalog references that would orphan if the row is destroyed.
  async countContentReferences(contentId) {
    const [posts, fileCatalogItems, groupAvatars, groupCovers, userAvatars, pinnedContents] = await Promise.all([
      this.models.PostsContents.count({where: {contentId}}),
      this.models.FileCatalogItem.count({where: {contentId}}),
      this.models.Group.count({where: {avatarImageId: contentId}}),
      this.models.Group.count({where: {coverImageId: contentId}}),
      this.models.User.count({where: {avatarImageId: contentId}}),
      this.models.Content.count({where: {id: contentId, isPinned: true}}),
    ]);
    return {posts, fileCatalogItems, groupAvatars, groupCovers, userAvatars, pinnedContents};
  }

  async getContentDeleteSafety(content, options: {allowedFileCatalogItems?: number; excludeFileCatalogItemId?: number} = {}) {
    const contentRecord = typeof content === 'number' ? await this.getContent(content) : content;
    if (!contentRecord) {
      return null;
    }
    const [storageRefs, contentRefs] = await Promise.all([
      contentRecord.storageId
        ? this.countStorageIdReferences(contentRecord.storageId, contentRecord.id, {
            excludeFileCatalogItemId: options.excludeFileCatalogItemId,
          })
        : getEmptyStorageIdReferenceCounts(),
      this.countContentReferences(contentRecord.id),
    ]);
    return getContentDeleteSafety(storageRefs, contentRefs, {
      ...options,
      hasStorageId: Boolean(contentRecord.storageId),
    });
  }

  async getStorageSpaceOverview() {
    return storageSpaceUsage.getStorageSpaceOverview(this.sequelize);
  }

  async getStorageSpaceTypeBreakdown(listParams: IListParams = {}) {
    return storageSpaceUsage.getStorageSpaceTypeBreakdown(this.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getStorageSpaceTopContents(listParams: IListParams = {}) {
    return storageSpaceUsage.getStorageSpaceTopContents(this.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getStorageSpaceTopFileCatalogItems(listParams: IListParams = {}) {
    return storageSpaceUsage.getStorageSpaceTopFileCatalogItems(this.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getStorageSpaceTopGroups(listParams: IListParams = {}) {
    return storageSpaceUsage.getStorageSpaceTopGroups(this.sequelize, getStorageSpaceListWindow(listParams));
  }

  async getLatestStorageSpaceSnapshot() {
    const snapshot = await this.models.StorageSpaceSnapshot.findOne({
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
    });
    return getStorageSpaceSnapshotResponse(snapshot);
  }

  async refreshStorageSpaceSnapshot(userId?: number, listParams: IListParams = {}) {
    const startedAt = Date.now();
    const listWindow = getStorageSpaceSnapshotListWindow(listParams);
    const data = await this.getStorageSpaceSnapshotData(listWindow);
    const snapshot = await this.models.StorageSpaceSnapshot.create({
      userId,
      listLimit: listWindow.limit,
      durationMs: Date.now() - startedAt,
      data: JSON.stringify(data),
    });
    return getStorageSpaceSnapshotResponse(snapshot);
  }

  async getStorageSpaceSnapshotData(listParams: IListParams = {}) {
    const listWindow = getStorageSpaceSnapshotListWindow(listParams);
    const [overview, typeBreakdown, topContents, topFileCatalogItems, topGroups] = await Promise.all([
      this.getStorageSpaceOverview(),
      this.getStorageSpaceTypeBreakdown(listWindow),
      this.getStorageSpaceTopContents(listWindow),
      this.getStorageSpaceTopFileCatalogItems(listWindow),
      this.getStorageSpaceTopGroups(listWindow),
    ]);

    return {
      overview,
      typeBreakdown,
      topContents,
      topFileCatalogItems,
      topGroups,
    } as IStorageSpaceSnapshotData;
  }

  async queueStorageSpaceSnapshotRefresh(userId: number, userApiKeyId = null, listParams: IListParams = {}, options: any = {}) {
    const queue = await this.app.ms.asyncOperation.addUserOperationQueue(
      userId,
      storageSpaceSnapshotQueueModuleName,
      userApiKeyId,
      getStorageSpaceSnapshotRefreshJobInput(listParams)
    );
    if (options.process !== false) {
      this.startStorageSpaceSnapshotRefreshQueueProcessing();
    }
    return queue;
  }

  startStorageSpaceSnapshotRefreshQueueProcessing(options: any = {}) {
    const limit = parsePositiveInteger(options.limit, storageSpaceSnapshotQueueKickBatchLimit);
    void this.processStorageSpaceSnapshotRefreshQueue({limit}).catch((e) => {
      log('processStorageSpaceSnapshotRefreshQueue error', e);
    });
  }

  async processStorageSpaceSnapshotRefreshQueue(options: any = {}) {
    const limit = parsePositiveInteger(options.limit, Number.MAX_SAFE_INTEGER);
    return this.app.ms.asyncOperation.processModuleOperationQueue(storageSpaceSnapshotQueueModuleName, {
      limit,
      getPayload: (waitingQueue) => parseStorageSpaceSnapshotRefreshJob(waitingQueue.inputJson),
      getAsyncOperationData: (_waitingQueue, job) => ({
        name: 'refresh-storage-space-snapshot',
        channel: getStorageSpaceSnapshotRefreshJobChannel(job),
        percent: 5,
      }),
      run: async (waitingQueue, _asyncOperation, job) => {
        const snapshot = await this.refreshStorageSpaceSnapshot(waitingQueue.userId, job.listParams);
        return getStorageSpaceSnapshotRefreshJobResult(snapshot);
      },
    });
  }

  async getContentByStorageAndUserId(storageId, userId) {
    return this.models.Content.findOne({where: {storageId, userId}}) as IContent;
  }

  async getContentByStorageIdListAndUserId(storageIdList, userId) {
    return this.models.Content.findAll({where: {storageId: {[Op.in]: storageIdList}, userId}}) as IContent;
  }

  async getContentByManifestId(manifestStorageId) {
    return this.getSharedContentByManifestId(manifestStorageId);
  }

  async getContentByManifestAndUserId(manifestStorageId, userId) {
    return this.models.Content.findOne({where: {manifestStorageId, userId}}) as IContent;
  }

  async getObjectByStorageId(storageId, resolveProp = false) {
    return this.models.Object.findOne({where: {storageId, resolveProp}}) as IObject;
  }

  async addObject(object) {
    return this.models.Object.create(object);
  }

  async getUsersCount() {
    return this.models.User.count();
  }

  async addUser(user) {
    return this.models.User.create(user);
  }

  async getUserByName(name) {
    return this.models.User.findOne({
      where: {name},
      include: [ {association: 'avatarImage'} ]
    }) as IUser;
  }

  async getUserByNameOrEmail(nameOrEmail) {
    return this.models.User.findOne({
      where: { [Op.or]: [{name: nameOrEmail}, {email: nameOrEmail}] },
      include: [ {association: 'avatarImage'} ]
    }) as IUser;
  }

  async getUser(id) {
    if (!id) {
      return null;
    }
    return this.models.User.findOne({
      where: {id},
      include: [ {association: 'avatarImage'} ]
    }) as IUser;
  }

  async getUserByManifestId(id, staticId?) {
    const whereOr = [];
    if (id) {
      whereOr.push({manifestStorageId: id});
    }
    if (staticId) {
      whereOr.push({manifestStaticStorageId: staticId});
    }
    if (!whereOr.length) {
      return null;
    }
    return this.models.User.findOne({
      where: {[Op.or]: whereOr},
      include: [ {association: 'avatarImage'} ]
    }) as IUser;
  }

  async addUserFriend(userId, friendId) {
    return (await this.getUser(userId)).addFriends([await this.getUser(friendId)]).catch((e) => {console.error(e); throw e;});
  }

  async removeUserFriend(userId, friendId) {
    return (await this.getUser(userId)).removeFriends([await this.getUser(friendId)]);
  }

  async getUserFriends(userId, search?, listParams: IListParams = {}) {
    this.setDefaultListParamsValues(listParams, userFriendListParams);
    const {limit, offset, sortBy, sortDir} = listParams;
    const where = this.getAllUsersWhere(search);
    const order: any[] = [[sortBy, sortDir.toUpperCase()]];
    if (sortBy !== 'id') {
      order.push(['id', sortDir.toUpperCase()]);
    }
    return (await this.getUser(userId)).getFriends({
      where,
      include: [ {association: 'avatarImage'} ],
      order,
      limit,
      offset
    });
  }

  async getUserFriendsCount(userId, search?) {
    const where = this.getAllUsersWhere(search);
    return (await this.getUser(userId)).countFriends({where});
  }

  async createUserAccount(accountData) {
    accountData.address = accountData.address.toLowerCase();
    return this.models.UserAccount.create(accountData);
  }

  async updateUserAccount(id, updateData) {
    updateData.address = updateData.address.toLowerCase();
    return this.models.UserAccount.update(updateData, {where: {id}});
  }

  async addCorePermission(userId, permissionName) {
    return this.models.CorePermission.create({userId, name: permissionName, isActive: true});
  }

  async removeCorePermission(userId, permissionName) {
    return this.models.CorePermission.destroy({where: {userId, name: permissionName}})
  }

  async setCorePermissions(userId, permissionNameList) {
    const allUserPermissions = await this.getCorePermissions(userId);
    const existPermissions = {};
    const permissionsToDestroy = allUserPermissions.filter(p => {
      existPermissions[p.name] = true;
      return !permissionNameList.includes(p.name);
    });

    await pIteration.forEach(permissionsToDestroy, (p: any) => p.destroy());

    return pIteration.forEach(permissionNameList, (name: string) => {
      if (!existPermissions[name]) {
        return this.addCorePermission(userId, name);
      }
    });
  }

  async getCorePermissions(userId) {
    return this.models.CorePermission.findAll({where: {userId}})
  }

  async isHaveCorePermission(userId, permissionName) {
    return this.models.CorePermission.findOne({where: {userId, name: permissionName}}).then(r => !!r);
  }

  getAllUsersWhere(searchString?) {
    let where = {};
    if (searchString) {
      where = {[Op.or]: [{name: {[Op.like]: `%${searchString}%`} }, {email: {[Op.like]: `%${searchString}%`}}, {storageAccountId: searchString}]};
    }
    return where;
  }

  async getAllUserList(searchString?, listParams: IListParams = {}) {
    this.setDefaultListParamsValues(listParams, adminUserListParams);
    const {sortBy, sortDir, limit, offset} = listParams;
    return this.models.User.findAll({
      where: this.getAllUsersWhere(searchString),
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getAllUserCount(searchString) {
    return this.models.User.count({
      where: this.getAllUsersWhere(searchString)
    });
  }

  getAllContentWhere(searchString) {
    let where = {};
    if (searchString) {
      where = {[Op.or]: [{name: searchString}, {manifestStorageId: searchString}, {storageId: searchString}]};
    }
    return where;
  }

  getUserContentListByIds(userId, contentIds) {
    return this.models.Content.findAll({where: {userId, id: {[Op.in]: contentIds}}});
  }

  async getAllContentList(searchString, listParams: IListParams = {}) {
    this.setDefaultListParamsValues(listParams, adminContentListParams);
    const {sortBy, sortDir, limit, offset} = listParams;
    return this.models.Content.findAll({
      where: this.getAllContentWhere(searchString),
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getAllContentCount(searchString) {
    return this.models.Content.count({
      where: this.getAllContentWhere(searchString),
    });
  }

  async addUserContentAction(userContentActionData) {
    return this.models.UserContentAction.create(userContentActionData);
  }

  async addContentWithUserContentAction(contentData: IContent, userContentActionData: IUserContentAction, limitName?: UserLimitName) {
    return this.sequelize.transaction(async (transaction) => {
      if (limitName) {
        await this.checkUserContentActionLimit(userContentActionData.userId, limitName, userContentActionData.size, transaction);
      }
      const content = await this.models.Content.create(contentData, {transaction});
      await this.models.UserContentAction.create({
        ...userContentActionData,
        contentId: content.id
      }, {transaction});
      await this.syncStorageObjectForContent(content, {transaction});
      return content;
    });
  }

  async syncStorageObjectForContentId(contentId, options: any = {}) {
    const content = await this.models.Content.findOne({
      where: {id: contentId},
      transaction: options.transaction
    });
    if (!content) {
      return null;
    }
    return this.syncStorageObjectForContent(content, options);
  }

  async syncStorageObjectForContent(content, options: any = {}) {
    const storageObjectData = getStorageObjectData(content);
    if (!storageObjectData) {
      return null;
    }
    const [storageObject, created] = await this.models.StorageObject.findOrCreate({
      where: {storageId: storageObjectData.storageId},
      defaults: storageObjectData,
      transaction: options.transaction
    });
    if (created) {
      return storageObject;
    }
    const updateData = getStorageObjectUpdateData(storageObject, storageObjectData);
    if (!Object.keys(updateData).length) {
      return storageObject;
    }
    await storageObject.update(updateData, {transaction: options.transaction});
    return storageObject;
  }

  async checkUserContentActionLimit(userId, limitName: UserLimitName, actionSize, transaction) {
    const limit = await this.models.UserLimit.findOne({
      where: {userId, name: limitName},
      transaction,
      lock: Transaction.LOCK.UPDATE
    });
    if (!limit || !limit.isActive) {
      return;
    }
    if (limitName !== UserLimitName.SaveContentSize) {
      throw new Error("Unknown limit");
    }

    const uploadSize = await this.getUserContentActionsSizeSum(userId, UserContentActionName.Upload, limit.periodTimestamp, {transaction});
    const pinSize = await this.getUserContentActionsSizeSum(userId, UserContentActionName.Pin, limit.periodTimestamp, {transaction});
    const remained = Number(limit.value) - Number(uploadSize) - Number(pinSize);
    if (remained < Number(actionSize || 0)) {
      throw new Error("limit_reached");
    }
  }

  async getUserContentActionsSizeSum(userId, name, periodTimestamp?, options: any = {}) {
    const where: any = {userId, name};

    if (periodTimestamp) {
      let from = new Date(new Date().getTime() - periodTimestamp * 1000);
      where.createdAt = {[Op.gte]: from};
    }

    return (await this.models.UserContentAction.sum('size', {where, transaction: options.transaction})) || 0;
  }

  async addUserLimit(userLimitData) {
    return this.models.UserLimit.create(userLimitData);
  }

  async updateUserLimit(id, updateData) {
    return this.models.UserLimit.update(updateData, {where: {id}});
  }

  async getUserLimit(userId, name) {
    return this.models.UserLimit.findOne({where: {userId, name}}) as IUserLimit;
  }

  async getValue(key: string) {
    const valueObj = await this.models.Value.findOne({where: {key}});
    return valueObj ? valueObj.content : null;
  }

  async setValue(key: string, content: string) {
    const valueObj = await this.models.Value.findOne({where: {key}});
    if (valueObj) {
      return valueObj.update({content}, {where: {key}})
    } else {
      return this.models.Value.create({key, content});
    }
  }

  async clearValue(key: string) {
    return this.models.Value.destroy({where: {key}});
  }

  setDefaultListParamsValues(listParams: IListParams, defaultParams: IListParamsOptions = {}) {
    const defaultSortBy = sanitizeSortBy(defaultParams.sortBy, 'createdAt', defaultParams.allowedSortBy);
    const defaultSortDir = sanitizeSortDir(defaultParams.sortDir, 'DESC');
    const defaultLimit = parseNonNegativeInteger(defaultParams.limit, 20);
    const defaultOffset = parseNonNegativeInteger(defaultParams.offset, 0);
    const limitCap = getListLimitCap(defaultParams);
    listParams.sortBy = sanitizeSortBy(listParams.sortBy, defaultSortBy, defaultParams.allowedSortBy);
    listParams.sortDir = sanitizeSortDir(listParams.sortDir, defaultSortDir);
    listParams.limit = Math.min(parseNonNegativeInteger(listParams.limit, defaultLimit), limitCap);
    listParams.offset = parseNonNegativeInteger(listParams.offset, defaultOffset);
  }
}

const storageObjectMetadataFields = [
  'storageType',
  'mimeType',
  'extension',
  'size',
  'largePreviewStorageId',
  'largePreviewSize',
  'mediumPreviewStorageId',
  'mediumPreviewSize',
  'smallPreviewStorageId',
  'smallPreviewSize',
  'previewMimeType',
  'previewExtension'
];

function getStorageObjectData(content) {
  const contentData = typeof content?.toJSON === 'function' ? content.toJSON() : content;
  if (!contentData?.storageId) {
    return null;
  }
  const storageObjectData: Record<string, any> = {storageId: contentData.storageId};
  storageObjectMetadataFields.forEach((field) => {
    if (!isUndefined(contentData[field])) {
      storageObjectData[field] = contentData[field];
    }
  });
  if (contentData.isPinned === true) {
    storageObjectData.isPinned = true;
  }
  return storageObjectData;
}

function hasStorageObjectMetadata(updateData) {
  if (!updateData) {
    return false;
  }
  if (!isUndefined(updateData.storageId)) {
    return true;
  }
  return storageObjectMetadataFields.some(field => !isUndefined(updateData[field]));
}

function getStorageObjectUpdateData(storageObject, storageObjectData) {
  const existingData = typeof storageObject?.toJSON === 'function' ? storageObject.toJSON() : storageObject;
  const updateData: Record<string, any> = {};
  storageObjectMetadataFields.forEach((field) => {
    if (isUndefined(storageObjectData[field])) {
      return;
    }
    if (existingData[field] === storageObjectData[field]) {
      return;
    }
    updateData[field] = storageObjectData[field];
  });
  if (storageObjectData.isPinned === true && existingData.isPinned !== true) {
    updateData.isPinned = true;
  }
  return updateData;
}

function getEmptyStorageIdReferenceCounts() {
  return {
    otherContents: 0,
    previewRefs: 0,
    pinnedStorageObjects: 0,
    derivedStorageRefs: 0,
  };
}

function getContentDeleteSafety(storageRefs, contentRefs, options) {
  const contentBlockers = getContentDeleteContentBlockers(contentRefs, options);
  const storageBlockers = getContentDeleteStorageBlockers(storageRefs);
  const safeToDestroyContent = contentBlockers.length === 0;
  const safeToRemovePhysical =
    options.hasStorageId === true &&
    safeToDestroyContent &&
    storageBlockers.length === 0;
  return {
    contentRefs,
    storageRefs,
    contentBlockers,
    storageBlockers,
    blockers: [...contentBlockers, ...storageBlockers],
    safeToDestroyContent,
    safeToRemovePhysical,
  };
}

function getStorageSpaceListWindow(listParams: IListParams = {}) {
  const limitCap = getListLimitCap(storageSpaceListParams);
  return {
    limit: Math.min(parseNonNegativeInteger(listParams.limit, storageSpaceListParams.limit), limitCap),
    offset: parseNonNegativeInteger(listParams.offset, 0),
  };
}

function getStorageSpaceSnapshotListWindow(listParams: IListParams = {}) {
  const listWindow = getStorageSpaceListWindow(listParams);
  return {
    limit: listWindow.limit,
    offset: 0,
  };
}

function getStorageSpaceSnapshotRefreshJobInput(listParams: IListParams = {}) {
  return {
    type: 'refresh',
    listParams: getStorageSpaceSnapshotListWindow(listParams),
  };
}

function parseStorageSpaceSnapshotRefreshJob(inputJson) {
  const job = typeof inputJson === 'string' ? JSON.parse(inputJson) : inputJson;
  if (job?.type !== 'refresh') {
    throw new Error('invalid_storage_space_snapshot_job_type');
  }
  return {
    type: job.type,
    listParams: getStorageSpaceSnapshotListWindow(job.listParams),
  };
}

function getStorageSpaceSnapshotRefreshJobChannel(job) {
  return `${storageSpaceSnapshotQueueModuleName}:refresh:limit:${job.listParams.limit}`;
}

function getStorageSpaceSnapshotRefreshJobResult(snapshot) {
  return {
    snapshotId: snapshot.id,
    listLimit: snapshot.listLimit,
    durationMs: snapshot.durationMs,
    createdAt: snapshot.createdAt,
  };
}

function getStorageSpaceSnapshotResponse(snapshot) {
  if (!snapshot) {
    return null;
  }

  const snapshotData = typeof snapshot.toJSON === 'function' ? snapshot.toJSON() : snapshot;
  return {
    id: snapshotData.id,
    userId: snapshotData.userId,
    listLimit: snapshotData.listLimit,
    durationMs: snapshotData.durationMs,
    data: parseStorageSpaceSnapshotData(snapshotData.data),
    createdAt: snapshotData.createdAt,
    updatedAt: snapshotData.updatedAt,
  };
}

function parseStorageSpaceSnapshotData(data) {
  if (!data) {
    return null;
  }
  if (typeof data !== 'string') {
    return data;
  }

  return JSON.parse(data);
}

function getContentDeleteContentBlockers(contentRefs, options): IContentDeleteSafetyBlocker[] {
  return [
    getContentDeleteBlocker('content', 'posts', contentRefs.posts),
    getContentDeleteBlocker(
      'content',
      'fileCatalogItems',
      contentRefs.fileCatalogItems,
      options.allowedFileCatalogItems || 0
    ),
    getContentDeleteBlocker('content', 'groupAvatars', contentRefs.groupAvatars),
    getContentDeleteBlocker('content', 'groupCovers', contentRefs.groupCovers),
    getContentDeleteBlocker('content', 'userAvatars', contentRefs.userAvatars),
    getContentDeleteBlocker('content', 'pinnedContents', contentRefs.pinnedContents),
  ].filter(isContentDeleteBlocker);
}

function getContentDeleteStorageBlockers(storageRefs): IContentDeleteSafetyBlocker[] {
  return [
    getContentDeleteBlocker('storage', 'otherContents', storageRefs.otherContents),
    getContentDeleteBlocker('storage', 'previewRefs', storageRefs.previewRefs),
    getContentDeleteBlocker('storage', 'pinnedStorageObjects', storageRefs.pinnedStorageObjects),
    getContentDeleteBlocker('storage', 'derivedStorageRefs', storageRefs.derivedStorageRefs),
  ].filter(isContentDeleteBlocker);
}

function getContentDeleteBlocker(
  scope: ContentDeleteSafetyBlockerScope,
  key: string,
  count: number,
  allowedCount = 0
): IContentDeleteSafetyBlocker | null {
  if (count <= allowedCount) {
    return null;
  }
  const blocker: IContentDeleteSafetyBlocker = {scope, key, count};
  if (allowedCount > 0) {
    blocker.allowedCount = allowedCount;
  }
  return blocker;
}

function isContentDeleteBlocker(blocker: IContentDeleteSafetyBlocker | null): blocker is IContentDeleteSafetyBlocker {
  return blocker !== null;
}
