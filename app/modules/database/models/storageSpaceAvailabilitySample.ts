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

  const StorageSpaceAvailabilitySample = sequelize.define('storageSpaceAvailabilitySample', {
    storageId: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    sampleJson: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    providerLookupOk: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    providersCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    providersTruncated: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    providerLookupDurationMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    providerLookupErrorMessage: {
      type: DataTypes.TEXT
    },
    retrievalStatOk: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    retrievalStatDurationMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    retrievalType: {
      type: DataTypes.STRING(100)
    },
    retrievalMeasuredBytes: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
    },
    retrievalErrorMessage: {
      type: DataTypes.TEXT
    },
    sampledAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  } as any, {
    indexes: [
      { name: 'storage_space_availability_samples_storage_sampled_idx', fields: ['storageId', 'sampledAt', 'id'] },
      { name: 'storage_space_availability_samples_sampled_idx', fields: ['sampledAt', 'id'] },
      { name: 'storage_space_availability_samples_user_sampled_idx', fields: ['userId', 'sampledAt', 'id'] }
    ]
  } as any);

  StorageSpaceAvailabilitySample.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(StorageSpaceAvailabilitySample, {as: 'storageSpaceAvailabilitySamples', foreignKey: 'userId'});

  return StorageSpaceAvailabilitySample.sync({});
};
