/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import { create } from 'kubo-rpc-client';
import JsIpfsServiceNode from "geesome-libs/src/JsIpfsServiceNode.js";
import {IGeesomeApp} from "../../interface.js";

export default async (app: IGeesomeApp) => {
  console.log('ipfs-http-client create', app.config.storageConfig.goNode);
  const node = create(app.config.storageConfig.goNode);
  console.log('🎁 IPFS node have connected, profile:', process.env.IPFS_PROFILE);
  const service = new JsIpfsServiceNode(node, 'kubo-rpc');

  let error;
  do {
    try {
      await service.getCurrentAccountId();
      if (process.env.IPFS_PROFILE) {
        await service.node.config.profiles.apply(process.env.IPFS_PROFILE);
      }
      error = null;
    } catch (e) {
      error = e;
      console.error('IPFS connection error, trying to reconnect:', e.message);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } while (error);

  service.isStreamAddSupport = () => {
    return false;
  };

  return service;
};
