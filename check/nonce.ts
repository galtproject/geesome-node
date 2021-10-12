/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
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
