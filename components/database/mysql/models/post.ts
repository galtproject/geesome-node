/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
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
    localId: {
      type: Sequelize.INTEGER
    },
    size: {
      type: Sequelize.INTEGER
    },
    isRemote: {
      type: Sequelize.BOOLEAN
    },
    isEncrypted: {
      type: Sequelize.BOOLEAN
    },
    isPinned: {
      type: Sequelize.BOOLEAN
    },
    isFullyPinned: {
      type: Sequelize.BOOLEAN
    },
    peersCount: {
      type: Sequelize.INTEGER
    },
    fullyPeersCount: {
      type: Sequelize.INTEGER
    },
    storageId: {
      type: Sequelize.STRING(200)
    },
    staticStorageId: {
      type: Sequelize.STRING(200)
    },
    manifestStorageId: {
      type: Sequelize.STRING(200)
    },
    manifestStaticStorageId: {
      type: Sequelize.STRING(200)
    },
    encryptedManifestStorageId: {
      type: Sequelize.TEXT
    },
    authorStaticStorageId: {
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

  Post.belongsTo(models.Group, {as: 'group', foreignKey: 'groupId'});
  models.Group.hasMany(Post, {as: 'posts', foreignKey: 'groupId'});

  Post.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(Post, {as: 'posts', foreignKey: 'userId'});

  Post.belongsTo(Post, {as: 'repostOf', foreignKey: 'repostOfId'});
  Post.hasMany(Post, {as: 'reposts', foreignKey: 'repostOfId'});

  Post.belongsTo(Post, {as: 'replyOf', foreignKey: 'replyOfId'});
  Post.hasMany(Post, {as: 'replies', foreignKey: 'replyOfId'});

  return Post.sync({});
};
