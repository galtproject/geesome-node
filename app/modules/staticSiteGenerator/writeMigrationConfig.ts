/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import fs from "fs";
import helpers from "../../helpers.js";
import config from './config.js';

if (!fs.existsSync(`${helpers.getCurDir()}/config/`)) {
  fs.mkdirSync(`${helpers.getCurDir()}/config/`);
}

const storage = config.options.storage ? helpers.getCurDir().replace('app/modules/staticSiteGenerator', '') + config.options.storage : undefined;

fs.writeFileSync(`${helpers.getCurDir()}/config/config.json`, JSON.stringify({
  production: { dialect: config.options.dialect, storage}
}));

if (storage) {
  if (!fs.existsSync(storage)) {
    process.exit(1);
  }
}
