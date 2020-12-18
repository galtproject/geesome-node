/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../../app/interface";

const JsIpfsServiceNode = require("geesome-libs/src/JsIpfsServiceNode");
const {createDaemonNode} = require("geesome-libs/src/ipfsHelper");

module.exports = async (app: IGeesomeApp) => {
  let node;
  try {
    node = await createDaemonNode({}, app.config.storageConfig.jsNode);
    console.log('🎁 IPFS node have started');
  } catch (e) {
    console.error('❌ IPFS not started', e);
  }

  return new JsIpfsServiceNode(node);
};
