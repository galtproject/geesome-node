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

import {IDatabase, GroupType, GroupView, ContentType, PostStatus, ContentView} from "../../database/interface";
import {IGeesomeApp} from "../interface";
import {IStorage} from "../../storage/interface";
import {IRender} from "../../render/interface";

const config = require('./config');
const _ = require('lodash');

module.exports = async () => {
    const app = new GeesomeApp(config);

    console.log('Start storage...');
    app.storage = await require('../../storage/' + config.storageModule)(app);
    
    console.log('Start database...');
    app.database = await require('../../database/' + config.databaseModule)(app);
    
    if((await app.database.getUsersCount()) === 0) {
        console.log('Run seeds...');
        await app.runSeeds();
    }
    
    app.authorization = await require('../../authorization/' + config.authorizationModule)(app);

    console.log('Start api...');
    require('../../api/' + config.apiModule)(app, 7711);
    
    return app;
};

class GeesomeApp implements IGeesomeApp {
    database: IDatabase;
    storage: IStorage;
    render: IRender;
    authorization: any;
    
    constructor(
        public config
    ) {
    }
    
    async canCreatePostInGroup(userId, groupId) {
        return this.database.isAdminInGroup(userId, groupId);
    }

    async createPost(userId, postData) {
        const storageAccountId = await this.storage.getCurrentAccountId();

        postData.userId = userId;
        postData.storageAccountId = storageAccountId;
        
        const contentsIds = postData.contentsIds;
        delete postData.contentsIds;
        
        const post = await this.database.addPost(postData);

        await this.database.setPostContents(post.id, contentsIds);
        await this.updatePostManifest(post.id);

        return this.database.getPost(post.id);
    }

    async updatePost(userId, postId, postData) {
        const contentsIds = postData.contentsIds;
        delete postData.contentsIds;

        await this.database.setPostContents(postId, contentsIds);

        await this.database.updatePost(postId, postData);
        await this.updatePostManifest(postId);
        
        return this.database.getPost(postId);
    }

    async saveData(fileStream, fileName, userId, groupId) {
        const storageFile = await this.storage.saveFileByData(fileStream);
        const group = await this.database.getGroup(groupId);
        
        const content = await this.database.addContent({
            userId,
            groupId,
            type: this.detectType(storageFile.id, fileName),
            view: ContentView.List,
            storageId: storageFile.id,
            size: storageFile.size,
            name: fileName,
            isPublic: group.isPublic
        });
        await this.updateContentManifest(content.id);
        
        return content;
    }

    async saveDataByUrl(url, userId, groupId) {
        const storageFile = await this.storage.saveFileByUrl(url);
        const group = await this.database.getGroup(groupId);

        const name = _.last(url.split('/'));
        const content = await this.database.addContent({
            userId,
            groupId,
            type: this.detectType(storageFile.id, name),
            view: ContentView.List,
            storageId: storageFile.id,
            size: storageFile.size,
            name: name,
            isPublic: group.isPublic
        });
        await this.updateContentManifest(content.id);

        return content;
    }
    
    async updatePostManifest(postId) {
        const post = await this.database.getPost(postId);
        
        await this.database.updatePost(postId, {
            manifestStorageId: await this.generateAndSaveManifest('post', post)
        });
        
        return this.database.updateGroup(post.groupId, {
            manifestStorageId: await this.generateAndSaveManifest('group', await this.database.getGroup(post.groupId))
        });
    }

    async updateContentManifest(contentId) {
        return this.database.updateContent(contentId, {
            manifestStorageId: await this.generateAndSaveManifest('content', await this.database.getContent(contentId))
        });
    }
    
    private detectType(storageId, fileName) {
        const ext = _.last(fileName.split('.')).toLowerCase();

        let type: any = ContentType.Unknown;
        if(_.includes(['jpg', 'jpeg', 'png', 'gif'], ext)) {
            type = 'image/' + ext;
        }
        if(_.includes(['html', 'htm'], ext)) {
            type = 'text/' + ext;
        }
        if(_.includes(['md'], ext)) {
            type = 'text/' + ext;
        }
        if(_.includes(['txt'], ext)) {
            type = 'text';
        }
        return type;
    }
    
    private async generateAndSaveManifest(entityName, entityObj) {
        const manifestContent = await this.render.generateContent(entityName + '-manifest', entityObj);
        const storageManifestFile = await this.storage.saveFileByData(manifestContent);
        return storageManifestFile.id
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

    getGroup(groupId) {
        return this.database.getGroup(groupId);
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

    runSeeds() {
        return require('./seeds')(this);
    }
}
