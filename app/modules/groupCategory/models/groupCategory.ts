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

  const GroupCategory = sequelize.define('category', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    name: {
      type: Sequelize.STRING(200)
    },
    title: {
      type: Sequelize.STRING
    },
    description: {
      type: Sequelize.STRING
    },
    avatarImageId: {
      type: Sequelize.INTEGER
    },
    coverImageId: {
      type: Sequelize.INTEGER
    },
    isGlobal: {
      type: Sequelize.BOOLEAN
    },
    type: {
      type: Sequelize.STRING(200)
    },
    view: {
      type: Sequelize.STRING(200)
    },
    size: {
      type: Sequelize.INTEGER
    },
    storageId: {
      type: Sequelize.STRING(200)
    },
    staticStorageId: {
      type: Sequelize.STRING(200)
    },
    storageAccountId: {
      type: Sequelize.STRING(200)
    },
    manifestStorageId: {
      type: Sequelize.STRING(200)
    },
    manifestStaticStorageId: {
      type: Sequelize.STRING(200)
    }
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      { fields: ['name'] }
    ]
  } as any);

  models.CategoryAdministratorsPivot = sequelize.define('categoryAdministrators', {} as any, {} as any);

  GroupCategory.belongsToMany(models.User, {as: 'administrators', through: models.CategoryAdministratorsPivot});
  models.User.belongsToMany(GroupCategory, {as: 'administratorInCategories', through: models.CategoryAdministratorsPivot});

  models.CategoryMembersPivot = sequelize.define('categoryMembers', {} as any, {} as any);

  GroupCategory.belongsToMany(models.User, {as: 'members', through: models.CategoryMembersPivot});
  models.User.belongsToMany(GroupCategory, {as: 'memberInCategories', through: models.CategoryMembersPivot});

  models.CategoryGroupsPivot = sequelize.define('categoryGroups', {} as any, {} as any);

  GroupCategory.belongsToMany(models.Group, {as: 'groups', through: models.CategoryGroupsPivot});
  models.Group.belongsToMany(GroupCategory, {as: 'categories', through: models.CategoryGroupsPivot});

  models.CategoryGroupsMembershipPivot = sequelize.define('categoryGroupsMembership', {} as any, {} as any);

  GroupCategory.belongsToMany(models.Group, {as: 'membershipGroups', through: models.CategoryGroupsMembershipPivot});
  models.Group.belongsToMany(GroupCategory, {as: 'membershipCategories', through: models.CategoryGroupsMembershipPivot});

  await GroupCategory.sync({});

  await models.CategoryAdministratorsPivot.sync({});
  await models.CategoryMembersPivot.sync({});
  await models.CategoryGroupsPivot.sync({});
  await models.CategoryGroupsMembershipPivot.sync({});

  return GroupCategory;
};
