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

  const Object = sequelize.define('object', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    storageId: {
      type: DataTypes.STRING(200)
    },
    data: {
      type: DataTypes.TEXT
    },
    resolveProp: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    }
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      { fields: ['storageId'], unique: true },
      { fields: ['storageId', 'resolveProp'], unique: true },
    ]
  } as any);

  return Object.sync({});
};
