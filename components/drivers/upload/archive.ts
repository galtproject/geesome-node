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

const unzip = require('unzip-stream');
const fs = require('fs');
const path = require('path');
const uuidv4 = require('uuid/v4');
const rimraf = require("rimraf");

export class ArchiveUploadDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Medium];

  async processByStream(inputStream, options: any = {}) {
    const path = `/tmp/` + uuidv4() + '-' + new Date().getTime();
    let size;

    try {
      let unzipStream = unzip.Extract({path: path});
      await new Promise((resolve, reject) =>
        inputStream
          .on('error', error => {
            if (inputStream.truncated)
              // delete the truncated file
              fs.unlinkSync(path);
            reject(error);
          })
          .pipe(unzipStream)
          .on('close', () => resolve({path}))
      );

      size = getTotalSize(path);
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
      type: 'folder',
      size
    };
  }
}

function getAllFiles(dirPath, arrayOfFiles?) {
  let files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function (file) {
    if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
      arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles)
    } else {
      arrayOfFiles.push(path.join(dirPath, file))
    }
  });

  return arrayOfFiles
};

function getTotalSize(directoryPath) {
  const arrayOfFiles = getAllFiles(directoryPath);

  let totalSize = 0;

  arrayOfFiles.forEach(function (filePath) {
    totalSize += fs.statSync(filePath).size
  });

  return totalSize
}
