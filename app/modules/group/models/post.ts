/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {assertAwaitExpression} from "@babel/types";

module.exports = async function (sequelize, models) {
  const Sequelize = require('sequelize');

  const Post = sequelize.define('post', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    status: {
      type: Sequelize.STRING(200)
    },
    name: {
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
    isDeleted: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    isReplyForbidden: {
      type: Sequelize.BOOLEAN
    },
    peersCount: {
      type: Sequelize.INTEGER
    },
    repliesCount: {
      type: Sequelize.INTEGER
    },
    repostsCount: {
      type: Sequelize.INTEGER
    },
    fullyPeersCount: {
      type: Sequelize.INTEGER
    },
    propertiesJson: {
      type: Sequelize.TEXT
    },
    storageId: {
      type: Sequelize.STRING(200)
    },
    directoryStorageId: {
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
    groupStorageId: {
      type: Sequelize.STRING(200)
    },
    groupStaticStorageId: {
      type: Sequelize.STRING(200)
    },
    authorStorageId: {
      type: Sequelize.STRING(200)
    },
    authorStaticStorageId: {
      type: Sequelize.STRING(200)
    },
    source: {
      type: Sequelize.STRING(200)
    },
    sourceChannelId: {
      type: Sequelize.STRING(200)
    },
    sourcePostId: {
      type: Sequelize.STRING(200)
    },
    sourceDate: {
      type: Sequelize.DATE
    },
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      { fields: ['name'] },
      { fields: ['name', 'isRemote'], unique: true, where: {isRemote: false} },
      { fields: ['replyToId'] },
      { fields: ['repostOfId'] },
      { fields: ['source', 'sourceDate'] },
      { fields: ['source', 'sourceChannelId'] },
      { fields: ['source', 'sourceChannelId', 'sourcePostId'] }
    ]
  } as any);

  models.PostsContents = sequelize.define('postsContents', {
    position: {type: Sequelize.INTEGER},
    view: {type: Sequelize.STRING(200)},
  } as any, {} as any);

  models.Content.belongsToMany(Post, {as: 'posts', through: models.PostsContents});
  Post.belongsToMany(models.Content, {as: 'contents', through: models.PostsContents});

  Post.belongsTo(models.Group, {as: 'group', foreignKey: 'groupId'});
  models.Group.hasMany(Post, {as: 'posts', foreignKey: 'groupId'});

  Post.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(Post, {as: 'posts', foreignKey: 'userId'});

  Post.belongsTo(Post, {as: 'repostOf', foreignKey: 'repostOfId'});
  Post.hasMany(Post, {as: 'reposts', foreignKey: 'repostOfId'});

  Post.belongsTo(Post, {as: 'replyTo', foreignKey: 'replyToId'});
  Post.hasMany(Post, {as: 'replies', foreignKey: 'replyToId'});

  await Post.sync({});

  await models.PostsContents.sync({});

  return Post;
};
