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

  models.User = await (await import('./user')).default(sequelize, models);
  models.UserApiKey = await (await import('./userApiKey')).default(sequelize, models);

  models.CorePermission = await (await import('./corePermission')).default(sequelize, models);

  models.Content = await (await import('./content')).default(sequelize, models);
  models.Object = await (await import('./object')).default(sequelize, models);

  models.UserContentAction = await (await import('./userContentAction')).default(sequelize, models);
  models.UserLimit = await (await import('./userLimit')).default(sequelize, models);

  models.Value = await (await import('./value')).default(sequelize, models);

  return models;
};
