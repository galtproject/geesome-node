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

  const UserLimit = sequelize.define('userLimit', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    name: {
      type: DataTypes.STRING(200)
    },
    value: {
      type: DataTypes.DOUBLE
    },
    periodTimestamp: {
      type: DataTypes.INTEGER
    },
    isActive: {
      type: DataTypes.BOOLEAN
    },
    deactivateOn: {
      type: DataTypes.DATE
    }
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      // { fields: ['tokensAddress', 'chainAccountAddress'] }
    ]
  } as any);

  UserLimit.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(UserLimit, {as: 'limits', foreignKey: 'userId'});

  UserLimit.belongsTo(models.User, {as: 'admin', foreignKey: 'adminId'});
  models.User.hasMany(UserLimit, {as: 'limitsSet', foreignKey: 'adminId'});

  return UserLimit.sync({});
};
