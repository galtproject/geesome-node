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
    IFileCatalogItemType, IContent, IUser
} from "../../database/interface";
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
const uuidAPIKey = require('uuid-apikey');
const bcrypt = require('bcrypt');
const saltRounds = 10;

module.exports = async (extendConfig) => {
    config = _.merge(config, extendConfig || {});
    const app = new GeesomeApp(config);

    app.config.storageConfig.jsNode.pass = await app.getSecretKey('js-ipfs');
    
    console.log('Start storage...');
    app.storage = await require('../../storage/' + config.storageModule)(app);
    
    const frontendPath = __dirname + '/../../../frontend/dist';
    if(fs.existsSync(frontendPath)) {
        const directory = await app.storage.saveDirectory(frontendPath);
        app.frontendStorageId = directory.id;
    }
    
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
    require('../../api/' + config.apiModule)(app, process.env.PORT || 7711);
    
    return app;
};

class GeesomeApp implements IGeesomeApp {
    database: IDatabase;
    storage: IStorage;
    render: IRender;
    authorization: any;
    drivers: any;
    
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
            if(secretKey) {
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
        if(existUserWithName) {
            throw "username_already_exists";
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
                console.log('user', user);
                if (!user) {
                    return null;
                }
                bcrypt.compare(password, user.passwordHash, async function(err, result) {
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
        if(!keyObj) {
            return null;
        }
        
        return this.database.getUser(keyObj.userId);
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

        const content = await this.addContent({
            groupId,
            previewStorageId,
            mimeType: type,
            previewMimeType: previewType as any,
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

        const content = await this.addContent({
            groupId,
            previewStorageId,
            mimeType: type,
            previewMimeType: previewType as any,
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

    private async addContent(contentData: IContent) {
        const content = await this.database.addContent(contentData);
        const baseType = _.first(content.mimeType.split('/'));
        let folder = await this.database.getFileCatalogItemByDefaultFolderFor(content.userId, baseType);
        
        if(!folder) {
            folder = await this.database.addFileCatalogItem({
                name: _.upperFirst(baseType) + " Uploads",
                type: IFileCatalogItemType.Folder,
                position: (await this.database.getFileCatalogItemsCount(content.userId, null)) + 1,
                userId: content.userId,
                defaultFolderFor: baseType
            });
        }

        await this.database.addFileCatalogItem({
            name: content.name || "Unnamed",
            type: IFileCatalogItemType.File,
            position: (await this.database.getFileCatalogItemsCount(content.userId, folder.id)) + 1,
            parentItemId: folder.id,
            contentId: content.id,
            userId: content.userId
        });
        
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

        let type: any = ContentMimeType.Unknown;
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


    async getFileCatalogItems(userId, parentItemId, type?, sortField?, sortDir?, limit?, offset?) {
        if(!parentItemId) {
            parentItemId = null;
        }
        if(!sortField) {
            sortField = 'createdAt';
        }
        if(!sortDir) {
            sortDir = 'desc';
        }
        if(!limit) {
            limit = 20;
        }
        if(!offset) {
            offset = 0;
        }
        return this.database.getFileCatalogItems(userId, parentItemId, type, sortField, sortDir, limit, offset);
    }
    
    async getFileCatalogItemsBreadcrumbs(userId, itemId) {
        const item = await this.database.getFileCatalogItem(itemId);
        if(item.userId != userId) {
            throw "not_permitted";
        }
        
        return this.database.getFileCatalogItemsBreadcrumbs(itemId);
    }
    
    async getContentsIdsByFileCatalogIds(catalogIds) {
        return this.database.getContentsIdsByFileCatalogIds(catalogIds);
    }

    runSeeds() {
        return require('./seeds')(this);
    }
}
