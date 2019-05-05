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

import {IDatabase, GroupType, GroupView, ContentType, PostStatus} from "../../database/interface";
import {IGeesomeApp} from "../interface";
import {IStorage} from "../../storage/interface";

const config = require('./config');
const _ = require('lodash');

module.exports = async () => {
    const app = new GeesomeApp(config);
    
    console.log('Start database...');
    app.database = await require('../../database/' + config.databaseModule)(app);
    
    if((await app.database.getUsersCount()) === 0) {
        console.log('Run seeds...');
        await app.runSeeds();
    }
    
    console.log('Start storage...');
    app.storage = await require('../../storage/' + config.storageModule)(app);
    
    app.authorization = await require('../../authorization/' + config.authorizationModule)(app);

    console.log('Start api...');
    require('../../api/' + config.apiModule)(app, 7711);
    
    return app;
};

class GeesomeApp implements IGeesomeApp {
    database: IDatabase;
    storage: IStorage;
    authorization: any;
    
    constructor(
        public config
    ) {
    }
    
    savePost(userId, postData) {
        
    }

    async saveContent(fileStream, fileName, userId, groupId) {
        const ipfsFile = await this.storage.saveFileByContent(fileStream);
        const group = await this.database.getGroup(groupId);
        const ext = _.end(fileName.split('.')).toLowerCase();
        
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
        
        return this.database.addContent({
            userId,
            groupId,
            type,
            storageId: ipfsFile.id,
            storageAccountId: ipfsFile.storageAccountId,
            size: ipfsFile.size,
            name: fileName,
            isPublic: group.isPublic
        })
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

    runSeeds() {
        return require('./seeds')(this);
    }
}
