/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../../app/interface";

const JsIpfsServiceNode = require("geesome-libs/src/JsIpfsServiceNode");

const IPFS = require('ipfs');
const Gateway = require('ipfs/src/http');

const net = require('net');

module.exports = async (app: IGeesomeApp) => {
  const node = new IPFS({
    ...app.config.storageConfig.jsNode,
    // https://github.com/ipfs/go-ipfs/issues/6398
    config: {
      Addresses: {
        Swarm: [
          "/ip4/0.0.0.0/tcp/4002",
          "/ip4/127.0.0.1/tcp/4003/ws",
        ]
      }
    }
  });
  //

  // console.log('node', node);
  try {
    await new Promise((resolve, reject) => {
      node.on('ready', (err) => err ? reject(err) : resolve());
      node.on('error', (err) => reject(err))
    });

    const gateway = new Gateway(node);
    await gateway.start();

    [{
      fromPort: 5001,
      fromHost: '0.0.0.0',
      toPort: 5002,
      toHost: '127.0.0.1',
    }].forEach((conf) => {
      net.createServer(function(from) {
        // console.log(`forward ${conf.fromHost}:${conf.fromPort} => ${conf.toHost}:${conf.toPort}`);

        const to = net.createConnection({
          host: conf.toHost,
          port: conf.toPort
        });
        from.pipe(to);
        to.pipe(from);
      }).listen(conf.fromPort, conf.fromHost);
    });

    // console.log('gateway.apiAddr', gateway._apiServers);

    console.log('🎁 IPFS node have started');
  } catch (e) {
    console.error('❌ IPFS not started', e);
  }

  return new JsIpfsServiceNode(node);
};
