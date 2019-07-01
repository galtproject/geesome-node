/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
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
      { fields: ['staticId', 'dynamicId'], unique: true }
    ]
  } as any);

  return StaticIdHistory.sync({});
};
