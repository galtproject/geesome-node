/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes} from "sequelize";

export default async function (sequelize, models) {

  const Content = sequelize.define('content', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    name: {
      type: DataTypes.STRING(200)
    },
    storageType: {
      type: DataTypes.STRING(200)
    },
    mimeType: {
      type: DataTypes.STRING(200)
    },
    extension: {
      type: DataTypes.STRING(200)
    },
    view: {
      type: DataTypes.STRING(200)
    },
    server: {
      type: DataTypes.STRING(200)
    },
    description: {
      type: DataTypes.STRING
    },
    size: {
      type: DataTypes.BIGINT
    },
    isPublic: {
      type: DataTypes.BOOLEAN
    },
    isPinned: {
      type: DataTypes.BOOLEAN
    },
    isRemote: {
      type: DataTypes.BOOLEAN
    },
    isEncrypted: {
      type: DataTypes.BOOLEAN
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    deletedAt: {
      type: DataTypes.DATE
    },
    peersCount: {
      type: DataTypes.INTEGER
    },
    storageId: {
      type: DataTypes.STRING(200)
    },
    largePreviewStorageId: {
      type: DataTypes.STRING(200)
    },
    largePreviewSize: {
      type: DataTypes.BIGINT
    },
    mediumPreviewStorageId: {
      type: DataTypes.STRING(200)
    },
    mediumPreviewSize: {
      type: DataTypes.BIGINT
    },
    smallPreviewStorageId: {
      type: DataTypes.STRING(200)
    },
    smallPreviewSize: {
      type: DataTypes.BIGINT
    },
    previewMimeType: {
      type: DataTypes.STRING(200)
    },
    previewExtension: {
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
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      { fields: ['storageId', 'userId'] },
      // Scalability review slice 9 (matched by 20260506000001-add-content-and-quota-indexes.cjs):
      { name: 'contents_user_created_idx', fields: ['userId', 'createdAt', 'id'] },
      { name: 'contents_manifest_storage_idx', fields: ['manifestStorageId'] },
      { name: 'contents_user_manifest_storage_idx', fields: ['userId', 'manifestStorageId'] },
      { name: 'contents_large_preview_storage_idx', fields: ['largePreviewStorageId'] },
      { name: 'contents_medium_preview_storage_idx', fields: ['mediumPreviewStorageId'] },
      { name: 'contents_small_preview_storage_idx', fields: ['smallPreviewStorageId'] }
    ]
  } as any);

  // who uploaded
  Content.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(Content, {as: 'contents', foreignKey: 'userId'});

  models.User.belongsTo(Content, {as: 'avatarImage', foreignKey: 'avatarImageId'});

  return Content.sync({});
};
