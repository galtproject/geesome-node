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

const ffmpeg = require('fluent-ffmpeg');
const _ = require('lodash');
const stream = require('stream');

export class VideoThumbnail extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Small, OutputSize.Medium, OutputSize.Large];

  async processByStream(inputStream, options: any = {}) {
    const transformStream = new stream.Transform();
    transformStream._transform = function (chunk, encoding, done) {
      this.push(chunk);
      done();
    };

    ffmpeg()
      .input(inputStream)
      .inputFormat(options.extension)
      .outputOptions(["-movflags faststart", '-f image2', '-vframes 1', '-vcodec png', '-f rawvideo', '-ss 00:00:00'])//, '-s 320x240'
      .output(transformStream)
      .on('error', function (err, stdout, stderr) {
        console.error('An error occurred: ' + err.message, err, stderr);
        options.onError && options.onError(err);
      })
      .run();

    transformStream.on("error", (err) => {
      console.error('transformStream error', err);
      options.onError && options.onError(err);
    });

    return {
      stream: transformStream,
      type: 'image/png',
      extension: 'png'
    };
  }

  async isInputExtensionSupported(extension) {
    return (new Promise((resolve, reject) => {
      ffmpeg.getAvailableFormats(function(err, formats) {
        if(err) {
          reject(err);
        }
        resolve(!!formats[extension]);
      });
    })) as any;
  }
}
