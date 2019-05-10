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
    
    const Post = sequelize.define('post', {
        // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
        status: {
            type: Sequelize.STRING(200)
        },
        publishedAt: {
            type: Sequelize.DATE
        },
        publishOn: {
            type: Sequelize.DATE
        },
        type: {
            type: Sequelize.STRING(200)
        },
        view: {
            type: Sequelize.STRING(200)
        },
        storageId: {
            type: Sequelize.STRING(200)
        },
        staticStorageId: {
            type: Sequelize.STRING(200)
        },
        storageAccountId: {
            type: Sequelize.STRING(200)
        },
        manifestStorageId: {
            type: Sequelize.STRING(200)
        },
        manifestStaticStorageId: {
            type: Sequelize.STRING(200)
        }
    } as any, {
        indexes: [
            // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
            // { fields: ['chainAccountAddress'] },
            // { fields: ['tokensAddress'] },
            // { fields: ['tokensAddress', 'chainAccountAddress'] }
        ]
    } as any);

    Post.belongsTo(models.Group, { as: 'group', foreignKey: 'groupId' });
    models.Group.hasMany(Post, { as: 'posts', foreignKey: 'groupId' });

    Post.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
    models.User.hasMany(Post, { as: 'posts', foreignKey: 'userId' });

    Post.belongsTo(Post, { as: 'sourcePost', foreignKey: 'sourcePostId' });
    Post.hasMany(Post, { as: 'rePosts', foreignKey: 'sourcePostId' });

    return Post.sync({});
};
