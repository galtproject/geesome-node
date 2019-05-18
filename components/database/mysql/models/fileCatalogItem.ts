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

module.exports = async function (sequelize, models) {
    const Sequelize = require('sequelize');
    
    const FileCatalogItem = sequelize.define('fileCatalogItem', {
        // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
        name: {
            type: Sequelize.STRING(200)
        },
        type: {
            type: Sequelize.STRING(200)
        },
        defaultFolderFor: {
            type: Sequelize.STRING(200)
        },
        position: {
            type: Sequelize.INTEGER
        }
    } as any, {
        indexes: [
            // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
            // { fields: ['chainAccountAddress'] },
            // { fields: ['tokensAddress'] },
            // { fields: ['tokensAddress', 'chainAccountAddress'] }
        ]
    } as any);

    FileCatalogItem.belongsTo(FileCatalogItem, { as: 'linkOf', foreignKey: 'linkOfId' });
    FileCatalogItem.hasMany(FileCatalogItem, { as: 'linkedItems', foreignKey: 'linkOfId' });
    
    FileCatalogItem.belongsTo(FileCatalogItem, { as: 'parentItem', foreignKey: 'parentItemId' });
    FileCatalogItem.hasMany(FileCatalogItem, { as: 'childrenItems', foreignKey: 'parentItemId' });

    FileCatalogItem.belongsTo(models.Content, { as: 'content', foreignKey: 'contentId' });
    models.Content.hasMany(FileCatalogItem, { as: 'fileCatalogItems', foreignKey: 'contentId' });
    
    FileCatalogItem.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
    models.User.hasMany(FileCatalogItem, { as: 'fileCatalogItems', foreignKey: 'userId' });

    return FileCatalogItem.sync({});
};
