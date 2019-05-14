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

import {IDatabase} from "../interface";
import {IGeesomeApp} from "../../app/interface";

const _ = require("lodash");
const Sequelize = require("sequelize");
const pIteration = require("p-iteration");
const Op = Sequelize.Op;

let config = require('./config');

module.exports = async function(app: IGeesomeApp) {
    console.log('extendConfig.databaseConfig', app.config.databaseConfig);
    config = _.merge(config, app.config.databaseConfig || {});
    console.log('config', config);
    
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

    async flushDatabase() {
        await this.models.Content.destroy({ where: { } });
        await this.models.PostsContents.destroy({ where: { } });
        await this.models.Folder.destroy({ where: { } });
        await this.models.Post.destroy({ where: { } });
        await this.models.GroupPermission.destroy({ where: { } });
        await this.models.GroupAdministrators.destroy({ where: { } });
        await this.models.GroupMembers.destroy({ where: { } });
        await this.models.Group.destroy({ where: { } });
        await this.models.User.destroy({ where: { } });
        await this.models.Value.destroy({ where: { } });
    }

    async addContent(content) {
        return this.models.Content.create(content);
    }

    async updateContent(id, updateData) {
        return this.models.Content.update(updateData, {where: { id } })
    }

    async deleteContent(id) {
        return this.models.Content.destroy({where: { id } })
    }

    async getContentList(userId, limit?, offset?) {
        return this.models.Content.findAll({ 
            where: { userId },
            order: [
                ['createdAt', 'DESC']
            ],
            limit,
            offset
        });
    }

    async getContent(id) {
        return this.models.Content.findOne({ where: { id } });
    }
    async getContentByStorageId(storageId) {
        return this.models.Content.findOne({ where: { storageId } });
    }

    async getUsersCount() {
        return this.models.User.count();
    }

    async addUser(user) {
        return this.models.User.create(user);
    }

    async getUserByName(name) {
        return this.models.User.findOne({ where: { name } });
    }

    async getUser(id) {
        return this.models.User.findOne({ where: { id } });
    }

    async getGroup(id) {
        return this.models.Group.findOne({ 
            where: { id },
            include: [
                { model: this.models.Content, as: 'avatarImage'},
                { model: this.models.Content, as: 'coverImage'}
            ]
        });
    }
    
    async getGroupByManifestId(id) {
        return this.models.Group.findOne({
            where: { [Op.or]: [{manifestStorageId: id}, {manifestStaticStorageId: id}]},
            include: [
                { model: this.models.Content, as: 'avatarImage'},
                { model: this.models.Content, as: 'coverImage'}
            ]
        });
    }

    async addGroup(group) {
        return this.models.Group.create(group);
    }
    
    async updateGroup(id, updateData) {
        return this.models.Group.update(updateData, {where: { id } });
    }

    async addMemberToGroup(userId, groupId) {
        return (await this.getGroup(groupId)).addMembers([await this.getUser(userId)]);
    }
    
    async getMemberInGroups(userId) {
        return (await this.getUser(userId)).getMemberInGroups({
            include: [
                { model: this.models.Content, as: 'avatarImage'},
                { model: this.models.Content, as: 'coverImage'}
            ]
        });
    }

    async addAdminToGroup(userId, groupId) {
        return (await this.getGroup(groupId)).addAdministrators([await this.getUser(userId)]);
    }

    async getAdminInGroups(userId) {
        return (await this.getUser(userId)).getAdministratorInGroups({
            include: [
                { model: this.models.Content, as: 'avatarImage'},
                { model: this.models.Content, as: 'coverImage'}
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

    async getGroupPosts(groupId, sortDir, limit, offset) {
        sortDir = sortDir || 'DESC';
        limit = parseInt(limit) || 10;
        offset = parseInt(offset) || 0;
        return this.models.Post.findAll({ 
            where: { groupId },
            include: [{ model: this.models.Content, as: 'contents'}],
            order: [['publishedAt', sortDir.toUpperCase()]],
            limit,
            offset
        });
    }

    async getPost(id) {
        return this.models.Post.findOne({
            where: { id },
            include: [{ model: this.models.Content, as: 'contents'}]
        });
    }
    
    async addPost(post) {
        return this.models.Post.create(post);
    }

    async updatePost(id, updateData) {
        return this.models.Post.update(updateData, {where: { id } });
    }

    async setPostContents(postId, contentsIds) {
        const contents = await pIteration.map(contentsIds, async (contentId, position) => {
            const contentObj: any = this.getContent(contentId);
            contentObj.PostsContents = { position };
            return contentObj;
        });
        return (await this.getPost(postId)).setContents(contents);
    }
    
    async getValue(key: string) {
        const valueObj = await this.models.Value.findOne({ where: { key } });
        return valueObj ? valueObj.content : null;
    }

    async setValue(key: string, content: string) {
        const valueObj = await this.models.Value.findOne({ where: { key } });
        if(valueObj) {
            return valueObj.update({ content }, {where: { key } })
        } else {
            return this.models.Value.create({ key, content });
        }
    }

    async clearValue(key: string) {
        return this.models.Value.destroy({ where: { key } });
    }
}
