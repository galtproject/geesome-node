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
import pIteration from 'p-iteration';
import {Sequelize, Op} from "sequelize";
import expressSession from 'express-session';
import expressSessionSequelize from 'express-session-sequelize';
import {IGeesomeApp} from "../../interface.js";
import config from './config.js';
import {
  IContent,
  IGeesomeDatabaseModule,
  IListParams,
  IObject,
  IUser,
  IUserApiKey,
  IUserLimit
} from "./interface.js";
const {merge, isUndefined} = _;
const SessionStore = expressSessionSequelize(expressSession.Store);
const maxListLimit = 10000;

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value as any, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function sanitizeSortBy(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    return fallback;
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

  return new PostgresDatabase(sequelize, models, config) as IGeesomeDatabaseModule;
};

class PostgresDatabase implements IGeesomeDatabaseModule {
  sequelize: any;
  models: any;
  config: any;

  constructor(_sequelize, _models, _config) {
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
    this.setDefaultListParamsValues(listParams);

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
      'CorePermission', 'UserContentAction', 'UserLimit', 'Content', 'UserApiKey', 'User', 'Value', 'Object'
    ], (modelName) => {
      return this.models[modelName].destroy({where: {}});
    });
  }

  async addContent(content) {
    return this.models.Content.create(content);
  }

  async updateContent(id, updateData) {
    console.log('updateContent', 'id', id, 'updateData', updateData);
    return this.models.Content.update(updateData, {where: {id}})
  }

  async deleteContent(id) {
    return this.models.Content.destroy({where: {id}})
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
    let where;
    if(findByPreviews) {
      where = {[Op.or]: [{storageId}, {largePreviewStorageId: storageId}, {mediumPreviewStorageId: storageId}, {smallPreviewStorageId: storageId}]};
    } else {
      where = {storageId};
    }
    return this.models.Content.findOne({ where }) as IContent;
  }

  // A1 shared-content seam (see docs/database-scalability-review.md). Returns a single Content row
  // for shared metadata reads (public file/preview headers, MIME type, size). Multiple users may own
  // separate Content rows with the same storageId; pick the oldest by id for deterministic
  // tie-breaking so the same physical object always resolves to the same metadata row across calls.
  // When the A2 carve-out lands, this helper switches to read from the canonical contentAssets
  // table without any caller change.
  async getSharedContentByStorageId(storageId, opts: {includePreviews?: boolean} = {}) {
    const where = opts.includePreviews
      ? {[Op.or]: [{storageId}, {largePreviewStorageId: storageId}, {mediumPreviewStorageId: storageId}, {smallPreviewStorageId: storageId}]}
      : {storageId};
    return this.models.Content.findOne({where, order: [['id', 'ASC']]}) as IContent;
  }

  // A1 reference-count helper for physical storage objects. Used by deleteFileCatalogItem before
  // unpinning/removing the storage object so a delete by one user cannot break another user's row,
  // a Content row that uses the storageId as a preview, or a future canonical asset.
  async countStorageIdReferences(storageId, excludeContentId?: number) {
    const otherContentsWhere: any = {storageId};
    if (excludeContentId) {
      otherContentsWhere.id = {[Op.ne]: excludeContentId};
    }
    const [otherContents, previewRefs] = await Promise.all([
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
    ]);
    return {otherContents, previewRefs};
  }

  // A1 reference-count helper for a specific Content row. Used by delete paths to detect
  // attachments/avatars/covers/file-catalog references that would orphan if the row is destroyed.
  async countContentReferences(contentId) {
    const [posts, fileCatalogItems, groupAvatars, groupCovers, userAvatars] = await Promise.all([
      this.models.PostsContents.count({where: {contentId}}),
      this.models.FileCatalogItem.count({where: {contentId}}),
      this.models.Group.count({where: {avatarImageId: contentId}}),
      this.models.Group.count({where: {coverImageId: contentId}}),
      this.models.User.count({where: {avatarImageId: contentId}}),
    ]);
    return {posts, fileCatalogItems, groupAvatars, groupCovers, userAvatars};
  }

  async getContentByStorageAndUserId(storageId, userId) {
    return this.models.Content.findOne({where: {storageId, userId}}) as IContent;
  }

  async getContentByStorageIdListAndUserId(storageIdList, userId) {
    return this.models.Content.findAll({where: {storageId: {[Op.in]: storageIdList}, userId}}) as IContent;
  }

  async getContentByManifestId(manifestStorageId) {
    return this.models.Content.findOne({where: {manifestStorageId}}) as IContent;
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
    this.setDefaultListParamsValues(listParams);
    const {limit, offset} = listParams;
    //TODO: use search and order
    return (await this.getUser(userId)).getFriends({
      include: [ {association: 'avatarImage'} ],
      limit,
      offset
    });
  }

  async getUserFriendsCount(userId, search?) {
    //TODO: use search
    return (await this.getUser(userId)).countFriends();
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
    this.setDefaultListParamsValues(listParams);
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
    this.setDefaultListParamsValues(listParams);
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

  async getUserContentActionsSizeSum(userId, name, periodTimestamp?) {
    const where: any = {userId, name};

    if (periodTimestamp) {
      let from = new Date(new Date().getTime() - periodTimestamp * 1000);
      where.createdAt = {[Op.gte]: from};
    }

    return (await this.models.UserContentAction.sum('size', {where})) || 0;
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

  setDefaultListParamsValues(listParams: IListParams, defaultParams: IListParams = {}) {
    const defaultSortBy = sanitizeSortBy(defaultParams.sortBy, 'createdAt');
    const defaultSortDir = sanitizeSortDir(defaultParams.sortDir, 'DESC');
    const defaultLimit = parseNonNegativeInteger(defaultParams.limit, 20);
    const defaultOffset = parseNonNegativeInteger(defaultParams.offset, 0);
    listParams.sortBy = sanitizeSortBy(listParams.sortBy, defaultSortBy);
    listParams.sortDir = sanitizeSortDir(listParams.sortDir, defaultSortDir);
    listParams.limit = Math.min(parseNonNegativeInteger(listParams.limit, defaultLimit), maxListLimit);
    listParams.offset = parseNonNegativeInteger(listParams.offset, defaultOffset);
  }
}
