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

  const StorageSpaceSnapshot = sequelize.define('storageSpaceSnapshot', {
    data: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    listLimit: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  } as any, {
    indexes: [
      { name: 'storage_space_snapshots_created_idx', fields: ['createdAt', 'id'] },
      { name: 'storage_space_snapshots_user_created_idx', fields: ['userId', 'createdAt', 'id'] }
    ]
  } as any);

  StorageSpaceSnapshot.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(StorageSpaceSnapshot, {as: 'storageSpaceSnapshots', foreignKey: 'userId'});

  return StorageSpaceSnapshot.sync({});
};
