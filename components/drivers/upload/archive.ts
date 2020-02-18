/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {DriverInput, OutputSize} from "../interface";
import AbstractDriver from "../abstractDriver";

const unzip = require('unzip');
const fs = require('fs');
const uuidv4 = require('uuid/v4');
const rimraf = require("rimraf");

export class ArchiveUploadDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Medium];

  async processByStream(inputStream, options: any = {}) {
    const path = `/tmp/` + uuidv4() + '-' + new Date().getTime();

    await new Promise((resolve, reject) =>
      inputStream
        .on('error', error => {
          if (inputStream.truncated)
            // delete the truncated file
            fs.unlinkSync(path);
          reject(error);
        })
        .pipe(unzip.Extract({path: path}))
        .on('close', () => resolve({path}))
    );

    return {
      tempPath: path,
      emitFinish: (callback) => {
        rimraf(path, function () { callback && callback(); });
      },
      type: 'folder'
    };
  }
}
