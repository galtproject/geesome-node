/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const sigUtil = require('eth-sig-util');

module.exports = {
  getAccountAddressBySignature(signature, message) {
    const messageParams = [ { type: 'string', name: 'keywords', value: message} ];
    return sigUtil.recoverTypedSignatureLegacy({ data: messageParams, sig: signature })
  },
  isSignatureValid(address, signature, message) {
    const signedByAddress = this.getAccountAddressBySignature(signature, message);
    return signedByAddress.toLowerCase() === address.toLowerCase();
  }
};
