/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes} from "sequelize";

export default async function (sequelize, models) {

  const UserContentAction = sequelize.define('userContentAction', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    name: {
      type: DataTypes.STRING(200)
    },
    size: {
      type: DataTypes.BIGINT
    },
  } as any, {
    indexes: [
      // Scalability review slice 9 (matched by 20260506000001-add-content-and-quota-indexes.cjs):
      { name: 'user_content_actions_user_name_created_idx', fields: ['userId', 'name', 'createdAt'] },
      { name: 'user_content_actions_content_idx', fields: ['contentId'] }
    ]
  } as any);

  UserContentAction.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(UserContentAction, {as: 'contentActions', foreignKey: 'userId'});

  UserContentAction.belongsTo(models.UserApiKey, {as: 'userApiKey', foreignKey: 'userApiKeyId'});
  models.UserApiKey.hasMany(UserContentAction, {as: 'contentActions', foreignKey: 'userApiKeyId'});

  UserContentAction.belongsTo(models.Content, {as: 'content', foreignKey: 'contentId'});
  models.Content.hasMany(UserContentAction, {as: 'usersContentActions', foreignKey: 'contentId'});

  return UserContentAction.sync({});
};
