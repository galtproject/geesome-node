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

  const GroupSection = sequelize.define('groupSection', {
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
    isPublic: {
      type: DataTypes.BOOLEAN
    },
    isOpen: {
      type: DataTypes.BOOLEAN
    },
    type: {
      type: DataTypes.STRING(200)
    },
    size: {
      type: DataTypes.INTEGER
    },
    isRemote: {
      type: DataTypes.BOOLEAN
    },
    isPinned: {
      type: DataTypes.BOOLEAN
    },
    isEncrypted: {
      type: DataTypes.BOOLEAN
    },
    isFullyPinned: {
      type: DataTypes.BOOLEAN
    },
    peersCount: {
      type: DataTypes.INTEGER
    },
    fullyPeersCount: {
      type: DataTypes.INTEGER
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
      type: DataTypes.STRING(200),
      unique: true
    },
    encryptedManifestStorageId: {
      type: DataTypes.TEXT
    },
    storageUpdatedAt: {
      type: DataTypes.DATE
    },
    staticStorageUpdatedAt: {
      type: DataTypes.DATE
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
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    groupId: {
      type: DataTypes.INTEGER,
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
