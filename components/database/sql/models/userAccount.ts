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

  const UserAccount = sequelize.define('userAccount', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    title: {
      type: Sequelize.STRING
    },
    provider: {
      type: Sequelize.STRING(200)
    },
    type: {
      type: Sequelize.STRING(200)
    },
    address: {
      type: Sequelize.STRING(200)
    },
    description: {
      type: Sequelize.STRING
    },
    signature: {
      type: Sequelize.STRING
    }
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      { fields: ['userId'] },
      { fields: ['userId', 'provider'] },
      { fields: ['provider', 'address'] }
    ]
  } as any);

  UserAccount.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(UserAccount, {as: 'accounts', foreignKey: 'userId'});

  return UserAccount.sync({});
};
