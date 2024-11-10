/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import fs from "fs";
import {spawn} from 'child_process';
import {IGeesomeApp} from "./app/interface";
import helpers from "./app/helpers";

export default (app: IGeesomeApp) => {
  const apiDocPath = helpers.getCurDir() + '/../node_modules/.bin/apidoc';
  console.log('apiDocPath', apiDocPath);
  if (!fs.existsSync(apiDocPath)) {
    return console.warn("Script for generating docs not found :(");
  }
  //TODO: include modules api
  const child = spawn(apiDocPath, ['-i', 'app/modules/api', '-o', 'docs/',  '-t', 'node_modules/geesome-apidoc-template/template']);

  child.on('close', async (code) => {
    if (code !== 0) {
      return console.warn("Docs publishing failed :(");
    }
    const result = await app.ms.storage.saveDirectory(helpers.getCurDir() + '/../docs');

    console.log('Docs IPFS:', result.id);

    // const geesomeDocsAcc = await app.ms.communicator.createAccountIfNotExists('geesome.docs');
    // await app.ms.communicator.bindToStaticId(result.id, geesomeDocsAcc);
    //
    // console.log('Docs IPNS:', geesomeDocsAcc);
  });
};
