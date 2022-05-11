/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {
  IContent,
  IGeesomeDatabaseModule, IInvite,
  IListParams,
  IObject,
  IUser,
  IUserAccount,
  IUserApiKey, IUserAsyncOperation,
  IUserAuthMessage, IUserLimit, IUserOperationQueue
} from "./interface";
import {IGeesomeApp} from "../../interface";

const _ = require("lodash");
const fs = require("fs");
const {Sequelize} = require("sequelize");
const Op = require("sequelize").Op;
const pIteration = require("p-iteration");

let config = require('./config');

module.exports = async function (app: IGeesomeApp) {
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
  }
  config = _.merge(config, app.config.databaseConfig || {});
  let sequelize = new Sequelize(config.name, config.user, config.password, config.options);

  let models;
  try {
    models = await require('./models')(sequelize);
  } catch (e) {
    return console.error('Error', e);
  }

  return new MysqlDatabase(sequelize, models, config);
};

class MysqlDatabase implements IGeesomeDatabaseModule {
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
    if (!_.isUndefined(isDisabled)) {
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
    if (!_.isUndefined(isDisabled)) {
      where['isDisabled'] = isDisabled;
    }

    return this.models.UserApiKey.count({where});
  }

  async updateUser(id, updateData) {
    return this.models.User.update(updateData, {where: {id}})
  }

  getSessionStore() {
    const expressSession = require('express-session');
    const SessionStore = require('express-session-sequelize')(expressSession.Store);
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

  async getContentByStorageAndUserId(storageId, userId) {
    return this.models.Content.findOne({where: {storageId, userId}}) as IContent;
  }

  async getContentByManifestId(manifestStorageId) {
    return this.models.Content.findOne({where: {manifestStorageId}}) as IContent;
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
      include: [ {association: 'avatarImage'}, {association: 'accounts'} ]
    }) as IUser;
  }

  async getUserByNameOrEmail(nameOrEmail) {
    return this.models.User.findOne({
      where: { [Op.or]: [{name: nameOrEmail}, {email: nameOrEmail}] },
      include: [ {association: 'avatarImage'}, {association: 'accounts'} ]
    }) as IUser;
  }

  async getUser(id) {
    if (!id) {
      return null;
    }
    return this.models.User.findOne({
      where: {id},
      include: [ {association: 'avatarImage'}, {association: 'accounts'} ]
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
      include: [ {association: 'avatarImage'}, {association: 'accounts'} ]
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

  async getUserAccount(id) {
    return this.models.UserAccount.findOne({
      where: { id }
    }) as IUserAccount;
  }

  async getUserAccountList(userId) {
    return this.models.UserAccount.findAll({
      where: { userId }
    });
  }

  async getUserAccountByProvider(userId, provider) {
    return this.models.UserAccount.findOne({
      where: {userId, provider}
    }) as IUserAccount;
  }

  async getUserAccountByAddress(provider, address) {
    address = address.toLowerCase();
    return this.models.UserAccount.findOne({
      where: {provider, address},
      include: [{association: 'user'}]
    }) as IUserAccount;
  }

  async createUserAccount(accountData) {
    accountData.address = accountData.address.toLowerCase();
    return this.models.UserAccount.create(accountData);
  }

  async updateUserAccount(id, updateData) {
    updateData.address = updateData.address.toLowerCase();
    return this.models.UserAccount.update(updateData, {where: {id}});
  }

  async createUserAuthMessage(authMessageData) {
    return this.models.UserAuthMessage.create(authMessageData);
  }

  async getUserAuthMessage(id) {
    return this.models.UserAuthMessage.findOne({where: {id}}) as IUserAuthMessage;
  }

  async addInvite(invite) {
    return this.models.Invite.create(invite);
  }

  async updateInvite(id, updateData) {
    return this.models.Invite.update(updateData, {where: {id}})
  }

  async getInvite(id) {
    return this.models.Invite.findOne({where: {id}}) as IInvite;
  }

  async findInviteByCode(code) {
    return this.models.Invite.findOne({where: {code}}) as IInvite;
  }

  async getJoinedByInviteCount(joinedByInviteId) {
    return this.models.User.count({ where: {joinedByInviteId} });
  }

  async getUserInvites(createdById, filters = {}, listParams: IListParams = {}) {
    this.setDefaultListParamsValues(listParams, {sortBy: 'createdAt'});

    const {limit, offset, sortBy, sortDir} = listParams;
    const where = { createdById };
    if (!_.isUndefined(filters['isActive'])) {
      where['isActive'] = _.isUndefined(filters['isActive']);
    }
    return this.models.Post.findAll({
      where,
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getUserInvitesCount(createdById, filters = {}) {
    const where = { createdById };
    if (!_.isUndefined(filters['isActive'])) {
      where['isActive'] = _.isUndefined(filters['isActive']);
    }
    return this.models.Post.findAll({ where });
  }

  async getAllInvites(filters = {}, listParams: IListParams = {}) {
    this.setDefaultListParamsValues(listParams, {sortBy: 'createdAt'});

    const {limit, offset, sortBy, sortDir} = listParams;
    const where = { };
    if (!_.isUndefined(filters['isActive'])) {
      where['isActive'] = _.isUndefined(filters['isActive']);
    }
    return this.models.Post.findAll({
      where,
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async addCorePermission(userId, permissionName) {
    return this.models.CorePermission.create({userId, name: permissionName, isActive: true});
  }

  async removeCorePermission(userId, permissionName) {
    return this.models.CorePermission.destroy({where: {userId, name: permissionName}})
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

  async addUserAsyncOperation(asyncOperationData) {
    return this.models.UserAsyncOperation.create(asyncOperationData);
  }

  async updateUserAsyncOperation(id, updateData) {
    return this.models.UserAsyncOperation.update(updateData, {where: {id}});
  }

  async closeAllAsyncOperation() {
    return this.models.UserAsyncOperation.update({inProcess: false, errorType: 'node-restart'}, {where: {inProcess: true}});
  }

  async getUserAsyncOperation(id) {
    return this.models.UserAsyncOperation.findOne({where: {id}}) as IUserAsyncOperation;
  }

  async getUserAsyncOperationList(userId, name = null, channelLike = null) {
    const where = {userId, inProcess: true};
    if (name) {
      where['name'] = name;
    }
    if (channelLike) {
      where['channel'] = {[Op.like]: channelLike};
    }
    return this.models.UserAsyncOperation.findAll({where, order: [['createdAt', 'DESC']], limit: 100});
  }

  async addUserOperationQueue(userLimitData) {
    return this.models.UserOperationQueue.create(userLimitData);
  }

  async updateUserOperationQueue(id, updateData) {
    return this.models.UserOperationQueue.update(updateData, {where: {id}});
  }

  async updateUserOperationQueueByAsyncOperationId(asyncOperationId, updateData) {
    return this.models.UserOperationQueue.update(updateData, {where: {asyncOperationId}});
  }

  async getWaitingOperationQueueByModule(module) {
    return this.models.UserOperationQueue.findOne({where: {module, isWaiting: true}, order: [['createdAt', 'ASC']], include: [ {association: 'asyncOperation'} ]}) as IUserOperationQueue;
  }

  async getUserOperationQueue(id) {
    return this.models.UserOperationQueue.findOne({where: {id}, include: [ {association: 'asyncOperation'} ]}) as IUserOperationQueue;
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
    listParams.sortBy = listParams.sortBy || defaultParams.sortBy || 'createdAt';
    listParams.sortDir = listParams.sortDir || defaultParams.sortDir || 'desc';
    listParams.limit = parseInt(listParams.limit as any) || defaultParams.limit || 20;
    listParams.offset = parseInt(listParams.offset as any) || defaultParams.offset || 0;
  }
}
