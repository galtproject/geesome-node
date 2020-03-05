/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = async function (sequelize, models) {
  const Sequelize = require('sequelize');

  const UserApiKey = sequelize.define('userApiKey', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    title: {
      type: Sequelize.STRING
    },
    valueHash: {
      type: Sequelize.STRING(200)
    },
    type: {
      type: Sequelize.STRING(200)
    },
    permissions: {
      type: Sequelize.STRING
    },
    expiredOn: {
      type: Sequelize.DATE
    },
    isDisabled: {
      type: Sequelize.BOOLEAN,
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
