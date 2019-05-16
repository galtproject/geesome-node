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

import {IDatabase, GroupType, GroupView, ContentType, PostStatus, ContentView, IPost} from "../../database/interface";
import {IGeesomeApp} from "../interface";
import {IStorage} from "../../storage/interface";
import {IRender} from "../../render/interface";
import {DriverInput, IDriver} from "../../drivers/interface";

const commonHelper = require('../../../libs/common');
const detecterHelper = require('../../../libs/detecter');
let config = require('./config');
const _ = require('lodash');
const fs = require('fs');
const xkcdPassword = require('xkcd-password')();

module.exports = async (extendConfig) => {
    config = _.merge(config, extendConfig || {});
    console.log(config);
    const app = new GeesomeApp(config);

    app.config.storageConfig.jsNode.pass = await app.getSecretKey('js-ipfs');
    
    console.log('Start storage...');
    app.storage = await require('../../storage/' + config.storageModule)(app);
    
    console.log('Start database...');
    app.database = await require('../../database/' + config.databaseModule)(app);

    app.render = await require('../../render/' + config.renderModule)(app);
    
    app.drivers = require('../../drivers');
    
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
    drivers: any;
    
    constructor(
        public config
    ) {
    }
    
    async getSecretKey(keyName) {
        const keyPath = `${__dirname}/${keyName}.key`;
        let secretKey = fs.readFileSync(keyPath).toString();
        if(secretKey) {
            return secretKey;
        }
        
        secretKey = await xkcdPassword.generate({numWords: 8, minLength: 5, maxLength: 8});
        await new Promise((resolve, reject) => {
            fs.writeFile(keyPath, secretKey, resolve);
        });
        return secretKey;
    }
    
    async checkGroupId(groupId) {
        if(!commonHelper.isNumber(groupId)) {
            const group = await this.database.getGroupByManifestId(groupId);
            if(!group) {
                return false;
            }
            groupId = group.id;
        }
        return groupId;
    }
    
    async canCreatePostInGroup(userId, groupId) {
        if(!groupId) {
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

        await this.updateGroupManifest(group.id);

        return this.database.getGroup(group.id);
    }

    async updateGroup(groupId, updateData) {
        await this.database.updateGroup(groupId, updateData);

        await this.updateGroupManifest(groupId);

        return this.database.getGroup(groupId);
    }

    async createPost(userId, postData) {
        postData.userId = userId;
        postData.groupId = await this.checkGroupId(postData.groupId);

        if(postData.status === PostStatus.Published) {
            postData.localId = await this.getPostLocalId(postData);
            postData.publishedAt = new Date();
        }
        
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
        
        const oldPost = await this.database.getPost(postId);
        
        if(postData.status === PostStatus.Published && !oldPost.localId) {
            postData.localId = await this.getPostLocalId(postData);
        }

        await this.database.setPostContents(postId, contentsIds);

        await this.database.updatePost(postId, postData);
        await this.updatePostManifest(postId);
        
        return this.database.getPost(postId);
    }
    
    async getPostLocalId(post: IPost) {
        if(!post.groupId) {
            return null;
        }
        const group = await this.database.getGroup(post.groupId);
        group.publishedPostsCount++;
        await this.database.updateGroup(group.id, {publishedPostsCount: group.publishedPostsCount});
        return group.publishedPostsCount;
    }

    async getPreview(storageId, fullType, source?) {
        let type;
        if(source) {
            if(detecterHelper.isYoutubeUrl(source)) {
                type = 'youtube-thumbnail';
            }
        }
        if(!type) {
            type = fullType.split('/')[0];
        }
        const extension = fullType.split('/')[1];
        
        const previewDriver = this.drivers.preview[type] as IDriver;
        if(!previewDriver) {
            return {};
        }
        if(previewDriver.supportedInputs[0] === DriverInput.Stream) {
            const inputStream = await this.storage.getFileStream(storageId);
            const {stream: resultStream, type} = await previewDriver.processByStream(inputStream, {extension});
            const storageFile = await this.storage.saveFileByData(resultStream);
            return {
                previewStorageId: storageFile.id,
                previewType: type
            };
        } else if(previewDriver.supportedInputs[0] === DriverInput.Content) {
            const data = await this.storage.getFileData(storageId);
            const {content: resultData, type} = await previewDriver.processByContent(data, {extension});
            const storageFile = await this.storage.saveFileByData(resultData);
            return {
                previewStorageId: storageFile.id,
                previewType: type
            };
        } else if(previewDriver.supportedInputs[0] === DriverInput.Source) {
            const {content: resultData, path, type} = await previewDriver.processBySource(source, {});
            console.log('path', path);
            let storageFile;
            if(path) {
                storageFile = await this.storage.saveFileByPath(path);
            } else {
                storageFile = await this.storage.saveFileByData(resultData);
            }
            
            return {
                previewStorageId: storageFile.id,
                previewType: type
            };
        } else {
            throw type + "_preview_driver_input_not_found";
        }
    }

    async saveData(fileStream, fileName, options) {
        const storageFile = await this.storage.saveFileByData(fileStream);
        
        const existsContent = await this.database.getContentByStorageId(storageFile.id);
        if(existsContent) {
            return existsContent;
        }
        
        const groupId = await this.checkGroupId(options.groupId);
        const group = await this.database.getGroup(groupId);

        const type = this.detectType(storageFile.id, fileName);
        let {previewStorageId, previewType} = await this.getPreview(storageFile.id, type);

        const content = await this.database.addContent({
            groupId,
            type,
            previewStorageId,
            previewType: previewType as any,
            userId: options.userId,
            view: ContentView.List,
            storageId: storageFile.id,
            size: storageFile.size,
            name: fileName,
            isPublic: group.isPublic
        });
        await this.updateContentManifest(content.id);
        
        return content;
    }

    async saveDataByUrl(url, options) {
        options = options || {};

        const name = _.last(url.split('/'));
        let type;
        
        let storageFile;
        if(options.driver && options.driver != 'none') {
            const dataToSave = await this.handleSourceByUploadDriver(url, options.driver);
            storageFile = await this.storage.saveFileByData(dataToSave.stream);
            type = dataToSave.type;
        } else {
            storageFile = await this.storage.saveFileByUrl(url);
            type = this.detectType(storageFile.id, name);
        }

        const existsContent = await this.database.getContentByStorageId(storageFile.id);
        if(existsContent) {
            return existsContent;
        }
        
        const groupId = await this.checkGroupId(options.groupId);
        const group = await this.database.getGroup(groupId);
        let {previewStorageId, previewType} = await this.getPreview(storageFile.id, type, url);

        const content = await this.database.addContent({
            groupId,
            type,
            previewStorageId,
            previewType: previewType as any,
            userId: options.userId,
            view: ContentView.List,
            storageId: storageFile.id,
            size: storageFile.size,
            name: name,
            isPublic: group.isPublic
        });
        await this.updateContentManifest(content.id);

        return content;
    }
    
    async handleSourceByUploadDriver(sourceLink, driver) {
        const previewDriver = this.drivers.upload[driver] as IDriver;
        if(!previewDriver) {
            throw driver + "_upload_driver_not_found";
        }
        if(!_.includes(previewDriver.supportedInputs, DriverInput.Source)) {
            throw driver + "_upload_driver_input_not_correct";
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
        
        const manifestStorageId = await this.generateAndSaveManifest('group', group);

        console.log('bindToStaticId', manifestStorageId, group.manifestStaticStorageId);
        await this.storage.bindToStaticId(manifestStorageId, group.manifestStaticStorageId);
        console.log('updateGroup', groupId);
        
        return this.database.updateGroup(groupId, {
            manifestStorageId
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
        console.log(JSON.stringify(manifestContent, null, ' '));
        return this.storage.saveObject(manifestContent);
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

    getGroupByManifestId(groupId) {
        return this.database.getGroupByManifestId(groupId);
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
