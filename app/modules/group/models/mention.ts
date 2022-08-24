/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = async function (sequelize, models) {
  const Sequelize = require('sequelize');

  const Mention = sequelize.define('mention', {
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
    credentials: {
      type: Sequelize.STRING
    },
    avatarImageId: {
      type: Sequelize.INTEGER
    },
    coverImageId: {
      type: Sequelize.INTEGER
    },
    isGlobal: {
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

  Mention.belongsTo(models.Post, {as: 'sourcePost', foreignKey: 'sourcePostId'});
  models.Post.hasMany(Mention, {as: 'postMentions', foreignKey: 'sourcePostId'});

  Mention.belongsTo(models.Post, {as: 'targetPost', foreignKey: 'targetPostId'});
  models.Post.hasMany(Mention, {as: 'mentionedInPosts', foreignKey: 'targetPostId'});

  Mention.belongsTo(models.Group, {as: 'sourceGroup', foreignKey: 'sourceGroupId'});
  models.Group.hasMany(Mention, {as: 'groupMentions', foreignKey: 'sourceGroupId'});

  Mention.belongsTo(models.Group, {as: 'targetGroup', foreignKey: 'targetGroupId'});
  models.Group.hasMany(Mention, {as: 'mentionedInGroups', foreignKey: 'targetGroupId'});

  Mention.belongsTo(models.User, {as: 'creator', foreignKey: 'creatorId'});
  models.User.hasMany(Mention, {as: 'createdMentions', foreignKey: 'creatorId'});

  return Mention.sync({});
};
