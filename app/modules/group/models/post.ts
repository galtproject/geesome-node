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

  const Post = sequelize.define('post', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    status: {
      type: DataTypes.STRING(200)
    },
    name: {
      type: DataTypes.STRING(200)
    },
    publishedAt: {
      type: DataTypes.DATE
    },
    publishOn: {
      type: DataTypes.DATE
    },
    type: {
      type: DataTypes.STRING(200)
    },
    view: {
      type: DataTypes.STRING(200)
    },
    localId: {
      type: DataTypes.INTEGER
    },
    size: {
      type: DataTypes.INTEGER
    },
    isRemote: {
      type: DataTypes.BOOLEAN
    },
    isEncrypted: {
      type: DataTypes.BOOLEAN
    },
    isPinned: {
      type: DataTypes.BOOLEAN
    },
    isFullyPinned: {
      type: DataTypes.BOOLEAN
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isReplyForbidden: {
      type: DataTypes.BOOLEAN
    },
    peersCount: {
      type: DataTypes.INTEGER
    },
    repliesCount: {
      type: DataTypes.INTEGER
    },
    repostsCount: {
      type: DataTypes.INTEGER
    },
    fullyPeersCount: {
      type: DataTypes.INTEGER
    },
    propertiesJson: {
      type: DataTypes.TEXT
    },
    storageId: {
      type: DataTypes.STRING(200)
    },
    directoryStorageId: {
      type: DataTypes.STRING(200)
    },
    staticStorageId: {
      type: DataTypes.STRING(200)
    },
    manifestStorageId: {
      type: DataTypes.STRING(200)
    },
    manifestStaticStorageId: {
      type: DataTypes.STRING(200)
    },
    encryptedManifestStorageId: {
      type: DataTypes.TEXT
    },
    groupStorageId: {
      type: DataTypes.STRING(200)
    },
    groupStaticStorageId: {
      type: DataTypes.STRING(200)
    },
    authorStorageId: {
      type: DataTypes.STRING(200)
    },
    authorStaticStorageId: {
      type: DataTypes.STRING(200)
    },
    source: {
      type: DataTypes.STRING(200)
    },
    sourceChannelId: {
      type: DataTypes.STRING(200)
    },
    sourcePostId: {
      type: DataTypes.STRING(200)
    },
    sourceDate: {
      type: DataTypes.DATE
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
    position: {type: DataTypes.INTEGER},
    view: {type: DataTypes.STRING(200)},
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
