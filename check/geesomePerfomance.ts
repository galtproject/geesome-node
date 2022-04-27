/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../app/interface";
import {
  CorePermissionName,
} from "../app/modules/database/interface";

// const ipfsHelper = require("geesome-libs/src/ipfsHelper");
// const assert = require('assert');
const log = require('../app/helpers').log;
const { generateRandomData } = require('./helpers');

(async () => {
  const databaseConfig = {name: 'geesome_test', options: {logging: () => {}}};
  const appConfig = require('../app/config');
  appConfig.storageConfig.jsNode.repo = '.jsipfs-test';
  appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
  appConfig.storageConfig.jsNode.config = {
    Addresses: {
      Swarm: [
        "/ip4/0.0.0.0/tcp/40002",
        "/ip4/127.0.0.1/tcp/40003/ws",
        "/dns4/wrtc-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star"
      ]
    }
  };
  let app: IGeesomeApp;

  try {
    app = await require('../app')({databaseConfig, storageConfig: appConfig.storageConfig, port: 7771});

    await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
    const testUser = await app.registerUser({email: 'user@user.com', name: 'user', password: 'user', permissions: [CorePermissionName.UserAll]});
    await app.createGroup(testUser.id, {
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
    const textContent = await app.saveData(randomData, 'text.txt', {userId: saveDataTestUser.id});
    const after = new Date().getTime();
    // const contentObj = await app.storage.getObject(textContent.manifestStorageId);
    log(after - before);
  }


  await app.database.flushDatabase();
  await app.stop();
})();