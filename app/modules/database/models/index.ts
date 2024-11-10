/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export default async function (sequelize) {
  const models: any = {};

  models.User = await (await import('./user.js')).default(sequelize, models);
  models.UserApiKey = await (await import('./userApiKey.js')).default(sequelize, models);

  models.CorePermission = await (await import('./corePermission.js')).default(sequelize, models);

  models.Content = await (await import('./content.js')).default(sequelize, models);
  models.Object = await (await import('./object.js')).default(sequelize, models);

  models.UserContentAction = await (await import('./userContentAction.js')).default(sequelize, models);
  models.UserLimit = await (await import('./userLimit.js')).default(sequelize, models);

  models.Value = await (await import('./value.js')).default(sequelize, models);

  return models;
};
