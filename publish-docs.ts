/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "./components/app/interface";

const {spawn} = require('child_process');
const fs = require('fs');
const pIteration = require('p-iteration');

module.exports = (app: IGeesomeApp) => {
  if(!fs.existsSync(__dirname + '/node_modules/.bin/apidoc')) {
    return console.warn("Script for generating docs not found :(");
  }
  const child = spawn(__dirname + '/node_modules/.bin/apidoc', ['-i', 'components/api/http-v1', '-o', 'docs/',  '-t', 'node_modules/apidoc-template/template']);

  child.on('close', async (code) => {
    if (code !== 0) {
      return console.warn("Docs publishing failed :(");
    }
    const result = await app.storage.saveDirectory(__dirname + '/docs');

    console.log('Docs IPFS:', result.id);

    const geesomeDocsAcc = await app.storage.createAccountIfNotExists('geesome.docs');
    await app.storage.bindToStaticId(result.id, geesomeDocsAcc);

    console.log('Docs IPNS:', geesomeDocsAcc);
  });
};
