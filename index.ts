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

// import {IDCityDatabase} from "./components/database/interface";
// import {IDCityChainService} from "./components/chain/interface";
// import {IDCityTokenSaleService} from "./components/app/interface";
// import {IDCityAcquiring} from "./components/acquiring/interface";

// const config = require('./config');

import {IGeesomeApp} from "./components/app/interface";

(async() => {
    const databaseConfig: any = {};
    if(process.env.DATABASE_NAME) {
        databaseConfig.name = process.env.DATABASE_NAME;
    }
    
    const app: IGeesomeApp = await require('./components/app/v1')(databaseConfig);
})();

process.on('uncaughtException', (err) => {
    console.error('There was an uncaught error', err);
    // process.exit(1) //mandatory (as per the Node docs)
});
