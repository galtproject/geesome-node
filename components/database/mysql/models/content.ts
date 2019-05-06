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
    
    const Content = sequelize.define('content', {
        // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
        name: {
            type: Sequelize.STRING(200)
        },
        type: {
            type: Sequelize.STRING(200)
        },
        description: {
            type: Sequelize.STRING
        },
        size: {
            type: Sequelize.INTEGER
        },
        isPublic: {
            type: Sequelize.BOOLEAN
        },
        storageId: {
            type: Sequelize.STRING(200)
        },
        staticStorageId: {
            type: Sequelize.STRING(200)
        },
        storageAccountId: {
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


    // Content.belongsTo(models.Folder, { as: 'folder', foreignKey: 'folderId' });
    // models.Folder.hasMany(Content, { as: 'contents', foreignKey: 'folderId' });

    Content.belongsTo(models.User, { as: 'user', foreignKey: 'userId' });
    models.User.hasMany(Content, { as: 'contents', foreignKey: 'userId' });

    Content.belongsTo(models.Group, { as: 'group', foreignKey: 'groupId' });
    models.Group.hasMany(Content, { as: 'contents', foreignKey: 'groupId' });

    models.Group.belongsTo(Content, { as: 'avatarImage', foreignKey: 'avatarImageId'});
    models.Group.belongsTo(Content, { as: 'coverImage', foreignKey: 'coverImageId'});

    models.User.belongsTo(Content, { as: 'avatarImage', foreignKey: 'avatarImageId'});

    models.PostsContents = sequelize.define('postsContents', {
        position: { type: Sequelize.INTEGER },
    } as any, { } as any);

    Content.belongsToMany(models.Post, { as: 'posts', through: models.PostsContents });
    models.Post.belongsToMany(Content, { as: 'contents', through: models.PostsContents });

    await Content.sync({});
    
    await models.PostsContents.sync({});
    
    return Content;
};
