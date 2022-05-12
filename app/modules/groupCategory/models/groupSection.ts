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

  const GroupSection = sequelize.define('groupSection', {
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
    isPublic: {
      type: Sequelize.BOOLEAN
    },
    isOpen: {
      type: Sequelize.BOOLEAN
    },
    type: {
      type: Sequelize.STRING(200)
    },
    size: {
      type: Sequelize.INTEGER
    },
    isRemote: {
      type: Sequelize.BOOLEAN
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
    storageUpdatedAt: {
      type: Sequelize.DATE
    },
    staticStorageUpdatedAt: {
      type: Sequelize.DATE
    },
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      { fields: ['name', 'categoryId'], unique: true },
      { fields: ['parentSectionId'] }
    ]
  } as any);

  // Group.belongsTo(models.GroupSection, {as: 'section', foreignKey: 'sectionId'});
  // models.GroupSection.hasMany(Group, {as: 'groups', foreignKey: 'sectionId'});

  models.GroupSectionsPivot = sequelize.define('groupSectionsPivot',{
    sectionId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    groupId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true,
      unique: true // group can be in one section
    },
  } as any);

  models.Group.belongsToMany(GroupSection, {as: 'sections', through: models.GroupSectionsPivot, foreignKey: 'groupId'});
  GroupSection.belongsToMany(models.Group, {as: 'groups', through: models.GroupSectionsPivot, foreignKey: 'sectionId'});

  GroupSection.belongsTo(models.User, {as: 'creator', foreignKey: 'creatorId'});
  models.User.hasMany(GroupSection, {as: 'createdSections', foreignKey: 'creatorId'});

  GroupSection.belongsTo(models.GroupCategory, {as: 'category', foreignKey: 'categoryId'});
  models.GroupCategory.hasMany(GroupSection, {as: 'sections', foreignKey: 'categoryId'});

  GroupSection.belongsTo(GroupSection, {as: 'parentSection', foreignKey: 'parentSectionId'});
  GroupSection.hasMany(GroupSection, {as: 'childrenSections', foreignKey: 'parentSectionId'});

  await GroupSection.sync({});

  await models.GroupSectionsPivot.sync({});

  return GroupSection;
};
