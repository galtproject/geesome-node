/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = async function (sequelize, appModels) {

  appModels.Group = await require('./group')(sequelize, appModels);
  appModels.GroupPermission = await require('./groupPermission')(sequelize, appModels);
  appModels.GroupRead = await require('./groupRead')(sequelize, appModels);
  appModels.Post = await require('./post')(sequelize, appModels);

  appModels.Tag = await require('./tag')(sequelize, appModels);
  appModels.AutoTag = await require('./autoTag')(sequelize, appModels);

  return appModels;
};
