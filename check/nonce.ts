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

if(!process.env.RPC_SERVER) {
    process.env.RPC_SERVER = 'ws://localhost:8546';
}

(async () => {
    const Web3 = require("web3");

    
    let web3;
    if(process.env.RPC_SERVER.indexOf('ws://') != -1) {
        web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.RPC_SERVER));
    } else {
        web3 = new Web3(new Web3.providers.HttpProvider(process.env.RPC_SERVER));
    }

    console.log('rpc server', process.env.RPC_SERVER);
    console.log('address', process.env.ADDRESS);
    console.log('nonce', await web3.eth.getTransactionCount(process.env.ADDRESS));
    process.exit();
})();
