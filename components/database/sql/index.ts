/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {
  GroupType, ICategory,
  IContent,
  IDatabase, IFileCatalogItem, IGroup, IGroupRead, IGroupSection, IInvite,
  IListParams,
  IObject, IPost, IStaticIdHistoryItem,
  IUser,
  IUserAccount,
  IUserApiKey, IUserAsyncOperation,
  IUserAuthMessage, IUserLimit, IUserOperationQueue
} from "../interface";
import {IGeesomeApp} from "../../app/interface";

const _ = require("lodash");
const fs = require("fs");
const {Sequelize} = require("sequelize");
const Op = require("sequelize").Op;
const pIteration = require("p-iteration");
const commonHelpers = require('geesome-libs/src/common');

let config = require('./config');

module.exports = async function (app: IGeesomeApp) {
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
  }
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
      'GroupAdministrators', 'GroupMembers', 'Group', 'UserApiKey', 'User', 'Value', 'Object'
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
    setDefaultListParamsValues(listParams);
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

  async findInviteByCode(code) {
    return this.models.Invite.findOne({where: {code}}) as IInvite;
  }

  async getJoinedByInviteCount(joinedByInviteId) {
    return this.models.User.count({ where: {joinedByInviteId} });
  }

  async getUserInvites(createdById, filters = {}, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams, {sortBy: 'createdAt'});

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

  async getAllInvites(filters = {}, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams, {sortBy: 'createdAt'});

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

  async getGroup(id) {
    return this.models.Group.findOne({
      where: {id},
      include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
    }) as IGroup;
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
      include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
    }) as IGroup;
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

  async setMembersToGroup(userIds, groupId) {
    return (await this.getGroup(groupId)).setMembers(userIds);
  }

  async addMemberToCategory(userId, categoryId) {
    return (await this.getCategory(categoryId)).addMembers([await this.getUser(userId)]);
  }

  async removeMemberFromCategory(userId, categoryId) {
    return (await this.getCategory(categoryId)).removeMembers([await this.getUser(userId)]);
  }

  async getMemberInGroups(userId, types) {
    return (await this.getUser(userId)).getMemberInGroups({
      where: { type: {[Op.in]: types} },
      include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
    });
  }

  async addAdminToGroup(userId, groupId) {
    return (await this.getGroup(groupId)).addAdministrators([await this.getUser(userId)]);
  }

  async setAdminsToGroup(userIds, groupId) {
    return (await this.getGroup(groupId)).setAdministrators(userIds);
  }

  async removeAdminFromGroup(userId, groupId) {
    return (await this.getGroup(groupId)).removeAdministrators([await this.getUser(userId)]);
  }

  async getAdminInGroups(userId, types) {
    return (await this.getUser(userId)).getAdministratorInGroups({
      where: { type: {[Op.in]: types} },
      include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
    });
  }

  async isAdminInGroup(userId, groupId) {
    const result = await (await this.getUser(userId)).getAdministratorInGroups({ where: {id: groupId} });
    return result.length > 0;
  }

  async isMemberInGroup(userId, groupId) {
    const result = await (await this.getUser(userId)).getMemberInGroups({ where: {id: groupId} });
    return result.length > 0;
  }

  async isMemberInCategory(userId, groupId) {
    const result = await (await this.getUser(userId)).getMemberInCategories({ where: {id: groupId} });
    return result.length > 0;
  }

  async getCreatorInGroupsByType(creatorId, type: GroupType) {
    return this.models.Group.findAll({ where: {creatorId, type} });
  }

  async getGroupSection(groupSectionId) {
    return this.models.GroupSection.findOne({ where: {id: groupSectionId} }) as IGroupSection;
  }

  async addGroupSection(post) {
    return this.models.GroupSection.create(post);
  }

  async updateGroupSection(id, updateData) {
    return this.models.GroupSection.update(updateData, {where: {id}});
  }

  getPostsWhere(filters) {
    const where = {
      isDeleted: false
    };
    ['id', 'status', 'replyToId', 'name', 'groupId', 'isDeleted'].forEach((name) => {
      if(filters[name] === 'null') {
        filters[name] = null;
      }
      if(filters[name + 'Ne'] === 'null') {
        filters[name + 'Ne'] = null;
      }
      if(!_.isUndefined(filters[name])) {
        where[name] = filters[name];
      }
      if(!_.isUndefined(filters[name + 'Ne'])) {
        where[name] = {[Op.ne]: filters[name + 'Ne']};
      }
    });
    ['publishedAt'].forEach(field => {
      ['Gt', 'Gte', 'Lt', 'Lte'].forEach((postfix) => {
        if (filters[field + postfix]) {
          if(!where[field]) {
            where[field] = {};
          }
          where[field][Op[postfix.toLowerCase()]] = filters[field + postfix];
        }
      });
    });
    console.log('getPostsWhere', where);
    return where;
  }

  getGroupPostsWhere(groupId, filters) {
    return {
      groupId,
      ...this.getPostsWhere(filters)
    };
  }

  async getGroupPosts(groupId, filters = {}, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams, {sortBy: 'publishedAt'});

    const {limit, offset, sortBy, sortDir} = listParams;

    return this.models.Post.findAll({
      where: this.getGroupPostsWhere(groupId, filters),
      include: [{association: 'contents'}],
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getGroupPostsCount(groupId, filters = {}) {
    return this.models.Post.count({ where: this.getGroupPostsWhere(groupId, filters) });
  }

  async getAllPosts(filters = {}, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams, {sortBy: 'publishedAt'});

    const {limit, offset, sortBy, sortDir} = listParams;

    return this.models.Post.findAll({
      where: this.getPostsWhere(filters),
      include: [{association: 'contents'}],
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getAllPostsCount(filters = {}) {
    return this.models.Post.count({ where: this.getPostsWhere(filters) });
  }

  async getGroupSizeSum(id) {
    return (await this.models.Post.sum('size', {where: {groupId: id}})) || 0;
  }

  async getGroupByParams(params) {
    return this.models.Group.findOne({
      where: params,
      include: [ {association: 'avatarImage'}, {association: 'coverImage'} ]
    }) as IGroup;
  }
  async getGroupSectionByParams(params) {
    return this.models.GroupSection.findOne({ where: params });
  }

  getGroupSectionsWhere(filters) {
    const where = {};
    ['name', 'categoryId'].forEach((name) => {
      if(!_.isUndefined(filters[name])) {
        where[name] = filters[name];
      }
    });
    console.log('getGroupSectionsWhere', where);
    return where;
  }

  async getGroupSections(filters = {}, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams);

    const {limit, offset, sortBy, sortDir} = listParams;

    return this.models.GroupSection.findAll({
      where: this.getGroupSectionsWhere(filters),
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getGroupSectionsCount(filters = {}) {
    return this.models.GroupSection.count({ where: this.getGroupSectionsWhere(filters) });
  }

  async getPostByParams(params) {
    return this.models.Post.findOne({
      where: params,
      include: [{association: 'contents'}, {association: 'group'}],
    }) as IPost;
  }

  async addCategory(group) {
    return this.models.Category.create(group);
  }

  async updateCategory(id, updateData) {
    return this.models.Category.update(updateData, {where: {id}});
  }

  async getCategory(id) {
    return this.models.Category.findOne({ where: {id} }) as ICategory;
  }

  async getCategoryByParams(params) {
    return this.models.Category.findOne({ where: params }) as ICategory;
  }

  async addAdminToCategory(userId, groupId) {
    return (await this.getCategory(groupId)).addAdministrators([await this.getUser(userId)]);
  }

  async removeAdminFromCategory(userId, groupId) {
    return (await this.getCategory(groupId)).removeAdministrators([await this.getUser(userId)]);
  }

  async addGroupToCategory(groupId, categoryId) {
    return (await this.getCategory(categoryId)).addGroups([await this.getGroup(groupId)]);
  }

  async removeGroupFromCategory(groupId, categoryId) {
    return (await this.getCategory(categoryId)).removeGroups([await this.getGroup(groupId)]);
  }

  async isAdminInCategory(userId, categoryId) {
    const result = await (await this.getUser(userId)).getAdministratorInCategories({ where: {id: categoryId} });
    return result.length > 0;
  }

  async getCategoryPosts(categoryId, filters = {}, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams, {sortBy: 'publishedAt'});

    const {limit, offset, sortBy, sortDir} = listParams;

    return this.models.Post.findAll({
      where: this.getPostsWhere(filters),
      include: [
        {association: 'contents'},
        {
          association: 'group', required: true,
          include: [
            {association: 'categories', where: {id: categoryId}, required: true}
          ]
        }
      ],
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getCategoryPostsCount(categoryId, filters = {}) {
    return this.models.Post.count({
      where: this.getPostsWhere(filters),
      include: [
        {
          association: 'group', required: true,
          include: [ {association: 'categories', where: {id: categoryId}, required: true} ]
        }
      ]
    });
  }

  getGroupsWhere(filters) {
    const where = {};
    ['name', 'sectionId'].forEach((name) => {
      if(!_.isUndefined(filters[name])) {
        where[name] = filters[name];
      }
    });
    console.log('getGroupsWhere', where);
    return where;
  }

  getSectionsWhere(filters) {
    const where = {};
    ['name', 'parentSectionId'].forEach((name) => {
      if(!_.isUndefined(filters[name])) {
        where[name] = filters[name];
      }
    });
    console.log('getSectionsWhere', where);
    return where;
  }

  async getCategoryGroups(categoryId, filters = {}, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams, {sortBy: 'createdAt'});

    const {limit, offset, sortBy, sortDir} = listParams;

    return (await this.getCategory(categoryId)).getGroups({
      where: this.getGroupsWhere(filters),
      include: [ {association: 'avatarImage'}, {association: 'coverImage'} ],
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getCategoryGroupsCount(categoryId, filters = {}) {
    return (await this.getCategory(categoryId)).countGroups({
      where: this.getGroupsWhere(filters)
    });
  }

  async getCategorySections(categoryId, filters = {}, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams, {sortBy: 'createdAt'});

    const {limit, offset, sortBy, sortDir} = listParams;

    return this.models.GroupSection.findAll({
      where: {...this.getSectionsWhere(filters), categoryId},
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getCategorySectionsCount(categoryId, filters = {}) {
    return this.models.GroupSection.count({
      where: {...this.getSectionsWhere(filters), categoryId}
    });
  }

  async getPost(id) {
    const post = await this.models.Post.findOne({
      where: {id},
      include: [{association: 'contents'}, {association: 'group'}],
    });

    post.contents = _.orderBy(post.contents, [(content) => {
      return content.postsContents.position;
    }], ['asc']);

    return post;
  }


  async getPostByManifestId(manifestStorageId) {
    const post = await this.models.Post.findOne({
      where: { manifestStorageId },
      include: [{association: 'contents'}]
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
      include: [{association: 'contents'}]
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

  async setPostContents(postId, contentsData) {
    const contents = await pIteration.map(contentsData, async (content, position) => {
      const contentObj: any = await this.getContent(content.id);
      contentObj.postsContents = {position, view: content.view};
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
    }) as IFileCatalogItem;
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
      include: [{association: 'content'}],
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
    return this.models.FileCatalogItem.findOne({where: {userId, parentItemId, contentId}}).then(r => !!r);
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
    if (!id) {
      return null;
    }
    return this.models.FileCatalogItem.findOne({
      where: {id},
      include: [{association: 'content'}]
    }) as IFileCatalogItem;
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

  async addGroupPermission(userId, groupId, permissionName) {
    return this.models.GroupPermission.create({userId, groupId, name: permissionName});
  }

  async removeGroupPermission(userId, groupId, permissionName) {
    return this.models.GroupPermission.destroy({where: {userId, groupId, name: permissionName}})
  }

  async removeAllGroupPermission(userId, groupId) {
    return this.models.GroupPermission.destroy({where: {userId, groupId}})
  }

  async getGroupPermissions(userId, groupId) {
    return this.models.GroupPermission.findAll({where: {userId, groupId}})
  }

  async isHaveGroupPermission(userId, groupId, permissionName) {
    return this.models.GroupPermission.findOne({where: {userId, groupId, name: permissionName}}).then(r => !!r);
  }

  async getGroupRead(userId, groupId) {
    return this.models.GroupRead.findOne({where: {userId, groupId}}) as IGroupRead;
  }

  async addGroupRead(groupReadData) {
    return this.models.GroupRead.create(groupReadData);
  }

  async removeGroupRead(userId, groupId) {
    return this.models.GroupRead.destroy({where: {userId, groupId}})
  }

  async updateGroupRead(id, updateData) {
    return this.models.GroupRead.update(updateData, {where: {id}});
  }

  getAllUsersWhere(searchString?) {
    let where = {};
    if (searchString) {
      where = {[Op.or]: [{name: {[Op.like]: `%${searchString}%`} }, {email: {[Op.like]: `%${searchString}%`}}, {storageAccountId: searchString}]};
    }
    return where;
  }

  async getAllUserList(searchString?, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams);
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
    setDefaultListParamsValues(listParams);
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

  getAllGroupWhere(searchString?) {
    let where = {};
    if (searchString) {
      where = {[Op.or]: [{name: searchString}, {title: searchString}]};
    }
    return where;
  }

  async getAllGroupList(searchString?, listParams: IListParams = {}) {
    setDefaultListParamsValues(listParams);
    const {sortBy, sortDir, limit, offset} = listParams;
    return this.models.Group.findAll({
      where: this.getAllGroupWhere(searchString),
      order: [[sortBy, sortDir.toUpperCase()]],
      limit,
      offset
    });
  }

  async getAllGroupCount(searchString?) {
    return this.models.Group.count({
      where: this.getAllGroupWhere(searchString)
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

  async addStaticIdHistoryItem(staticIdItem) {
    return this.models.StaticIdHistory.create(staticIdItem);
  }

  async getActualStaticIdItem(staticId) {
    return this.models.StaticIdHistory.findOne({where: {staticId}, order: [['boundAt', 'DESC']]}) as IStaticIdHistoryItem;
  }

  async destroyStaticIdHistory(staticId) {
    return this.models.StaticIdHistory.destroy({where: {staticId}});
  }

  async getStaticIdItemByDynamicId(dynamicId) {
    return this.models.StaticIdHistory.findOne({where: {dynamicId}, order: [['boundAt', 'DESC']]}) as IStaticIdHistoryItem;
  }

  async setStaticIdKey(staticId, publicKey, name = null, encryptedPrivateKey = null) {
    return this.models.StaticIdKey.create({staticId, publicKey, name, encryptedPrivateKey});
  }

  async getStaticIdByName(name) {
    return this.models.StaticIdKey.findOne({where: { name }}).then(item => item ? item.staticId : null);
  }

  async getStaticIdPublicKey(staticId = null, name = null) {
    if (!staticId && !name) {
      return null;
    }
    const or = [];
    staticId && or.push({staticId});
    name && or.push({name});
    return this.models.StaticIdKey.findOne({ where: {[Op.or]: or} }).then(item => item ? item.publicKey : null);
  }

  async getStaticIdEncryptedPrivateKey(staticId = null, name = null) {
    if (!staticId && !name) {
      return null;
    }
    const or = [];
    staticId && or.push({staticId});
    name && or.push({name});
    return this.models.StaticIdKey.findOne({ where: {[Op.or]: or} }).then(item => item ? item.encryptedPrivateKey : null);
  }

  async destroyStaticId(staticId = null, name = null) {
    if (!staticId && !name) {
      return null;
    }
    const or = [];
    staticId && or.push({staticId});
    name && or.push({name});
    return this.models.StaticIdKey.destroy({ where: {[Op.or]: or} });
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
