/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = async function (sequelize, models) {
  const Sequelize = require('sequelize');

  const StaticIdHistory = sequelize.define('staticIdHistory', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    staticId: {
      type: Sequelize.STRING(200)
    },
    dynamicId: {
      type: Sequelize.STRING(200)
    },
    periodTimestamp: {
      type: Sequelize.INTEGER
    },
    isActive: {
      type: Sequelize.BOOLEAN
    },
    boundAt: {
      type: Sequelize.DATE
    }
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      {fields: ['staticId', 'dynamicId'], unique: true},
      {fields: ['staticId', 'boundAt']},
      {fields: ['staticId']}
    ]
  } as any);

  return StaticIdHistory.sync({});
};
