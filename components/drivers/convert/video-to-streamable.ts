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

const stream = require('stream');

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const uuidv1 = require('uuid/v1');

export class VideoToStreambleDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Medium];

  async processByStream(inputStream, options: any = {}) {
    const path = `/tmp/` + uuidv1() + '.' + options.extension;
    
    await new Promise((resolve, reject) =>
      inputStream
        .on('error', error => {
          if (inputStream.truncated)
          // delete the truncated file
            fs.unlinkSync(path);
          reject(error);
        })
        .pipe(fs.createWriteStream(path))
        .on('error', error => reject(error))
        .on('finish', () => resolve({path}))
    );
    
    const transformStream = new stream.Transform();
    transformStream._transform = function (chunk, encoding, done) {
      this.push(chunk);
      done();
    };

    console.log('path', path);
    
    new ffmpeg(path)
      .inputFormat(options.extension)
      .outputOptions("-movflags faststart+frag_keyframe+empty_moov")
      .output(transformStream)
      .outputFormat(options.extension)
      .on('error', function (err, stdout, stderr) {
        console.log('An error occurred: ' + err.message, err, stderr);
      })
      .run();

    //
    return {
      stream: transformStream,
      type: 'video/' + options.extension
    }
  }
}
