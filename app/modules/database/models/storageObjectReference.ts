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

  const StorageObjectReference = sequelize.define('storageObjectReference', {
    sourceStorageId: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    targetStorageId: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    referenceType: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    source: {
      type: DataTypes.STRING(200)
    },
    name: {
      type: DataTypes.STRING(500)
    },
    targetType: {
      type: DataTypes.STRING(100)
    },
    targetSize: {
      type: DataTypes.BIGINT
    }
  } as any, {
    indexes: [
      { name: 'storage_object_refs_source_target_type_unique', fields: ['sourceStorageId', 'targetStorageId', 'referenceType'], unique: true },
      { name: 'storage_object_refs_target_type_idx', fields: ['targetStorageId', 'referenceType'] },
      { name: 'storage_object_refs_source_idx', fields: ['sourceStorageId'] },
      { name: 'storage_object_refs_updated_idx', fields: ['updatedAt', 'id'] }
    ]
  } as any);

  return StorageObjectReference.sync({});
};
