/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {DriverInput, OutputSize} from "../interface";
import AbstractDriver from "../abstractDriver";

const fs = require('fs');
const uuidv4 = require('uuid/v4');
const rimraf = require("rimraf");
const isString = require("lodash/isString");

export class FileUploadDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Medium];

  async processByStream(inputStream, options: any = {}) {
    const path = `/tmp/` + uuidv4() + '-' + new Date().getTime() + (options.extension ? '.' + options.extension : '');
    let size;

    try {
      if (isString(inputStream)) {
        fs.writeFileSync(path, inputStream);
      } else {
        await new Promise((res) =>
            inputStream
                .pipe(fs.createWriteStream(path))
                .on("close", res)
        );
      }
      size = getFileSize(path);
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
        rimraf(path, function () {
          callback && callback();
        });
      },
      type: 'file',
      size
    };
  }
}

function getFileSize(filePath) {
  return fs.statSync(filePath).size;
}
