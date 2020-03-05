/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const sigUtil = require('eth-sig-util');

module.exports = {
  getAccountAddressBySignature(signature, message, fieldName) {
    const messageParams = [ { type: 'string', name: fieldName, value: message} ];
    return sigUtil.recoverTypedSignatureLegacy({ data: messageParams, sig: signature })
  },
  isSignatureValid(address, signature, message, fieldName) {
    const signedByAddress = this.getAccountAddressBySignature(signature, message, fieldName);
    return signedByAddress.toLowerCase() === address.toLowerCase();
  }
};
