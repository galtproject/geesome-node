/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize} from 'sequelize';

export default async function (sequelize: Sequelize, appModels) {

  appModels.GroupCategory = await (await import('./groupCategory')).default(sequelize, appModels);
  appModels.GroupSection = await (await import('./groupSection')).default(sequelize, appModels);

  return appModels;
};
