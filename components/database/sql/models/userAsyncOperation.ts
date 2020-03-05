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

  const UserAsyncOperation = sequelize.define('userAsyncOperation', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    name: {
      type: Sequelize.STRING(200)
    },
    channel: {
      type: Sequelize.STRING(200)
    },
    size: {
      type: Sequelize.INTEGER
    },
    percent: {
      type: Sequelize.DOUBLE
    },
    finishedAt: {
      type: Sequelize.DATE
    },
    errorType: {
      type: Sequelize.STRING(200)
    },
    errorMessage: {
      type: Sequelize.TEXT
    },
    inProcess: {
      type: Sequelize.BOOLEAN
    },
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      // { fields: ['tokensAddress', 'chainAccountAddress'] }
    ]
  } as any);

  UserAsyncOperation.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(UserAsyncOperation, {as: 'asyncOperations', foreignKey: 'userId'});

  UserAsyncOperation.belongsTo(models.UserApiKey, {as: 'userApiKey', foreignKey: 'userApiKeyId'});
  models.UserApiKey.hasMany(UserAsyncOperation, {as: 'asyncOperations', foreignKey: 'userApiKeyId'});

  UserAsyncOperation.belongsTo(models.Content, {as: 'content', foreignKey: 'contentId'});
  models.Content.hasMany(UserAsyncOperation, {as: 'usersAsyncOperations', foreignKey: 'contentId'});

  return UserAsyncOperation.sync({});
};
