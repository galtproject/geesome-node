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
  IStorageIdReferenceOptions,
  IListParams,
  IListParamsOptions,
  IObject,
  IStorageObjectIdentityData,
  IStorageObjectReferenceRecord,
  IStorageObjectRecord,
  StorageObjectReferenceType,
  IUser,
  IUserApiKey,
  IUserContentAction,
  IUserLimit,
  UserContentActionName,
  UserLimitName
} from "./interface.js";
import {
  countDerivedStorageIdReferences,
  countRemotePinReferences,
  countStorageObjectChildReferences
} from './storageReferenceHelpers.js';
import {
  startDatabaseConnectionDiagnostics
} from './connectionDiagnostics.js';
import type {DatabaseConnectionDiagnostics} from './connectionDiagnostics.js';
import {validateDatabaseConnectionBudget} from './connectionBudget.js';
import type {DatabaseConnectionBudget} from './connectionBudget.js';
import {cleanupAndRethrow} from '../../resourceCleanup.js';
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
const deletedContentListParams: IListParamsOptions = {
  sortBy: 'deletedAt',
  allowedSortBy: ['deletedAt', 'createdAt', 'updatedAt', 'id', 'name', 'storageId', 'manifestStorageId', 'size'],
  maxLimit: 100
};
const deletedContentPurgeListParams: IListParamsOptions = {
  sortBy: 'deletedAt',
  sortDir: 'ASC',
  allowedSortBy: ['deletedAt', 'createdAt', 'updatedAt', 'id', 'name', 'storageId', 'manifestStorageId', 'size'],
  maxLimit: 100
};

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value as any, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
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
  const resConfig = merge({}, config, app.config.databaseConfig || {});
  const sequelize = new Sequelize(resConfig);
  const models = await initializeDatabaseModels(sequelize);

  const connectionBudget = await validateDatabaseConnectionBudget(sequelize);
  const connectionDiagnostics = startDatabaseConnectionDiagnostics(sequelize);
  return new PostgresDatabase(
    app,
    sequelize,
    models,
    config,
    connectionDiagnostics,
    connectionBudget
  ) as IGeesomeDatabaseModule;
};

class PostgresDatabase implements IGeesomeDatabaseModule {
  app: IGeesomeApp;
  sequelize: any;
  models: any;
  config: any;
  connectionDiagnostics: DatabaseConnectionDiagnostics;
  connectionBudget: DatabaseConnectionBudget | null;
  stopPromise: Promise<void> | null = null;

  constructor(_app, _sequelize, _models, _config, _connectionDiagnostics, _connectionBudget) {
    this.app = _app;
    this.sequelize = _sequelize;
    this.models = _models;
    this.config = _config;
    this.connectionDiagnostics = _connectionDiagnostics;
    this.connectionBudget = _connectionBudget;
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

  async stop() {
    if (!this.stopPromise) {
      this.stopPromise = this.connectionDiagnostics.stop().then(() => this.sequelize.close());
    }
    return this.stopPromise;
  }

  async getConnectionDiagnostics() {
    return this.connectionDiagnostics.getSnapshot();
  }

  getConnectionBudget() {
    return this.connectionBudget;
  }

  async flushDatabase() {
    await pIteration.forEachSeries([
      'CorePermission', 'UserContentAction', 'UserLimit', 'Content', 'StorageObjectReference', 'StorageObject', 'StorageSpaceAvailabilitySample', 'StorageSpaceSnapshot', 'UserApiKey', 'User', 'Value', 'Object'
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
    return this.models.Content.update({
      isDeleted: true,
      deletedAt: new Date()
    }, {where: {id, isDeleted: {[Op.ne]: true}}});
  }

  async restoreContent(id) {
    return this.sequelize.transaction(async (transaction) => {
      const content = await this.models.Content.findOne({
        where: {id},
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!content) {
        return null;
      }
      if (content.isDeleted !== true) {
        return content;
      }

      const conflict = await this.getRestoreContentConflict(content, transaction);
      if (conflict) {
        throw createContentRestoreConflictError(content, conflict);
      }

      try {
        await content.update({isDeleted: false, deletedAt: null}, {transaction});
      } catch (e) {
        if (!isContentUserStorageUniqueError(e)) {
          throw e;
        }
        throw createContentRestoreConflictError(content);
      }

      return this.models.Content.findOne({where: {id}, transaction}) as IContent;
    });
  }

  async purgeDeletedContent(id) {
    return this.sequelize.transaction(async (transaction) => {
      const content = await this.models.Content.findOne({
        where: {id, isDeleted: true},
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!content) {
        return 0;
      }

      await this.models.UserContentAction.update({contentId: null}, {
        where: {contentId: content.id},
        transaction
      });
      await content.destroy({transaction});
      return 1;
    });
  }

  async getRestoreContentConflict(content, transaction) {
    const where = getContentRestoreConflictWhere(content);
    if (!where) {
      return null;
    }
    return this.models.Content.findOne({where, transaction});
  }

  async getStorageObjectByStorageId(storageId) {
    return this.models.StorageObject.findOne({where: {storageId}});
  }

  async getStorageObjectByIdentity(identityType: string, identityId: string) {
    const where = getStorageObjectIdentityWhere(identityType, identityId);
    if (!where) {
      return null;
    }
    return this.models.StorageObject.findOne({where, order: [['id', 'ASC']]});
  }

  async syncStorageObject(storageObjectData: Partial<IStorageObjectRecord>, options: any = {}) {
    if (!storageObjectData?.storageId) {
      return null;
    }
    const normalizedStorageObjectData = getStorageObjectSyncData(storageObjectData);
    const [storageObject, created] = await this.models.StorageObject.findOrCreate({
      where: {storageId: normalizedStorageObjectData.storageId},
      defaults: normalizedStorageObjectData,
      transaction: options.transaction
    });
    if (created) {
      return storageObject;
    }
    const updateData = getStorageObjectUpdateData(storageObject, normalizedStorageObjectData);
    if (!Object.keys(updateData).length) {
      return storageObject;
    }
    await storageObject.update(updateData, {transaction: options.transaction});
    return storageObject;
  }

  async syncStorageObjectIdentity(storageId: string, identityData: IStorageObjectIdentityData, options: any = {}) {
    const normalizedIdentityData = getStorageObjectIdentityData(identityData);
    if (!storageId || !normalizedIdentityData) {
      return null;
    }
    return this.syncStorageObject({
      storageId,
      ...normalizedIdentityData,
    }, options);
  }

  async syncStorageObjectReference(referenceData: Partial<IStorageObjectReferenceRecord>, options: any = {}) {
    if (!isValidStorageObjectReferenceData(referenceData)) {
      return null;
    }
    const normalizedReferenceData = getStorageObjectReferenceData(referenceData);
    const [storageObjectReference, created] = await this.models.StorageObjectReference.findOrCreate({
      where: {
        sourceStorageId: normalizedReferenceData.sourceStorageId,
        targetStorageId: normalizedReferenceData.targetStorageId,
        referenceType: normalizedReferenceData.referenceType,
      },
      defaults: normalizedReferenceData,
      transaction: options.transaction
    });
    if (created) {
      return storageObjectReference;
    }
    const updateData = getStorageObjectReferenceUpdateData(storageObjectReference, normalizedReferenceData);
    if (!Object.keys(updateData).length) {
      return storageObjectReference;
    }
    await storageObjectReference.update(updateData, {transaction: options.transaction});
    return storageObjectReference;
  }

  async replaceStorageObjectReferences(
    sourceStorageId: string,
    referenceType: StorageObjectReferenceType,
    references: Partial<IStorageObjectReferenceRecord>[],
    options: any = {}
  ) {
    if (!sourceStorageId || !referenceType) {
      return [];
    }
    const run = async (transaction) => {
      const targetStorageIds = getUniqueStorageReferenceTargets(references);
      const deleteWhere: any = {sourceStorageId, referenceType};
      if (targetStorageIds.length) {
        deleteWhere.targetStorageId = {[Op.notIn]: targetStorageIds};
      }
      await this.models.StorageObjectReference.destroy({where: deleteWhere, transaction});
      const rows = [];
      for (const reference of references) {
        const row = await this.syncStorageObjectReference({
          ...reference,
          sourceStorageId,
          referenceType,
        }, {transaction});
        if (row) {
          rows.push(row);
        }
      }
      return rows;
    };
    if (options.transaction) {
      return run(options.transaction);
    }
    return this.sequelize.transaction(run);
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
      where: getActiveContentWhere({userId}),
      order: [ ['createdAt', 'DESC'] ],
      limit,
      offset
    });
  }

  async getContent(id, options: any = {}) {
    const where = options.includeDeleted ? {id} : getActiveContentWhere({id});
    return this.models.Content.findOne({where}) as IContent;
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
    const where = getActiveContentWhere(opts.includePreviews
      ? {[Op.or]: [{storageId}, {largePreviewStorageId: storageId}, {mediumPreviewStorageId: storageId}, {smallPreviewStorageId: storageId}]}
      : {storageId});
    return this.models.Content.findOne({where, order: [['id', 'ASC']]}) as IContent;
  }

  async getSharedContentByManifestId(manifestStorageId) {
    return this.models.Content.findOne({where: getActiveContentWhere({manifestStorageId}), order: [['id', 'ASC']]}) as IContent;
  }

  // A1 reference-count helper for physical storage objects. Used by deleteFileCatalogItem before
  // unpinning/removing the storage object so a delete by one user cannot break another user's row,
  // a Content row that uses the storageId as a preview, or a future canonical asset.
  async countStorageIdReferences(storageId, excludeContentId?: number, options: IStorageIdReferenceOptions = {}) {
    const otherContentsWhere: any = getActiveContentWhere({storageId});
    if (excludeContentId) {
      otherContentsWhere.id = {[Op.ne]: excludeContentId};
    }
    const previewRefsWhere: any = getActiveContentWhere({
      [Op.or]: [
        {largePreviewStorageId: storageId},
        {mediumPreviewStorageId: storageId},
        {smallPreviewStorageId: storageId},
      ],
    });
    if (excludeContentId) {
      previewRefsWhere.id = {[Op.ne]: excludeContentId};
    }
    const [
      otherContents,
      previewRefs,
      pinnedStorageObjects,
      remotePinRefs,
      derivedStorageRefs,
      storageObjectChildRefs
    ] = await Promise.all([
      this.models.Content.count({where: otherContentsWhere}),
      this.models.Content.count({where: previewRefsWhere}),
      this.models.StorageObject.count({where: {storageId, isPinned: true}}),
      countRemotePinReferences(this.models, this.sequelize, storageId),
      countDerivedStorageIdReferences(this.models, this.sequelize, storageId, options),
      countStorageObjectChildReferences(this.models, this.sequelize, storageId, {
        ...options,
        excludeContentId,
      }),
    ]);
    return {
      otherContents,
      previewRefs,
      pinnedStorageObjects,
      remotePinRefs,
      derivedStorageRefs,
      storageObjectChildRefs
    };
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
      this.models.Content.count({where: getActiveContentWhere({id: contentId, isPinned: true})}),
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

  async getStorageObjectDeleteSafety(storageId: string, options: IStorageIdReferenceOptions = {}) {
    const storageRefs = storageId
      ? await this.countStorageIdReferences(storageId, undefined, options)
      : getEmptyStorageIdReferenceCounts();
    return getStorageObjectDeleteSafety(storageId, storageRefs);
  }

  async getContentByStorageAndUserId(storageId, userId) {
    return this.models.Content.findOne({where: getActiveContentWhere({storageId, userId})}) as IContent;
  }

  async getContentByStorageIdListAndUserId(storageIdList, userId) {
    return this.models.Content.findAll({where: getActiveContentWhere({storageId: {[Op.in]: storageIdList}, userId})}) as IContent;
  }

  async getContentByManifestId(manifestStorageId) {
    return this.getSharedContentByManifestId(manifestStorageId);
  }

  async getContentByManifestAndUserId(manifestStorageId, userId) {
    return this.models.Content.findOne({where: getActiveContentWhere({manifestStorageId, userId})}) as IContent;
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
    return getContentSearchWhere(getActiveContentWhere(), searchString);
  }

  getDeletedContentWhere(searchString) {
    return getContentSearchWhere(getDeletedOnlyContentWhere(), searchString);
  }

  getUserContentListByIds(userId, contentIds) {
    return this.models.Content.findAll({where: getActiveContentWhere({userId, id: {[Op.in]: contentIds}})});
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

  async getDeletedContentList(searchString, listParams: IListParams = {}) {
    this.setDefaultListParamsValues(listParams, deletedContentListParams);
    const {sortBy, sortDir, limit, offset} = listParams;
    return this.models.Content.findAll({
      where: this.getDeletedContentWhere(searchString),
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getDeletedContentCount(searchString) {
    return this.models.Content.count({
      where: this.getDeletedContentWhere(searchString),
    });
  }

  async getDeletedContentPurgeCandidateList(cutoff: Date, listParams: IListParams = {}) {
    this.setDefaultListParamsValues(listParams, deletedContentPurgeListParams);
    const {sortBy, sortDir, limit, offset} = listParams;
    return this.models.Content.findAll({
      where: getDeletedContentPurgeCandidateWhere(cutoff),
      order: [[sortBy, sortDir.toUpperCase()], ['id', sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getDeletedContentPurgeCandidateCount(cutoff: Date) {
    return this.models.Content.count({
      where: getDeletedContentPurgeCandidateWhere(cutoff),
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
    const run = async (transaction) => {
      const transactionOptions = {...options, transaction};
      const storageObject = await this.syncStorageObject(storageObjectData, transactionOptions);
      await this.syncStorageObjectPreviewsForContent(content, transactionOptions);
      await this.replaceStorageObjectReferences(
        storageObjectData.storageId,
        StorageObjectReferenceType.Preview,
        getStorageObjectPreviewReferences(content),
        transactionOptions
      );
      return storageObject;
    };
    if (options.transaction) {
      return run(options.transaction);
    }
    return this.sequelize.transaction(run);
  }

  async syncStorageObjectPreviewsForContent(content, options: any = {}) {
    const previewStorageObjects = getStorageObjectPreviewDataList(content);
    const rows = [];
    for (const previewStorageObject of previewStorageObjects) {
      rows.push(await this.syncStorageObject(previewStorageObject, options));
    }
    return rows.filter(Boolean);
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
  'previewExtension',
  'identityType',
  'identityId',
  'identityUrl',
  'identityUpdatedAt'
];
const storageObjectIdentityFields = [
  'identityType',
  'identityId',
  'identityUrl',
  'identityUpdatedAt'
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

function getStorageObjectPreviewDataList(content) {
  const contentData = typeof content?.toJSON === 'function' ? content.toJSON() : content;
  if (!contentData?.storageId) {
    return [];
  }
  return uniqueStorageObjectPreviewRows(getStorageObjectPreviewFields(contentData)
    .filter(preview => preview.storageId !== contentData.storageId)
    .map(preview => ({
      storageId: preview.storageId,
      storageType: contentData.storageType,
      mimeType: contentData.previewMimeType,
      extension: contentData.previewExtension,
      size: preview.size,
    })));
}

function getStorageObjectPreviewReferences(content) {
  const contentData = typeof content?.toJSON === 'function' ? content.toJSON() : content;
  if (!contentData?.storageId) {
    return [];
  }
  return uniqueStorageObjectPreviewReferences(getStorageObjectPreviewFields(contentData)
    .filter(preview => preview.storageId !== contentData.storageId)
    .map(preview => ({
      targetStorageId: preview.storageId,
      source: preview.field,
      name: preview.name,
      targetType: contentData.previewMimeType,
      targetSize: preview.size,
    })));
}

function getStorageObjectPreviewFields(contentData) {
  return [
    getStorageObjectPreviewField(contentData, 'large'),
    getStorageObjectPreviewField(contentData, 'medium'),
    getStorageObjectPreviewField(contentData, 'small'),
  ].filter(preview => preview.storageId);
}

function getStorageObjectPreviewField(contentData, name) {
  return {
    name,
    field: `${name}PreviewStorageId`,
    storageId: contentData[`${name}PreviewStorageId`],
    size: contentData[`${name}PreviewSize`],
  };
}

function uniqueStorageObjectPreviewRows(rows) {
  const seenStorageIds = new Set<string>();
  return rows.filter((row) => {
    if (seenStorageIds.has(row.storageId)) {
      return false;
    }
    seenStorageIds.add(row.storageId);
    return true;
  });
}

function uniqueStorageObjectPreviewReferences(references) {
  const seenTargetStorageIds = new Set<string>();
  return references.filter((reference) => {
    if (seenTargetStorageIds.has(reference.targetStorageId)) {
      return false;
    }
    seenTargetStorageIds.add(reference.targetStorageId);
    return true;
  });
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

function getStorageObjectSyncData(storageObjectData) {
  const syncData = {...storageObjectData};
  storageObjectIdentityFields.forEach(field => delete syncData[field]);
  const identityData = getStorageObjectIdentityData(storageObjectData);
  if (identityData) {
    Object.assign(syncData, identityData);
  }
  return syncData;
}

function getStorageObjectIdentityData(identityData) {
  if (!identityData?.identityType || !identityData?.identityId) {
    return null;
  }
  return {
    identityType: identityData.identityType,
    identityId: identityData.identityId,
    identityUrl: identityData.identityUrl,
    identityUpdatedAt: identityData.identityUpdatedAt || new Date(),
  };
}

function getStorageObjectIdentityWhere(identityType: string, identityId: string) {
  if (!identityType || !identityId) {
    return null;
  }
  return {identityType, identityId};
}

function getEmptyStorageIdReferenceCounts() {
  return {
    otherContents: 0,
    previewRefs: 0,
    pinnedStorageObjects: 0,
    remotePinRefs: 0,
    derivedStorageRefs: 0,
    storageObjectChildRefs: 0,
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

function getStorageObjectDeleteSafety(storageId, storageRefs) {
  const storageBlockers = getContentDeleteStorageBlockers(storageRefs);
  return {
    storageId,
    storageRefs,
    storageBlockers,
    blockers: [...storageBlockers],
    safeToRemovePhysical: Boolean(storageId) && storageBlockers.length === 0,
  };
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
    getContentDeleteBlocker('storage', 'remotePinRefs', storageRefs.remotePinRefs),
    getContentDeleteBlocker('storage', 'derivedStorageRefs', storageRefs.derivedStorageRefs),
    getContentDeleteBlocker('storage', 'storageObjectChildRefs', storageRefs.storageObjectChildRefs),
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

function getActiveContentWhere(where: any = {}) {
  return {
    ...where,
    isDeleted: {[Op.ne]: true}
  };
}

function getDeletedOnlyContentWhere(where: any = {}) {
  return {
    ...where,
    isDeleted: true
  };
}

function getDeletedContentPurgeCandidateWhere(cutoff: Date) {
  return getDeletedOnlyContentWhere({
    deletedAt: {[Op.lte]: cutoff}
  });
}

function getContentSearchWhere(baseWhere: any, searchString) {
  if (!searchString) {
    return baseWhere;
  }
  return {
    ...baseWhere,
    [Op.or]: [
      {name: searchString},
      {manifestStorageId: searchString},
      {storageId: searchString},
    ]
  };
}

function getContentRestoreConflictWhere(content) {
  if (!content?.userId || !content?.storageId) {
    return null;
  }
  return getActiveContentWhere({
    id: {[Op.ne]: content.id},
    userId: content.userId,
    storageId: content.storageId
  });
}

function createContentRestoreConflictError(content, conflict?) {
  const error = new Error('content_restore_storage_conflict') as Error & {code?: number; contentId?: number; activeContentId?: number};
  error.code = 409;
  error.contentId = content?.id;
  error.activeContentId = conflict?.id;
  return error;
}

function isContentUserStorageUniqueError(error) {
  return error?.name === 'SequelizeUniqueConstraintError';
}

const storageObjectReferenceMetadataFields = [
  'source',
  'name',
  'targetType',
  'targetSize',
];

function isValidStorageObjectReferenceData(referenceData) {
  if (!referenceData?.sourceStorageId) {
    return false;
  }
  if (!referenceData?.targetStorageId) {
    return false;
  }
  if (!referenceData?.referenceType) {
    return false;
  }
  return true;
}

function getStorageObjectReferenceData(referenceData) {
  const normalizedReferenceData: Partial<IStorageObjectReferenceRecord> = {
    sourceStorageId: referenceData.sourceStorageId,
    targetStorageId: referenceData.targetStorageId,
    referenceType: referenceData.referenceType,
  };
  storageObjectReferenceMetadataFields.forEach((field) => {
    if (isUndefined(referenceData[field])) {
      return;
    }
    normalizedReferenceData[field] = referenceData[field];
  });
  return normalizedReferenceData;
}

function getStorageObjectReferenceUpdateData(storageObjectReference, referenceData) {
  const existingData = typeof storageObjectReference?.toJSON === 'function'
    ? storageObjectReference.toJSON()
    : storageObjectReference;
  const updateData: Record<string, any> = {};
  storageObjectReferenceMetadataFields.forEach((field) => {
    if (isUndefined(referenceData[field])) {
      return;
    }
    if (existingData[field] === referenceData[field]) {
      return;
    }
    updateData[field] = referenceData[field];
  });
  return updateData;
}

function getUniqueStorageReferenceTargets(references: Partial<IStorageObjectReferenceRecord>[] = []) {
  return [...new Set(references.map(reference => reference.targetStorageId).filter(Boolean))];
}

export async function initializeDatabaseModels(sequelize, loadModels = loadDatabaseModels) {
  try {
    return await loadModels(sequelize);
  } catch (error) {
    return cleanupAndRethrow(error, 'database_bootstrap', () => sequelize.close());
  }
}

async function loadDatabaseModels(sequelize) {
  return (await import('./models/index.js')).default(sequelize);
}
