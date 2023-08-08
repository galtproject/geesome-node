/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../../interface";

const JsIpfsServiceNode = require("geesome-libs/src/JsIpfsServiceNode");

module.exports = async (app: IGeesomeApp) => {
  const { create } = await import('ipfs-http-client');
  console.log('ipfs-http-client create', app.config.storageConfig.goNode);
  const node = create(app.config.storageConfig.goNode);
  console.log('🎁 IPFS node have connected, profile:', process.env.IPFS_PROFILE);
  const service = new JsIpfsServiceNode(node);
  service.isStreamAddSupport = () => {
    return false;
  };

  //TODO: remove config setting after migration to new ipfs http client
  await service.node.config.set('Addresses.Swarm', await service.node.config.get('Addresses.Swarm').then(list => list.filter(s => !s.includes('quic'))));
  await service.node.config.set('Bootstrap', await service.node.config.get('Bootstrap').then(list => list.filter(s => !s.includes('quic'))));
  if (process.env.IPFS_PROFILE) {
    await service.node.config.profiles.apply(process.env.IPFS_PROFILE);
  }

  while (true) {
    try {
      await service.getBootNodeList();
      break;
    } catch (e) {
      console.warn('getBootNodeList error, trying to reconnect...', e.message);
      await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
    }
  }

  return service;
};
