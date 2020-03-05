/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = async function (sequelize, models) {
  const Sequelize = require('sequelize');

  const FileCatalogItemPermission = sequelize.define('fileCatalogItemPermission', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    name: {
      type: Sequelize.STRING(200)
    },
    title: {
      type: Sequelize.STRING
    },
    isActive: {
      type: Sequelize.BOOLEAN
    }
  } as any, {
    indexes: [
      // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
      // { fields: ['chainAccountAddress'] },
      // { fields: ['tokensAddress'] },
      // { fields: ['tokensAddress', 'chainAccountAddress'] }
    ]
  } as any);

  FileCatalogItemPermission.belongsTo(models.FileCatalogItem, {as: 'fileCatalogItem', foreignKey: 'itemId'});
  models.FileCatalogItem.hasMany(FileCatalogItemPermission, {as: 'permissions', foreignKey: 'itemId'});

  FileCatalogItemPermission.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(FileCatalogItemPermission, {as: 'fileCatalogPermissions', foreignKey: 'userId'});

  return FileCatalogItemPermission.sync({});
};
