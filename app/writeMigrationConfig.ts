/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import fs from "fs";
import helpers from "./helpers";
import config from './modules/database/config';

export default function (moduleName: string) {
  if (!fs.existsSync(moduleDirPath('migrations'))) {
    fs.mkdirSync(moduleDirPath('migrations'));
  }
  if (!fs.existsSync(moduleDirPath('config'))) {
    fs.mkdirSync(moduleDirPath('config'));
  }
  fs.writeFileSync(`${moduleDirPath('config')}/config.json`, JSON.stringify({
    production: {
      database: config.database,
      username: config.username,
      password: config.password,
      host: config.host,
      dialect: config.dialect
    }
  }));

  function moduleDirPath(dirName: string) {
    return `${helpers.getCurDir()}/modules/${moduleName}/${dirName}`;
  }
}