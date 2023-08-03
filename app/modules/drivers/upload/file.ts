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

export class FileUploadDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Medium];

  async processByStream(inputStream, options: any = {}) {
    const path = `/tmp/` + uuidv4() + '-' + new Date().getTime() + (options.extension ? '.' + options.extension : '');
    let size;

    console.log('processByStream', path);
    try {
      if (inputStream.pipe) {
        await new Promise((resolve, reject) => {
          console.log('fs.createWriteStream');
          if(inputStream.isPaused()) {
            inputStream.resume();
          }
          const writableStream = fs.createWriteStream(path);
          console.log('inputStream.pipe', inputStream);
          inputStream
              .pipe(writableStream)
              .on("close", resolve)
              .on("finish", resolve)
              .on("error", reject);

          writableStream
              .on("error", reject)
              .on('close', () => {
                console.log('writableStream.on close');
                resolve(null);
              });
        })
      } else {
        console.log('writeFileSync', path);
        fs.writeFileSync(path, inputStream);
      }
      console.log('getFileSize');
      size = getFileSize(path);
      console.log('getFileSize', size);
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
