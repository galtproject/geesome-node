/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = async function (sequelize) {
  const models: any = {};

  models.User = await require('./user')(sequelize, models);
  models.UserApiKey = await require('./userApiKey')(sequelize, models);

  models.CorePermission = await require('./corePermission')(sequelize, models);

  models.Content = await require('./content')(sequelize, models);
  models.Object = await require('./object')(sequelize, models);

  models.UserContentAction = await require('./userContentAction')(sequelize, models);
  models.UserLimit = await require('./userLimit')(sequelize, models);
  models.UserAccount = await require('./userAccount')(sequelize, models);
  models.UserAuthMessage = await require('./userAuthMessage')(sequelize, models);

  models.Value = await require('./value')(sequelize, models);

  return models;
};
