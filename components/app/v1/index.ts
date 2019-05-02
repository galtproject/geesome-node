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

import {IDatabase} from "../../database/interface";
import {IGeesomeApp} from "../interface";
import {IStorage} from "../../storage/interface";

const config = require('./config');
const _ = require('lodash');

module.exports = async () => {
    const app = new GeesomeApp(config);
    
    console.log('Start database...');
    app.database = await require('../../database/' + config.databaseModule)(config.databaseConfig);
    console.log('Start storage...');
    app.storage = await require('../../storage/' + config.storageModule)(config.storageConfig);

    console.log('Start api...');
    require('../../api/' + config.apiModule)(app, 7711);
    
    return app;
};

class GeesomeApp implements IGeesomeApp {
    database: IDatabase;
    storage: IStorage;
    
    constructor(
        private config
    ) {
    }
    
    savePost(userId, postData) {
        
    }

    saveFile(fileStream) {
        return this.storage.saveFileByContent(fileStream)
    }
    
    getFileStream(filePath) {
        return this.storage.getFileStream(filePath)
    }
}
