/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import GeesomeApp from '../app/index.js';
import appConfig from '../app/config.js';
import helpers from './helpers/index.js';
import appHelpers from '../app/helpers.js';
import {IGeesomeApp} from "../app/interface.js";
import {CorePermissionName} from "../app/modules/database/interface.js";
const {generateRandomData} = helpers;
const {log} = appHelpers;

(async () => {
  const databaseConfig = {name: 'geesome_test', options: {logging: () => {}}};
  appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
  let app: IGeesomeApp;

  try {
    app = await GeesomeApp({databaseConfig, storageConfig: appConfig.storageConfig, port: 7771});

    await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
    const testUser = await app.registerUser({email: 'user@user.com', name: 'user', password: 'user', permissions: [CorePermissionName.UserAll]});
    await app.ms.group.createGroup(testUser.id, {
      name: 'test',
      title: 'Test'
    });
  } catch (e) {
    console.error(e);
  }

  const saveDataTestUser = await app.registerUser({email: 'user-save-data@user.com', name: 'user-save-data', permissions: [CorePermissionName.UserSaveData]});

  const megabyte = 100 * 1024 * 1024;
  log('saveDataTestUser');
  for (let i = 0; i < 100; i++) {
    const randomData = await generateRandomData(megabyte);
    const before = new Date().getTime();
    const textContent = await app.ms.content.saveData(randomData, 'text.txt', {userId: saveDataTestUser.id});
    const after = new Date().getTime();
    // const contentObj = await app.storage.getObject(textContent.manifestStorageId);
    log(after - before);
  }


  await app.ms.database.flushDatabase();
  await app.stop();
})();