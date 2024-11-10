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

  const UserApiKey = sequelize.define('userApiKey', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    title: {
      type: DataTypes.STRING
    },
    valueHash: {
      type: DataTypes.STRING(200)
    },
    type: {
      type: DataTypes.STRING(200)
    },
    permissions: {
      type: DataTypes.STRING
    },
    expiredOn: {
      type: DataTypes.DATE
    },
    isDisabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      { fields: ['userId'] },
      { fields: ['userId', 'isDisabled'] },
      { fields: ['userId', 'title', 'isDisabled'] },
      { fields: ['valueHash', 'isDisabled'] },
      // { fields: ['tokensAddress'] },
      // { fields: ['tokensAddress', 'chainAccountAddress'] }
    ]
  } as any);

  UserApiKey.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(UserApiKey, {as: 'apiKeys', foreignKey: 'userId'});

  return UserApiKey.sync({});
};
