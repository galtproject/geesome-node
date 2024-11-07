/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {DriverInput, OutputSize} from "../interface.js";
import AbstractDriver from "../abstractDriver.js";
import sharp from "sharp";
import * as uuid from 'uuid';
import fs from "fs";
import { exec } from "child_process";
const {v4: uuidv4} = uuid;

export class GifPreviewDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream, DriverInput.Path];
  supportedOutputSizes = [OutputSize.Small, OutputSize.Medium, OutputSize.Large];

  async processByPath(path, options: any = {}) {
    console.log(sharp.format.magick);
    console.log('GifPreviewDriver.processByStream');
    const extension = options.extension || 'png';

    return new Promise((resolve, reject) => {
      const resultPath = `/tmp/` + uuidv4() + '-' + new Date().getTime() + '.' + extension;
      exec(`convert '${path}[0]' ${resultPath}`, (error, stdout, stderr) => {
        if (error) {
          return reject(error);
        }
        if (stderr) {
          return reject(new Error(stderr));
        }
        resolve({
          stream: fs.createReadStream(resultPath),
          type: 'image/' + extension,
          emitFinish: (callback) => {
            fs.unlinkSync(path);
            callback();
          },
          extension: extension
        });
      });
    });
    //https://github.com/lovell/sharp/issues/3161
    // const resultStream = sharp(_.endsWith(path, '.gif') ? path : path + '.gif')
    //     .jpeg()
    //     .withMetadata()
    //     .toFormat(extension);
    //
    // resultStream.on("error", (err) => {
    //   console.error('resultStream error', err);
    //   options.onError && options.onError(err);
    // });
  }

  async processByStream(stream, options: any = {}) {
    const resultPath = `/tmp/` + uuidv4() + '-' + new Date().getTime() + '.gif';
    console.log('resultPath', resultPath);
    stream.pipe(fs.createWriteStream(resultPath));
    return new Promise((resolve, reject) => {
      stream
          .on('end', () => resolve(this.processByPath(resultPath).then(r => {fs.unlinkSync(resultPath); return r})))
          .on('error', (e) => reject(e));
    });
  }
}
