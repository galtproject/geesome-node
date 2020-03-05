/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IChainService, IChainTransferEvent, IChainTxStatus} from "../interface";

const _ = require('lodash');

const Web3 = require("web3");
const axios = require('axios');

let config = require('./config');

module.exports = async (extendConfig) => {
  config = _.merge({}, config, extendConfig || {});

  if (!config.rpcServer) {
    console.error('rpcServer required in config.js');
    process.exit(1);
  }

  return new ChainWeb3Service();
};

class ChainWeb3Service implements IChainService {
  websocketProvider: any;
  httpProvider: any;
  web3: any;

  tokenContract: any;
  crowdsaleContract: any;

  callbackOnReconnect: any;

  symbolsCache: any;
  nonceCache: any;

  constructor() {
    if (_.startsWith(config.rpcServer, 'ws')) {
      this.websocketProvider = new Web3.providers.WebsocketProvider(config.rpcServer);
      this.web3 = new Web3(this.websocketProvider);
    } else {
      this.httpProvider = new Web3.providers.HttpProvider(config.rpcServer);
      this.web3 = new Web3(this.httpProvider);
    }

    this.createContractInstance();
    this.subscribeForReconnect();
  }

  getCoinbaseAddress() {
    return config.coinbase.address;
  }

  getDefaultTokenAddress() {
    return config.tokenContractAddress;
  }

  isValidAddress(address) {
    return this.web3.utils.isAddress(address);
  }

  async getCurrentBlock() {
    return this.web3.eth.getBlockNumber();
  }

  async getChainId() {
    return this.web3.eth.net.getId();
  }

  getExplorerTransactionTemplate() {
    return config.explorerTxTpl;
  }

  async getGasPrice() {
    let gasPrice = parseInt((await this.web3.eth.getGasPrice()).toString(10));
    if (gasPrice > 10000000000) {
      gasPrice = 5000000000;
    }
    return gasPrice;
  }

  onReconnect(callback) {
    this.callbackOnReconnect = callback;
  }

  async sendEther(fromAddress, fromPrivateKey, to, amount, nonce = null) {
    const gasPrice = await this.getGasPrice();
    let options = {
      from: fromAddress,
      to: to,
      value: this.etherToWei(amount),
      gasPrice: gasPrice,
      nonce: nonce,
      gas: 21000
    };

    if (!options.nonce) {
      options.nonce = await this.web3.eth.getTransactionCount(options.from);
    }

    if (typeof options.nonce === "string") {
      options.nonce = this.web3.utils.hexToNumber(options.nonce);
    }

    const signedTx = await this.web3.eth.accounts.signTransaction(
      options,
      fromPrivateKey,
      false,
    );

    return new Promise((resolve, reject) => {
      const response = this.web3.eth.sendSignedTransaction(signedTx.rawTransaction, (err, hash) => {
        if (err) {
          if (_.includes(err.message, "Transaction gas price is too low")) {
            return resolve(this.sendEther(fromAddress, fromPrivateKey, to, amount, options.nonce + 1));
          } else {
            return reject(err);
          }
        }

        resolve({
          hash: hash,
          promise: response,
          nonce: options.nonce,
          gasPrice: gasPrice
        });
      })
    })
  }

  getTotalSupply() {
    return new Promise((resolve, reject) => {
      this.tokenContract.methods.totalSupply()
        .call((err, supply) => err ? reject(err) : resolve(this.weiToEther(supply)));
    });
  }

  getCrowdsaleRate(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.crowdsaleContract.methods.rate()
        .call((err, rate) => err ? reject(err) : resolve(rate.toString(10)));
    });
  }

  getTokensBalance(address, tokenAddress?) {
    if (!tokenAddress) {
      tokenAddress = config.tokenContractAddress;
    }
    let contract = this.tokenContract;
    if (!contract) {
      contract = new this.web3.eth.Contract(config.tokenContractAbi, tokenAddress);
    }
    return new Promise((resolve, reject) => {
      contract.methods.balanceOf(address)
        .call((err, tokens) => err ? reject(err) : resolve(this.weiToEther(tokens)));
    });
  }

  async getTokenSymbol(tokenAddress): Promise<any> {
    if (!this.symbolsCache) {
      this.symbolsCache = {};
    }
    if (this.symbolsCache[tokenAddress]) {
      return this.symbolsCache[tokenAddress];
    }

    let contract = new this.web3.eth.Contract(config.tokenContractAbi, tokenAddress);
    return new Promise((resolve) => {
      contract.methods.symbol()
        .call((err, symbol) => {
          if (err) {
            contract.methods._symbol().call((err, symbol) => {
              if (err) {
                this.symbolsCache[tokenAddress] = ' ';
                resolve(' ');
              } else {
                this.symbolsCache[tokenAddress] = symbol;
                resolve(symbol);
              }
            });
          } else {
            this.symbolsCache[tokenAddress] = symbol;
            resolve(symbol);
          }
        });
    });
  }

  getExplorerTokensBalance(address, tokenAddress?) {
    if (!tokenAddress) {
      tokenAddress = config.tokenContractAddress;
    }
    const explorerUrl = _.template(config.explorerTokenBalanceTpl)({
      contractAddress: tokenAddress,
      accountAddress: address
    });

    return axios.get(explorerUrl).then((response) => this.weiToEther(response.data.result));
  }

  weiToEther(wei): number {
    return parseFloat(Web3.utils.fromWei(wei.toString(10), 'ether'))
  }

  etherToWei(ether): number {
    return (Web3.utils.toWei(ether.toString(10), 'ether')).toString(10);
  }

  // async sellTokens(tokensAddress, tokensAmount, accountAddress) {
  //     const rate = await this.getCrowdsaleRate();
  //     const weiToSend = new BN(this.etherToWei(tokensAmount)).div(new BN(rate));
  //    
  //     const { hash: txHash} = await this.sendMethod(
  //         this.crowdsaleContract.methods.buyTokens(accountAddress),
  //         config.crowdsaleContractAddress,
  //         config.coinbase.address,
  //         config.coinbase.privateKey,
  //         weiToSend
  //     );
  //     return txHash;
  // }

  async sendTokens(tokensAddress, tokensAmount, accountAddress) {
    const {hash: txHash} = await this.sendMethod(
      this.tokenContract.methods.transfer(accountAddress, this.etherToWei(tokensAmount)),
      tokensAddress,
      config.coinbase.address,
      config.coinbase.privateKey
    );
    return txHash;
  }

  async sendMethod(method, contractAddress, from, privateKey, sendValue = '0', nonce = null): Promise<any> {
    const gasPrice = await this.getGasPrice();
    let options = {
      from: from,
      gasPrice: gasPrice,
      nonce: nonce,
      gas: null,
      value: sendValue
    };

    const encodedABI = method.encodeABI();
    if (!options.nonce) {
      options.nonce = await this.web3.eth.getTransactionCount(options.from);
    }

    if (typeof options.nonce === "string") {
      options.nonce = parseInt(this.web3.utils.hexToNumber(options.nonce));
    }

    if (!this.nonceCache) {
      this.nonceCache = {};
    }
    if (!_.isUndefined(this.nonceCache[from]) && this.nonceCache[from] >= options.nonce) {
      options.nonce = this.nonceCache[from] + 1;
    }

    this.nonceCache[from] = options.nonce;

    try {
      options.gas = await method.estimateGas(options);
    } catch (e) {
      options.gas = "6378750";
    }

    options = _.extend(options, {
      data: encodedABI,
      to: contractAddress
    });

    // console.log('signTransaction', options, privateKey);

    const signedTx = await this.web3.eth.accounts.signTransaction(
      options,
      privateKey,
      false,
    );

    return new Promise((resolve, reject) => {
      const response = this.web3.eth.sendSignedTransaction(signedTx.rawTransaction, (err, hash) => {
        if (err) {
          if (_.includes(err.message, "Transaction gas price is too low")) {
            this.nonceCache[from] += 1;
          }
          console.log('❌ Error', options.nonce, err.message);
          return reject(err);
        }
        console.log('✅ Success', options.nonce, hash);

        resolve({
          hash: hash,
          promise: response,
          nonce: options.nonce,
          gasPrice: gasPrice
        });
      })
    })
  }

  getTokensTransfersToAddress(address: string, fromBlock?: number): Promise<IChainTransferEvent[]> {
    return this.tokenContract.getPastEvents('Transfer', {fromBlock, filter: {to: address}});
  }

  async getTokensTransfersSumOfAddress(address: string, fromBlock?: number): Promise<number> {
    const events = await this.getTokensTransfersToAddress(address, fromBlock);
    // console.log('events', events);
    return this.weiToEther(_.sumBy(events, function (e: IChainTransferEvent) {
      return parseInt(e.returnValues.value.toString(10));
    }));
  }


  async getTransactionStatus(txHash): Promise<string> {
    const receipt = await this.web3.eth.getTransactionReceipt(txHash);

    if (receipt && receipt.blockNumber) {
      return receipt.status ? IChainTxStatus.CONFIRMED : IChainTxStatus.REVERTED;
    } else {
      return IChainTxStatus.PENDING;
    }
  }

  private subscribeForReconnect() {
    if (!this.websocketProvider) {
      return;
    }
    this.websocketProvider.on('end', () => {
      setTimeout(() => {
        console.log('🔁 Websocket reconnect');

        this.websocketProvider = new Web3.providers.WebsocketProvider(config.rpcServer);
        this.web3 = new Web3(this.websocketProvider);

        if (this.callbackOnReconnect) {
          this.callbackOnReconnect();
        }

        this.subscribeForReconnect();
      }, 1000);
    });
  }

  private createContractInstance() {
    this.tokenContract = new this.web3.eth.Contract(config.tokenContractAbi, config.tokenContractAddress);
    this.crowdsaleContract = new this.web3.eth.Contract(config.crowdsaleContractAbi, config.crowdsaleContractAddress);
  }
}
