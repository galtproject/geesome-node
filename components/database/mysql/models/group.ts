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
    
    const Group = sequelize.define('group', {
        // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
        name: {
            type: Sequelize.STRING(200)
        },
        title: {
            type: Sequelize.STRING
        },
        description: {
            type: Sequelize.STRING
        },
        avatarImageId: {
            type: Sequelize.INTEGER
        },
        coverImageId: {
            type: Sequelize.INTEGER
        },
        isPublic: {
            type: Sequelize.BOOLEAN
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
    
    const GroupAdministrators = sequelize.define('groupAdministrators', { } as any, { } as any);
    
    Group.belongsToMany(models.User, { as: 'administrators', through: GroupAdministrators });
    models.User.belongsToMany(Group, { as: 'administratorInGroups', through: GroupAdministrators });
    
    const GroupMembers = sequelize.define('groupMembers', { } as any, { } as any);

    Group.belongsToMany(models.User, { as: 'members', through: GroupMembers });
    models.User.belongsToMany(Group, { as: 'memberInGroups', through: GroupMembers });

    await Group.sync({});

    await GroupAdministrators.sync({});
    
    await GroupMembers.sync({});
    
    return Group;
};
