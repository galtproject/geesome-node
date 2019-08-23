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
    storageType: {
      type: Sequelize.STRING(200)
    },
    mimeType: {
      type: Sequelize.STRING(200)
    },
    extension: {
      type: Sequelize.STRING(200)
    },
    view: {
      type: Sequelize.STRING(200)
    },
    server: {
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
    isPinned: {
      type: Sequelize.BOOLEAN
    },
    isRemote: {
      type: Sequelize.BOOLEAN
    },
    isEncrypted: {
      type: Sequelize.BOOLEAN
    },
    peersCount: {
      type: Sequelize.INTEGER
    },
    storageId: {
      type: Sequelize.STRING(200)
    },
    largePreviewStorageId: {
      type: Sequelize.STRING(200)
    },
    largePreviewSize: {
      type: Sequelize.INTEGER
    },
    mediumPreviewStorageId: {
      type: Sequelize.STRING(200)
    },
    mediumPreviewSize: {
      type: Sequelize.INTEGER
    },
    smallPreviewStorageId: {
      type: Sequelize.STRING(200)
    },
    smallPreviewSize: {
      type: Sequelize.INTEGER
    },
    previewMimeType: {
      type: Sequelize.STRING(200)
    },
    previewExtension: {
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
      type: Sequelize.STRING(200),
      unique: true
    },
    encryptedManifestStorageId: {
      type: Sequelize.TEXT
    },
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      // { fields: ['tokensAddress', 'chainAccountAddress'] }
    ]
  } as any);

  // who uploaded
  Content.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(Content, {as: 'contents', foreignKey: 'userId'});

  // to what group uploaded
  Content.belongsTo(models.Group, {as: 'group', foreignKey: 'groupId'});
  models.Group.hasMany(Content, {as: 'contents', foreignKey: 'groupId'});

  models.Group.belongsTo(Content, {as: 'avatarImage', foreignKey: 'avatarImageId'});
  models.Group.belongsTo(Content, {as: 'coverImage', foreignKey: 'coverImageId'});

  models.User.belongsTo(Content, {as: 'avatarImage', foreignKey: 'avatarImageId'});

  models.PostsContents = sequelize.define('postsContents', {
    position: {type: Sequelize.INTEGER},
  } as any, {} as any);

  Content.belongsToMany(models.Post, {as: 'posts', through: models.PostsContents});
  models.Post.belongsToMany(Content, {as: 'contents', through: models.PostsContents});

  await Content.sync({});

  await models.PostsContents.sync({});

  return Content;
};
