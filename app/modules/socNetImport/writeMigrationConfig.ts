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
import config from '../database/config.js';

const modulePath = `${helpers.getCurDir()}/modules/socNetImport/config/`;
if (!fs.existsSync(modulePath)) {
  fs.mkdirSync(modulePath);
}
fs.writeFileSync(`${modulePath}config.json`, JSON.stringify({
  production: {
    database: config.database,
    username: config.username,
    password: config.password,
    host: config.host,
    dialect: config.dialect
  }
}));