/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../components/app/interface";
import {
  CorePermissionName,
} from "../components/database/interface";

// const ipfsHelper = require("geesome-libs/src/ipfsHelper");
// const assert = require('assert');
const log = require('../components/log');
const { generateRandomData } = require('./helpers');

(async () => {
  const databaseConfig = {name: 'geesome_test', options: {logging: () => {}}};
  const appConfig = require('../components/app/v1/config');
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
  let group, user;

  try {
    app = await require('../components/app/v1')({databaseConfig, storageConfig: appConfig.storageConfig, port: 7771});

    await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
    user = await app.registerUser({email: 'user@user.com', name: 'user', password: 'user', permissions: [CorePermissionName.UserAll]});
    group = await app.createGroup(user.id, {
      name: 'microwave',
      title: 'Microwave'
    }).then(() => app.getGroupByParams({name: 'microwave'}));
  } catch (e) {
    console.error(e);
  }

  const TelegramClient = require('../components/socNetClient/telegram');
  const telegram = new TelegramClient();
  await telegram.init(await app.database.getDriver());

  // https://my.telegram.org/
  // const res = await telegram.login(user.id, {
  //   phoneNumber: '',
  //   password: '',
  //   apiId: '',
  //   apiHash: '',
  //   phoneCodeHash: '',
  //   phoneCode: ''
  // });
  // console.log('res', res);

  console.log(await telegram.getMessages(2, 'inside_microwave', [1,2]))

  // await app.database.flushDatabase();
  await app.stop();
})();