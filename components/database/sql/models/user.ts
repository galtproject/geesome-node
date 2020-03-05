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

  const User = sequelize.define('user', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    name: {
      type: Sequelize.STRING(200)
    },
    email: {
      type: Sequelize.STRING(200)
    },
    keyStoreMethod: {
      type: Sequelize.STRING(200)
    },
    title: {
      type: Sequelize.STRING
    },
    description: {
      type: Sequelize.STRING
    },
    passwordHash: {
      type: Sequelize.STRING(200)
    },
    storageAccountId: {
      type: Sequelize.STRING(200)
    },
    avatarImageId: {
      type: Sequelize.INTEGER
    },
    manifestStorageId: {
      type: Sequelize.STRING(200)
    },
    manifestStaticStorageId: {
      type: Sequelize.STRING(200),
      unique: true
    }
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      // { fields: ['tokensAddress', 'chainAccountAddress'] }
    ]
  } as any);
  
  models.User = User;
  await models.User.sync({});
  
  models.UserFriends = sequelize.define('userFriends', {} as any, {} as any);

  User.belongsToMany(User, {as: 'friends', through: models.UserFriends, unique: false});

  await models.UserFriends.sync({});
  
  return models.User;
};
