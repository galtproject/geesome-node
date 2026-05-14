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
  const Group = sequelize.define('group', {
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
    avatarImageId: {
      type: DataTypes.INTEGER
    },
    coverImageId: {
      type: DataTypes.INTEGER
    },
    type: {
      type: DataTypes.STRING(200)
    },
    view: {
      type: DataTypes.STRING(200)
    },
    theme: {
      type: DataTypes.STRING(200)
    },
    homePage: {
      type: DataTypes.STRING(200)
    },
    size: {
      type: DataTypes.BIGINT
    },
    isPublic: {
      type: DataTypes.BOOLEAN
    },
    isOpen: {
      type: DataTypes.BOOLEAN
    },
    isCollateral: {
      type: DataTypes.BOOLEAN
    },
    isRemote: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
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
    isShowAuthors: {
      type: DataTypes.BOOLEAN
    },
    isReplyForbidden: {
      type: DataTypes.BOOLEAN
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
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
    directoryStorageId: {
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
    propertiesJson: {
      type: DataTypes.TEXT
    },
    storageUpdatedAt: {
      type: DataTypes.DATE
    },
    staticStorageUpdatedAt: {
      type: DataTypes.DATE
    },
    publishedPostsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    availablePostsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    manifestPostsCursorUpdatedAt: {
      type: DataTypes.DATE
    },
    manifestPostsCursorId: {
      type: DataTypes.INTEGER
    },
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      { fields: ['name', 'isRemote'], unique: true, where: {isRemote: false, isCollateral: false} },
      { fields: ['manifestStorageId'] },
      { fields: ['manifestStaticStorageId'] },
      { name: 'groups_creator_type_deleted_created_idx', fields: ['creatorId', 'type', 'isDeleted', 'createdAt', 'id'] },
      { name: 'groups_static_rebind_idx', fields: ['isDeleted', 'staticStorageUpdatedAt'] }
    ]
  } as any);

  Group.belongsTo(models.Content, {as: 'avatarImage', foreignKey: 'avatarImageId'});
  Group.belongsTo(models.Content, {as: 'coverImage', foreignKey: 'coverImageId'});

  Group.belongsTo(models.User, {as: 'creator', foreignKey: 'creatorId'});
  models.User.hasMany(Group, {as: 'createdGroups', foreignKey: 'creatorId'});

  models.GroupAdministrators = sequelize.define('groupAdministrators', {} as any, {
    indexes: [
      // Scalability review slice 9 (matched by 20260506000002-add-permission-and-membership-indexes.cjs):
      { name: 'group_admins_user_group_idx', fields: ['userId', 'groupId'] },
      { name: 'group_admins_group_user_idx', fields: ['groupId', 'userId'] }
    ]
  } as any);

  Group.belongsToMany(models.User, {as: 'administrators', through: models.GroupAdministrators});
  models.User.belongsToMany(Group, {as: 'administratorInGroups', through: models.GroupAdministrators});

  models.GroupMembers = sequelize.define('groupMembers', {} as any, {
    indexes: [
      // Scalability review slice 9 (matched by 20260506000002-add-permission-and-membership-indexes.cjs):
      { name: 'group_members_user_group_idx', fields: ['userId', 'groupId'] },
      { name: 'group_members_group_user_idx', fields: ['groupId', 'userId'] }
    ]
  } as any);

  Group.belongsToMany(models.User, {as: 'members', through: models.GroupMembers});
  models.User.belongsToMany(Group, {as: 'memberInGroups', through: models.GroupMembers});

  await Group.sync({});

  await models.GroupAdministrators.sync({});

  await models.GroupMembers.sync({});

  return Group;
};
