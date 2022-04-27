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

  const GroupRead = sequelize.define('groupRead', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    readFrom: {
      type: Sequelize.DATE
    },
    readAt: {
      type: Sequelize.DATE
    },
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      { fields: ['userId', 'groupId'], unique: true }
    ]
  } as any);

  GroupRead.belongsTo(models.Group, {as: 'group', foreignKey: 'groupId'});
  models.Group.hasMany(GroupRead, {as: 'userReads', foreignKey: 'groupId'});

  GroupRead.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(GroupRead, {as: 'groupReads', foreignKey: 'userId'});

  return GroupRead.sync({});
};
