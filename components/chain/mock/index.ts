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

import {IChainService, IWallet} from "../interace";

const galtUtils = require('@galtproject/utils');

module.exports = async () => {
  return new ChainMockService();
};

class ChainMockService implements IChainService {
  newEventsCallback;

  constructor() {

  }

  subscribeForNewEvents(eventName: string, blockNumber: number, callback) {
    this.newEventsCallback = callback;
  }

  callNewEvent(eventName: string, contour, id) {
    this.newEventsCallback({returnValues: {contour, id}});
  }

  async getCurrentBlock() {
    return 0;
  }

  async onReconnect(callback) {

  }

  generateNewWallet() {
    return null
  };

  prepareWallet(address) {

  };

  getTokensBalance(address) {
    return null;
  };

  sendTokens(fromAddress, fromPrivateKey, to, amount) {
    return null;
  };

  async getTokensTransfersSumOfAddress(address, fromBlock?) {
    return 0;
  }
}
