/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
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
