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

const { create } = require('ipfs-http-client');

module.exports = async (app: IGeesomeApp) => {
  const node = create(app.config.storageConfig.goNode);
  console.log('🎁 IPFS node have connected, profile:', process.env.IPFS_PROFILE);
  const service = new JsIpfsServiceNode(node);
  service.isStreamAddSupport = () => {
    return false;
  };

  await service.node.config.profiles.apply(process.env.IPFS_PROFILE);

  return service;
};
