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

import {GroupType, IDatabase, IListParams} from "../interface";
import {IGeesomeApp} from "../../app/interface";

const _ = require("lodash");
const Sequelize = require("sequelize");
const pIteration = require("p-iteration");
const Op = Sequelize.Op;
const commonHelpers = require('@galtproject/geesome-libs/src/common');

let config = require('./config');

module.exports = async function (app: IGeesomeApp) {
  config = _.merge(config, app.config.databaseConfig || {});
  let sequelize = new Sequelize(config.name, config.user, config.password, config.options);

  let models;
  try {
    models = await require('./models/index')(sequelize);
  } catch (e) {
    return console.error('Error', e);
  }

  return new MysqlDatabase(sequelize, models, config);
};

class MysqlDatabase implements IDatabase {
  sequelize: any;
  models: any;
  config: any;

  constructor(_sequelize, _models, _config) {
    this.sequelize = _sequelize;
    this.models = _models;
    this.config = _config;
  }

  async addApiKey(apiKey) {
    return this.models.UserApiKey.create(apiKey);
  }

  async getApiKeyByHash(valueHash) {
    return this.models.UserApiKey.findOne({where: {valueHash, isDisabled: false}});
  }

  async getApiKeysByUser(userId, isDisabled?, search?, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams);

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
      'FileCatalogItemPermission', 'FileCatalogItem', 'Category', 'CorePermission',
      'UserContentAction', 'UserLimit', 'AutoTag', 'Tag', 'Content', 'PostsContents', 'Post', 'GroupPermission',
      'GroupAdministrators', 'GroupMembers', 'Group', 'User', 'Value'
    ], (modelName) => {
      return this.models[modelName].destroy({where: {}});
    });
  }

  async addContent(content) {
    return this.models.Content.create(content);
  }

  async updateContent(id, updateData) {
    return this.models.Content.update(updateData, {where: {id}})
  }

  async deleteContent(id) {
    return this.models.Content.destroy({where: {id}})
  }

  async getContentList(userId, listParams: IListParams = {}) {
    const {limit, offset} = listParams;
    return this.models.Content.findAll({
      where: {userId},
      order: [
        ['createdAt', 'DESC']
      ],
      limit,
      offset
    });
  }

  async getContent(id) {
    return this.models.Content.findOne({where: {id}});
  }

  async getContentByStorageId(storageId) {
    return this.models.Content.findOne({where: {storageId}});
  }

  async getContentByManifestId(manifestStorageId) {
    return this.models.Content.findOne({where: {manifestStorageId}});
  }

  async getUsersCount() {
    return this.models.User.count();
  }

  async addUser(user) {
    return this.models.User.create(user);
  }

  async getUserByName(name) {
    return this.models.User.findOne({where: {name}});
  }

  async getUserByNameOrEmail(nameOrEmail) {
    return this.models.User.findOne({
      where: {
        [Op.or]: [{name: nameOrEmail}, {email: nameOrEmail}]
      }
    });
  }

  async getUser(id) {
    return this.models.User.findOne({
      where: {id},
      include: [
        {model: this.models.Content, as: 'avatarImage'}
      ]
    });
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
      include: [
        {model: this.models.Content, as: 'avatarImage'}
      ]
    });
  }

  async addUserFriend(userId, friendId) {
    return (await this.getUser(userId)).addFriends([await this.getUser(friendId)]);
  }

  async removeUserFriend(userId, friendId) {
    return (await this.getUser(userId)).removeFriends([await this.getUser(friendId)]);
  }

  async getUserFriends(userId, search?, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams);
    const {limit, offset} = listParams;
    //TODO: use search and order
    return (await this.getUser(userId)).getFriends({
      include: [
        {model: this.models.Content, as: 'avatarImage'}
      ],
      limit,
      offset
    });
  }

  async getUserFriendsCount(userId, search?) {
    //TODO: use search
    return (await this.getUser(userId)).countFriends();
  }

  async getGroup(id) {
    return this.models.Group.findOne({
      where: {id},
      include: [
        {model: this.models.Content, as: 'avatarImage'},
        {model: this.models.Content, as: 'coverImage'}
      ]
    });
  }

  async getGroupByManifestId(id?, staticId?) {
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
    return this.models.Group.findOne({
      where: {[Op.or]: whereOr},
      include: [
        {model: this.models.Content, as: 'avatarImage'},
        {model: this.models.Content, as: 'coverImage'}
      ]
    });
  }

  async getGroupWhereStaticOutdated(outdatedForSeconds) {
    return this.models.Group.findAll({
      where: {
        staticStorageUpdatedAt: {
          [Op.lt]: commonHelpers.moveDate(-parseFloat(outdatedForSeconds), 'second')
        }
      }
    });
  }

  async getRemoteGroups() {
    return this.models.Group.findAll({ where: { isRemote: true } });
  }

  async getPersonalChatGroups() {
    return this.models.Group.findAll({where: {type: GroupType.PersonalChat}});
  }

  async addGroup(group) {
    return this.models.Group.create(group);
  }

  async updateGroup(id, updateData) {
    return this.models.Group.update(updateData, {where: {id}});
  }

  async addMemberToGroup(userId, groupId) {
    return (await this.getGroup(groupId)).addMembers([await this.getUser(userId)]);
  }

  async removeMemberFromGroup(userId, groupId) {
    return (await this.getGroup(groupId)).removeMembers([await this.getUser(userId)]);
  }

  async getMemberInGroups(userId, types) {
    return (await this.getUser(userId)).getMemberInGroups({
      where: {
        type: {[Op.in]: types}
      },
      include: [
        {model: this.models.Content, as: 'avatarImage'},
        {model: this.models.Content, as: 'coverImage'}
      ]
    });
  }

  async addAdminToGroup(userId, groupId) {
    return (await this.getGroup(groupId)).addAdministrators([await this.getUser(userId)]);
  }

  async removeAdminFromGroup(userId, groupId) {
    return (await this.getGroup(groupId)).removeAdministrators([await this.getUser(userId)]);
  }

  async getAdminInGroups(userId, types) {
    return (await this.getUser(userId)).getAdministratorInGroups({
      where: {
        type: {[Op.in]: types}
      },
      include: [
        {model: this.models.Content, as: 'avatarImage'},
        {model: this.models.Content, as: 'coverImage'}
      ]
    });
  }

  async isAdminInGroup(userId, groupId) {
    const result = await (await this.getUser(userId)).getAdministratorInGroups({
      where: {id: groupId}
    });
    return result.length > 0;
  }

  async isMemberInGroup(userId, groupId) {
    const result = await (await this.getUser(userId)).getMemberInGroups({
      where: {id: groupId}
    });
    return result.length > 0;
  }

  async getCreatorInGroupsByType(creatorId, type: GroupType) {
    return this.models.Group.findAll({
      where: {creatorId, type}
    });
  }

  async getGroupPosts(groupId, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams, {sortBy: 'publishedAt'});

    const {limit, offset, sortBy, sortDir} = listParams;

    return this.models.Post.findAll({
      where: {groupId},
      include: [{model: this.models.Content, as: 'contents'}],
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getGroupSizeSum(id) {
    return (await this.models.Post.sum('size', {where: {groupId: id}})) || 0;
  }

  async getPost(id) {
    const post = await this.models.Post.findOne({
      where: {id},
      include: [{model: this.models.Content, as: 'contents'}]
    });

    post.contents = _.orderBy(post.contents, [(content) => {
      return content.postsContents.position;
    }], ['asc']);

    return post;
  }


  async getPostByManifestId(manifestStorageId) {
    const post = await this.models.Post.findOne({
      where: { manifestStorageId },
      include: [{model: this.models.Content, as: 'contents'}]
    });

    post.contents = _.orderBy(post.contents, [(content) => {
      return content.postsContents.position;
    }], ['asc']);

    return post;
  }


  async getPostByGroupManifestIdAndLocalId(groupManifestStorageId, localId) {
    const group = await this.getGroupByManifestId(groupManifestStorageId, groupManifestStorageId);
    
    if(!group) {
      return null;
    }
    
    const post = await this.models.Post.findOne({
      where: { localId, groupId: group.id },
      include: [{model: this.models.Content, as: 'contents'}]
    });

    post.contents = _.orderBy(post.contents, [(content) => {
      return content.postsContents.position;
    }], ['asc']);

    return post;
  }


  async addPost(post) {
    return this.models.Post.create(post);
  }

  async updatePost(id, updateData) {
    return this.models.Post.update(updateData, {where: {id}});
  }

  async setPostContents(postId, contentsIds) {
    const contents = await pIteration.map(contentsIds, async (contentId, position) => {
      const contentObj: any = await this.getContent(contentId);
      contentObj.postsContents = {position};
      return contentObj;
    });
    return (await this.getPost(postId)).setContents(contents);
  }

  async getPostSizeSum(id) {
    const post = await this.getPost(id);
    return _.sumBy(post.contents, 'size');
  }

  async getFileCatalogItemByDefaultFolderFor(userId, defaultFolderFor) {
    return this.models.FileCatalogItem.findOne({
      where: {userId, defaultFolderFor}
    });
  }

  async getFileCatalogItems(userId, parentItemId, type = null, search = '', listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams);

    const {limit, offset, sortBy, sortDir} = listParams;
    const where: any = {userId, type, isDeleted: false};

    if (!_.isUndefined(parentItemId)) {
      where.parentItemId = parentItemId;
    }

    if (search) {
      where['name'] = {[Op.like]: search};
    }

    return this.models.FileCatalogItem.findAll({
      where,
      order: [[sortBy, sortDir.toUpperCase()]],
      include: [{model: this.models.Content, as: 'content'}],
      limit,
      offset
    });
  }

  async getFileCatalogItemsByContent(userId, contentId, type = null, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams);
    const {sortBy, sortDir, limit, offset} = listParams;

    return this.models.FileCatalogItem.findAll({
      where: {userId, contentId, type, isDeleted: false},
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getFileCatalogItemsCount(userId, parentItemId, type = null, search = '') {
    const where: any = {userId, type, isDeleted: false};

    if (!_.isUndefined(parentItemId)) {
      where.parentItemId = parentItemId;
    }

    if (search) {
      where['name'] = {[Op.like]: search};
    }

    return this.models.FileCatalogItem.count({where});
  }

  async isFileCatalogItemExistWithContent(userId, parentItemId, contentId) {
    return this.models.FileCatalogItem.findOne({where: {userId, parentItemId, contentId}});
  }

  async getFileCatalogItemsBreadcrumbs(childItemId) {
    const breadcrumbs = [];
    if (!childItemId) {
      return breadcrumbs;
    }
    const maxNesting = 20;

    let currentItemId = childItemId;
    while (currentItemId) {
      const currentItem = await this.getFileCatalogItem(currentItemId);
      breadcrumbs.push(currentItem);
      currentItemId = currentItem.parentItemId;

      if (breadcrumbs.length >= maxNesting || !currentItemId) {
        return _.reverse(breadcrumbs);
      }
    }
    return _.reverse(breadcrumbs);
  }

  async getFileCatalogItem(id) {
    return this.models.FileCatalogItem.findOne({where: {id}});
  }

  async addFileCatalogItem(item) {
    return this.models.FileCatalogItem.create(item);
  }

  async updateFileCatalogItem(id, updateData) {
    return this.models.FileCatalogItem.update(updateData, {where: {id}});
  }

  async getFileCatalogItemsSizeSum(parentItemId) {
    return this.models.FileCatalogItem.sum('size', {
      where: {parentItemId}
    });
  }

  async getContentsIdsByFileCatalogIds(catalogIds) {
    const links = await this.models.FileCatalogItem.findAll({
      attributes: ['id', 'linkOfId'],
      where: {id: {[Op.in]: catalogIds}, linkOfId: {[Op.ne]: null}}
    });

    let allCatalogIds = _.difference(catalogIds, links.map((link) => link.id));
    allCatalogIds = allCatalogIds.concat(links.map((link) => link.linkOfId));

    const folders = await this.models.FileCatalogItem.findAll({
      attributes: ['id'],
      where: {id: {[Op.in]: allCatalogIds}, type: 'folder'}
    });

    allCatalogIds = _.difference(allCatalogIds, folders.map((folder) => folder.id));

    await pIteration.forEachSeries(folders, async (folder) => {
      const files = await this.models.FileCatalogItem.findAll({
        attributes: ['id'],
        where: {parentItemId: folder.id, type: 'file'}
      });

      allCatalogIds = allCatalogIds.concat(files.map(f => f.id));
    });

    return (await this.models.FileCatalogItem.findAll({
      attributes: ['contentId'],
      where: {id: {[Op.in]: allCatalogIds}}
    })).map(f => f.contentId);
  }

  async addCorePermission(userId, permissionName) {
    return this.models.CorePermission.create({userId, name: permissionName});
  }

  async removeCorePermission(userId, permissionName) {
    return this.models.CorePermission.destroy({where: {userId, name: permissionName}})
  }

  async isHaveCorePermission(userId, permissionName) {
    return this.models.CorePermission.findOne({where: {userId, name: permissionName}});
  }

  async getAllUserList(searchString, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams);
    const {sortBy, sortDir, limit, offset} = listParams;

    let where = {};
    if (searchString) {
      where = {[Op.or]: [{name: searchString}, {email: searchString}]};
    }
    return this.models.User.findAll({
      where,
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getAllContentList(searchString, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams);
    const {sortBy, sortDir, limit, offset} = listParams;

    let where = {};
    if (searchString) {
      where = {name: searchString};
    }
    return this.models.Content.findAll({
      where,
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getAllGroupList(searchString, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams);
    const {sortBy, sortDir, limit, offset} = listParams;

    let where = {};
    if (searchString) {
      where = {[Op.or]: [{name: searchString}, {title: searchString}]};
    }
    return this.models.Group.findAll({
      where,
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
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
    return this.models.UserLimit.findOne({where: {userId, name}});
  }

  async addStaticIdHistoryItem(staticIdItem) {
    return this.models.StaticIdHistory.create(staticIdItem);
  }

  async getActualStaticIdItem(staticId) {
    return this.models.StaticIdHistory.findOne({where: {staticId}, order: [['boundAt', 'DESC']]});
  }

  async getStaticIdItemByDynamicId(dynamicId) {
    return this.models.StaticIdHistory.findOne({where: {dynamicId}, order: [['boundAt', 'DESC']]});
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
}


function setDefaultListParamsValues(listParams: IListParams, defaultParams: IListParams = {}) {
  listParams.sortBy = listParams.sortBy || defaultParams.sortBy || 'createdAt';
  listParams.sortDir = listParams.sortDir || defaultParams.sortDir || 'desc';
  listParams.limit = parseInt(listParams.limit as any) || defaultParams.limit || 20;
  listParams.offset = parseInt(listParams.offset as any) || defaultParams.offset || 0;
}
