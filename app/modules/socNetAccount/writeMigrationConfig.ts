/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export {};

let config = require('./config');
const fs = require('fs');

if (!fs.existsSync(`${__dirname}/config/`)) {
  fs.mkdirSync(`${__dirname}/config/`);
}

const storage = config.options.storage ? __dirname.replace('app/modules/socNetAccount', '') + config.options.storage : undefined;

fs.writeFileSync(`${__dirname}/config/config.json`, JSON.stringify({
  production: { dialect: config.options.dialect, storage}
}));

if (storage) {
  if (!fs.existsSync(storage)) {
    process.exit(1);
  }
}
