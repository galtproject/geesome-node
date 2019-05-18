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

module.exports = async function(sequelize) {
    const models: any = {};

    models.User = await require('./user')(sequelize, models);
    models.UserApiKey = await require('./userApiKey')(sequelize, models);
    
    models.Group = await require('./group')(sequelize, models);
    models.GroupPermission = await require('./groupPermission')(sequelize, models);
    models.Post = await require('./post')(sequelize, models);
    models.Content = await require('./content')(sequelize, models);
    
    models.FileCatalogItem = await require('./fileCatalogItem')(sequelize, models);
    models.FileCatalogItemPermission = await require('./fileCatalogItemPermission')(sequelize, models);
    
    models.Value = await require('./value')(sequelize, models);

    return models;
};
