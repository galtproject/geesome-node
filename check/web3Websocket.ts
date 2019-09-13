/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
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
