/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import fs from "fs";
import rimraf from "rimraf";
import * as uuid from 'uuid';
import unzip from 'unzip-stream';
import {DriverInput, OutputSize} from "../interface.js";
import AbstractDriver from "../abstractDriver.js";
import helpers from "../helpers.js";
const {getDirSize} = helpers;
const {v4: uuidv4} = uuid['default'];

export class ArchiveUploadDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Medium];

  async processByStream(inputStream, options: any = {}) {
    const path = `/tmp/` + uuidv4() + '-' + new Date().getTime();
    let size;

    try {
      let unzipStream = unzip.Extract({ path });
      await new Promise((resolve, reject) =>
        inputStream
          .on('error', error => {
            if (inputStream.truncated && fs.existsSync(path))
              fs.unlinkSync(path); // delete the truncated file
            reject(error);
          })
          .pipe(unzipStream)
          .on('data', (data) => console.log(data))
          .on('close', () => resolve({path}))
      );

      size = getDirSize(path);
    } catch (e) {
      if (options.onError) {
        options.onError(e);
        return;
      } else {
        throw e;
      }
    }

    return {
      tempPath: path,
      emitFinish: (callback) => {
        rimraf(path, () => callback && callback());
      },
      type: 'folder',
      size
    };
  }
}
