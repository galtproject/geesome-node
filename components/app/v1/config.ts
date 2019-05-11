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

module.exports = {
    databaseModule: 'mysql',
    databaseConfig: {},
    storageModule: 'js-ipfs',
    storageConfig: {
        //TODO: get from .env
        pass: 'traffic enough crater wear tissue term town have switch exhibit onion asset'
    },
    apiModule: 'http',
    apiConfig: {},
    authorizationModule: 'passport',
    authorizationConfig: {},
    renderModule: 'entity-json-manifest',
    renderConfig: {}
};
