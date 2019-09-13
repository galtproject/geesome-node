/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = {
  'rpcServer': 'https://server.yalland.com:8645',
  'coinbase': {
    'privateKey': '0x16ba06fe4d86f008bc65e96704dc370c158e206e99ef15c0f85a74c11595fc8d',
    'address': '0x95929F348360336c8a2224B7582cF71Ae4873776'
  },
  'explorerTxTpl': 'http://explorer.yalland.com/tx/<%= txHash %>',
  'explorerTokenBalanceTpl': 'http://explorer.yalland.com/api?module=account&action=tokenbalance&contractaddress=<%= contractAddress %>&address=<%= accountAddress %>',
  'autoClaimPeriodSeconds': 60 * 60,
  //prod:
  'tokenContractAddress': '0x8d4a6cd17d095ef09f460f181546fbec32e11e8b',
  //test:
  // 'tokenContractAddress': '0x9b815430b4a0fb2b8c53b5ee39e11db4a5fd1205',
  'tokenContractAbi': [{
    "constant": false,
    "inputs": [{"name": "spender", "type": "address"}, {"name": "value", "type": "uint256"}],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0x095ea7b3"
  }, {
    "constant": true,
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function",
    "signature": "0x18160ddd"
  }, {
    "constant": false,
    "inputs": [{"name": "from", "type": "address"}, {"name": "to", "type": "address"}, {
      "name": "value",
      "type": "uint256"
    }],
    "name": "transferFrom",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0x23b872dd"
  }, {
    "constant": true,
    "inputs": [],
    "name": "INITIAL_SUPPLY",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function",
    "signature": "0x2ff2e9dc"
  }, {
    "constant": true,
    "inputs": [],
    "name": "_decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function",
    "signature": "0x32424aa3"
  }, {
    "constant": false,
    "inputs": [{"name": "spender", "type": "address"}, {"name": "addedValue", "type": "uint256"}],
    "name": "increaseAllowance",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0x39509351"
  }, {
    "constant": false,
    "inputs": [{"name": "to", "type": "address"}, {"name": "value", "type": "uint256"}],
    "name": "mint",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0x40c10f19"
  }, {
    "constant": true,
    "inputs": [{"name": "owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function",
    "signature": "0x70a08231"
  }, {
    "constant": false,
    "inputs": [{"name": "account", "type": "address"}],
    "name": "addMinter",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0x983b2d56"
  }, {
    "constant": false,
    "inputs": [],
    "name": "renounceMinter",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0x98650275"
  }, {
    "constant": false,
    "inputs": [{"name": "spender", "type": "address"}, {"name": "subtractedValue", "type": "uint256"}],
    "name": "decreaseAllowance",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0xa457c2d7"
  }, {
    "constant": false,
    "inputs": [{"name": "to", "type": "address"}, {"name": "value", "type": "uint256"}],
    "name": "transfer",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0xa9059cbb"
  }, {
    "constant": true,
    "inputs": [{"name": "account", "type": "address"}],
    "name": "isMinter",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function",
    "signature": "0xaa271e1a"
  }, {
    "constant": true,
    "inputs": [],
    "name": "_symbol",
    "outputs": [{"name": "", "type": "string"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function",
    "signature": "0xb09f1266"
  }, {
    "constant": true,
    "inputs": [],
    "name": "symbol",
    "outputs": [{"name": "", "type": "string"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function",
    "signature": "0x95d89b41"
  }, {
    "constant": true,
    "inputs": [],
    "name": "_name",
    "outputs": [{"name": "", "type": "string"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function",
    "signature": "0xd28d8852"
  }, {
    "constant": true,
    "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function",
    "signature": "0xdd62ed3e"
  }, {
    "inputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "constructor",
    "signature": "constructor"
  }, {
    "anonymous": false,
    "inputs": [{"indexed": true, "name": "account", "type": "address"}],
    "name": "MinterAdded",
    "type": "event",
    "signature": "0x6ae172837ea30b801fbfcdd4108aa1d5bf8ff775444fd70256b44e6bf3dfc3f6"
  }, {
    "anonymous": false,
    "inputs": [{"indexed": true, "name": "account", "type": "address"}],
    "name": "MinterRemoved",
    "type": "event",
    "signature": "0xe94479a9f7e1952cc78f2d6baab678adc1b772d936c6583def489e524cb66692"
  }, {
    "anonymous": false,
    "inputs": [{"indexed": true, "name": "from", "type": "address"}, {
      "indexed": true,
      "name": "to",
      "type": "address"
    }, {"indexed": false, "name": "value", "type": "uint256"}],
    "name": "Transfer",
    "type": "event",
    "signature": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
  }, {
    "anonymous": false,
    "inputs": [{"indexed": true, "name": "owner", "type": "address"}, {
      "indexed": true,
      "name": "spender",
      "type": "address"
    }, {"indexed": false, "name": "value", "type": "uint256"}],
    "name": "Approval",
    "type": "event",
    "signature": "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"
  }],
  'crowdsaleContractAddress': '0x444248eaf31ea9165FA57F5A2fe5aD9D75f2BC49',
  'crowdsaleContractAbi': [{
    "constant": true,
    "inputs": [],
    "name": "rate",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }, {
    "constant": true,
    "inputs": [],
    "name": "weiRaised",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }, {
    "constant": true,
    "inputs": [],
    "name": "wallet",
    "outputs": [{"name": "", "type": "address"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }, {
    "constant": false,
    "inputs": [{"name": "beneficiary", "type": "address"}],
    "name": "buyTokens",
    "outputs": [],
    "payable": true,
    "stateMutability": "payable",
    "type": "function"
  }, {
    "constant": true,
    "inputs": [],
    "name": "token",
    "outputs": [{"name": "", "type": "address"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }, {
    "inputs": [{"name": "rate", "type": "uint256"}, {"name": "wallet", "type": "address"}, {
      "name": "token",
      "type": "address"
    }], "payable": false, "stateMutability": "nonpayable", "type": "constructor"
  }, {"payable": true, "stateMutability": "payable", "type": "fallback"}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "name": "purchaser", "type": "address"}, {
      "indexed": true,
      "name": "beneficiary",
      "type": "address"
    }, {"indexed": false, "name": "value", "type": "uint256"}, {"indexed": false, "name": "amount", "type": "uint256"}],
    "name": "TokensPurchased",
    "type": "event"
  }],
};
