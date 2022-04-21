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

  const Invite = sequelize.define('invite', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    title: {
      type: Sequelize.STRING(200)
    },
    code: {
      type: Sequelize.STRING(200),
      unique: true
    },
    limits: {
      type: Sequelize.TEXT
    },
    permissions: {
      type: Sequelize.TEXT
    },
    groupsToJoin: {
      type: Sequelize.TEXT
    },
    maxCount: {
      type: Sequelize.INTEGER
    },
    captcha: {
      type: Sequelize.STRING(200)
    },
    isActive: {
      type: Sequelize.BOOLEAN
    }
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      { fields: ['code'] }
    ]
  } as any);

  Invite.belongsTo(models.User, {as: 'createdBy', foreignKey: 'createdById'});
  models.User.hasMany(Invite, {as: 'createdInvites', foreignKey: 'createdById'});

  models.User.belongsTo(Invite, {as: 'joinedByInvite', foreignKey: 'joinedByInviteId'});
  Invite.hasMany(models.User, {as: 'joinedUsers', foreignKey: 'joinedByInviteId'});

  return Invite.sync({});
};
