/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes} from 'sequelize';

export default async function (sequelize: Sequelize, models) {

  const Mention = sequelize.define('mention', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    name: {
      type: DataTypes.STRING(200)
    },
    title: {
      type: DataTypes.STRING
    },
    description: {
      type: DataTypes.STRING
    },
    credentials: {
      type: DataTypes.STRING
    },
    avatarImageId: {
      type: DataTypes.INTEGER
    },
    coverImageId: {
      type: DataTypes.INTEGER
    },
    isGlobal: {
      type: DataTypes.BOOLEAN
    },
    storageId: {
      type: DataTypes.STRING(200)
    },
    staticStorageId: {
      type: DataTypes.STRING(200)
    },
    storageAccountId: {
      type: DataTypes.STRING(200)
    },
    manifestStorageId: {
      type: DataTypes.STRING(200)
    },
    manifestStaticStorageId: {
      type: DataTypes.STRING(200)
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
