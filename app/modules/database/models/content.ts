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
      type: DataTypes.INTEGER
    },
    mediumPreviewStorageId: {
      type: DataTypes.STRING(200)
    },
    mediumPreviewSize: {
      type: DataTypes.INTEGER
    },
    smallPreviewStorageId: {
      type: DataTypes.STRING(200)
    },
    smallPreviewSize: {
      type: DataTypes.INTEGER
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
      { fields: ['storageId', 'userId'] }
    ]
  } as any);

  // who uploaded
  Content.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(Content, {as: 'contents', foreignKey: 'userId'});

  models.User.belongsTo(Content, {as: 'avatarImage', foreignKey: 'avatarImageId'});

  return Content.sync({});
};
