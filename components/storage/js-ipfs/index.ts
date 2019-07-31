/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

import {IGeesomeApp} from "../../app/interface";
const JsIpfsServiceNode = require("@galtproject/geesome-libs/src/JsIpfsServiceNode");

const _ = require('lodash');

const IPFSFactory = require('ipfsd-ctl');
const f = IPFSFactory.create({
  path: require('ipfs'),
  // exec: require('ipfs'),
  type: 'js',
  port: 5001
});

// const ipfs = )

module.exports = async (app: IGeesomeApp) => {
    
    const daemon = await f.spawn(_.extend({
      disposable: false,
      repoPath: '$HOME/.jsipfs',
      defaultAddrs: true,
      // args: ['--api /ip4/127.0.0.1/tcp/5001']
      // config: app.config.storageConfig.jsNode
    }, app.config.storageConfig.jsNode));
    
    let node;
    // console.log('node', node);
    try {
      if(!daemon.initialized) {
        await daemon.init();
      }
      await daemon.start();

      console.log('daemon',daemon);
      node = daemon.api;
        await new Promise((resolve, reject) => {
            node.on('ready', (err) => err ? reject(err) : resolve());
            node.on('error', (err) => reject(err))
        });
        
        console.log('🎁 IPFS node have started');
    } catch (e) {
        console.error('❌ IPFS not started', e);
    }
    
    return new JsIpfsServiceNode(node);
};
