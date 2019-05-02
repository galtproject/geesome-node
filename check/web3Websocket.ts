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

// usage: 
// RPC_WS_SERVER=ws://localhost:8646 ./node_modules/.bin/ts-node check/web3Websocket.ts

(async () => {
    const Web3 = require("web3");

    const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.RPC_WS_SERVER));
    console.log('RPC_WS_SERVER', process.env.RPC_WS_SERVER);
    
    console.log('\nnetId', await web3.eth.net.getId());
    console.log('blockNumber', await web3.eth.getBlockNumber());
    console.log('gasPrice', await web3.eth.getGasPrice());
    process.exit();
})();
