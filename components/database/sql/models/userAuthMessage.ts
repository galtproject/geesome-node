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

  const UserAuthMessage = sequelize.define('userAuthMessage', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    provider: {
      type: Sequelize.STRING(200)
    },
    address: {
      type: Sequelize.STRING(200)
    },
    message: {
      type: Sequelize.STRING(200)
    }
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      { fields: ['userAccountId'] },
      { fields: ['address', 'provider'] }
    ]
  } as any);

  UserAuthMessage.belongsTo(models.UserAccount, {as: 'userAccount', foreignKey: 'userAccountId'});
  models.UserAccount.hasMany(UserAuthMessage, {as: 'authMessages', foreignKey: 'userAccountId'});

  return UserAuthMessage.sync({});
};
