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

  const UserOperationQueue = sequelize.define('userOperationQueue', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    module: {
      type: Sequelize.STRING(200)
    },
    inputHash: {
      type: Sequelize.STRING(200)
    },
    startedAt: {
      type: Sequelize.DATE
    },
    inputJson: {
      type: Sequelize.TEXT
    },
    isWaiting: {
      type: Sequelize.BOOLEAN
    },
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      { fields: ['module', 'isWaiting'] },
      { fields: ['module', 'inputHash', 'isWaiting'] }
    ]
  } as any);

  UserOperationQueue.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(UserOperationQueue, {as: 'operationsQueue', foreignKey: 'userId'});

  UserOperationQueue.belongsTo(models.UserApiKey, {as: 'userApiKey', foreignKey: 'userApiKeyId'});
  models.UserApiKey.hasMany(UserOperationQueue, {as: 'operationsQueue', foreignKey: 'userApiKeyId'});

  UserOperationQueue.belongsTo(models.UserAsyncOperation, {as: 'asyncOperation', foreignKey: 'asyncOperationId'});
  models.UserAsyncOperation.hasMany(UserOperationQueue, {as: 'operationsQueue', foreignKey: 'asyncOperationId'});

  return UserOperationQueue.sync({});
};
