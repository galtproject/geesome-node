/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../../interface";
import { createHelia } from 'helia';

module.exports = async (app: IGeesomeApp) => {
  const JsIpfsServiceNodePass = (await import("geesome-libs/src/JsIpfsServiceNodePass.js")).default;
  while (true) {
    try {
      const helia = await createHelia({});
      console.log('🎁 IPFS node have started');
      return JsIpfsServiceNodePass(helia, app.config.storageConfig.jsNode.pass);
    } catch (e) {
      console.warn('createDaemonNode error, trying to reconnect...', e.message);
      await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
    }
  }
};
