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

  const Category = sequelize.define('category', {
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
      // { fields: ['tokensAddress', 'chainAccountAddress'] }
    ]
  } as any);

  models.CategoryGroups = sequelize.define('categoryGroups', {} as any, {} as any);

  Category.belongsToMany(models.Group, {as: 'groups', through: models.CategoryGroups});
  models.User.belongsToMany(Category, {as: 'categories', through: models.CategoryGroups});

  models.CategoryAdministrators = sequelize.define('groupAdministrators', {} as any, {} as any);

  Category.belongsToMany(models.User, {as: 'administrators', through: models.CategoryAdministrators});
  models.User.belongsToMany(Category, {as: 'administratorInCategories', through: models.CategoryAdministrators});

  models.CategoryMembers = sequelize.define('groupMembers', {} as any, {} as any);

  Category.belongsToMany(models.User, {as: 'members', through: models.CategoryMembers});
  models.User.belongsToMany(Category, {as: 'memberInCategories', through: models.CategoryMembers});

  await Category.sync({});

  await models.CategoryGroups.sync({});
  await models.CategoryAdministrators.sync({});
  await models.CategoryMembers.sync({});

  return Category;
};
