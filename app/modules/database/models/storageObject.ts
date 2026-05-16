/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {DataTypes} from "sequelize";

export default async function (sequelize, models) {

  const StorageObject = sequelize.define('storageObject', {
    storageId: {
      type: DataTypes.STRING(200),
      allowNull: false
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
    size: {
      type: DataTypes.BIGINT
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
    isPinned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  } as any, {
    indexes: [
      { name: 'storage_objects_storage_id_unique', fields: ['storageId'], unique: true },
      { name: 'storage_objects_large_preview_storage_idx', fields: ['largePreviewStorageId'] },
      { name: 'storage_objects_medium_preview_storage_idx', fields: ['mediumPreviewStorageId'] },
      { name: 'storage_objects_small_preview_storage_idx', fields: ['smallPreviewStorageId'] },
      { name: 'storage_objects_updated_idx', fields: ['updatedAt', 'id'] }
    ]
  } as any);

  return StorageObject.sync({});
};
