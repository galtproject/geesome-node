/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../../app/interface";

const JsIpfsServiceNode = require("@galtproject/geesome-libs/src/JsIpfsServiceNode");

const IPFS = require('ipfs');
const Gateway = require('ipfs/src/http');

module.exports = async (app: IGeesomeApp) => {
  const node = new IPFS(app.config.storageConfig.jsNode);

  // console.log('node', node);
  try {
    await new Promise((resolve, reject) => {
      node.on('ready', (err) => err ? reject(err) : resolve());
      node.on('error', (err) => reject(err))
    });

    const gateway = new Gateway(node);
    await gateway.start();

    console.log('🎁 IPFS node have started');
  } catch (e) {
    console.error('❌ IPFS not started', e);
  }

  return new JsIpfsServiceNode(node);
};
