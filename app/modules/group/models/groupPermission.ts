/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes} from 'sequelize';

export default async function (sequelize: Sequelize, models) {

  const GroupPermission = sequelize.define('groupPermission', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    name: {
      type: DataTypes.STRING(200)
    },
    title: {
      type: DataTypes.STRING
    },
    isActive: {
      type: DataTypes.BOOLEAN
    },
  } as any, {
    indexes: [
      // Scalability review slice 9 (matched by 20260506000002-add-permission-and-membership-indexes.cjs):
      { name: 'group_permissions_user_group_name_idx', fields: ['userId', 'groupId', 'name'] },
      { name: 'group_permissions_group_user_idx', fields: ['groupId', 'userId'] }
    ]
  } as any);

  GroupPermission.belongsTo(models.Group, {as: 'group', foreignKey: 'groupId'});
  models.Group.hasMany(GroupPermission, {as: 'permissions', foreignKey: 'groupId'});

  GroupPermission.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(GroupPermission, {as: 'groupPermissions', foreignKey: 'userId'});

  return GroupPermission.sync({});
};
