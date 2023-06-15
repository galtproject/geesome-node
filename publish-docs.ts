/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "./app/interface";

const {spawn} = require('child_process');
const fs = require('fs');

module.exports = (app: IGeesomeApp) => {
  if(!fs.existsSync(__dirname + '/node_modules/.bin/apidoc')) {
    return console.warn("Script for generating docs not found :(");
  }
  //TODO: include modules api
  const child = spawn(__dirname + '/node_modules/.bin/apidoc', ['-i', 'app/modules/api', '-o', 'docs/',  '-t', 'node_modules/geesome-apidoc-template/template']);

  child.on('close', async (code) => {
    if (code !== 0) {
      return console.warn("Docs publishing failed :(");
    }
    const result = await app.ms.storage.saveDirectory(__dirname + '/docs');

    console.log('Docs IPFS:', result.id);

    // const geesomeDocsAcc = await app.ms.communicator.createAccountIfNotExists('geesome.docs');
    // await app.ms.communicator.bindToStaticId(result.id, geesomeDocsAcc);
    //
    // console.log('Docs IPNS:', geesomeDocsAcc);
  });
};
