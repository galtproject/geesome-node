/*
 * Copyright ©️ 2019 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const _ = require('lodash');

module.exports = function () {
  const logArgs = _.map(arguments, (arg) => arg);

  const dateTimeStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
  logArgs.splice(0, 0, dateTimeStr);

  console.log.apply(console, logArgs);
};
