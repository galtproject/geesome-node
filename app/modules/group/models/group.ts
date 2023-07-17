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
    type: {
      type: Sequelize.STRING(200)
    },
    view: {
      type: Sequelize.STRING(200)
    },
    theme: {
      type: Sequelize.STRING(200)
    },
    homePage: {
      type: Sequelize.STRING(200)
    },
    size: {
      type: Sequelize.INTEGER
    },
    isPublic: {
      type: Sequelize.BOOLEAN
    },
    isOpen: {
      type: Sequelize.BOOLEAN
    },
    isCollateral: {
      type: Sequelize.BOOLEAN
    },
    isRemote: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    isPinned: {
      type: Sequelize.BOOLEAN
    },
    isEncrypted: {
      type: Sequelize.BOOLEAN
    },
    isFullyPinned: {
      type: Sequelize.BOOLEAN
    },
    isShowAuthors: {
      type: Sequelize.BOOLEAN
    },
    isReplyForbidden: {
      type: Sequelize.BOOLEAN
    },
    isDeleted: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
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
    directoryStorageId: {
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
    propertiesJson: {
      type: Sequelize.TEXT
    },
    storageUpdatedAt: {
      type: Sequelize.DATE
    },
    staticStorageUpdatedAt: {
      type: Sequelize.DATE
    },
    publishedPostsCount: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    availablePostsCount: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      { fields: ['name', 'isRemote'], unique: true, where: {isRemote: false, isCollateral: false} },
      { fields: ['manifestStorageId'] },
      { fields: ['manifestStaticStorageId'] }
    ]
  } as any);

  Group.belongsTo(models.Content, {as: 'avatarImage', foreignKey: 'avatarImageId'});
  Group.belongsTo(models.Content, {as: 'coverImage', foreignKey: 'coverImageId'});

  Group.belongsTo(models.User, {as: 'creator', foreignKey: 'creatorId'});
  models.User.hasMany(Group, {as: 'createdGroups', foreignKey: 'creatorId'});

  models.GroupAdministrators = sequelize.define('groupAdministrators', {} as any, {} as any);

  Group.belongsToMany(models.User, {as: 'administrators', through: models.GroupAdministrators});
  models.User.belongsToMany(Group, {as: 'administratorInGroups', through: models.GroupAdministrators});

  models.GroupMembers = sequelize.define('groupMembers', {} as any, {} as any);

  Group.belongsToMany(models.User, {as: 'members', through: models.GroupMembers});
  models.User.belongsToMany(Group, {as: 'memberInGroups', through: models.GroupMembers});

  await Group.sync({});

  await models.GroupAdministrators.sync({});

  await models.GroupMembers.sync({});

  return Group;
};
