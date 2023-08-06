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

const stream = require('stream');

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const uuidv4 = require('uuid/v4');
const mediainfo = require('node-mediainfo');

export class VideoToStreambleDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Medium];

  async processByStream(inputStream, options: any = {}) {
    const path = `/tmp/` + uuidv4() + '-' + new Date().getTime() + '.' + options.extension;

    await new Promise((resolve, reject) =>
      inputStream
        .on('error', error => {
          if (inputStream.truncated)
          // delete the truncated file
            fs.unlinkSync(path);
          reject(error);
        })
        .pipe(fs.createWriteStream(path))
        .on('close', () => resolve({path}))
    );

    //TODO: get videoinfo in separated process
    let videoInfo = await mediainfo(path);
    let resultStream = fs.createReadStream(path);
    resultStream.on("close", () => {
      fs.unlinkSync(path);
    });

    let durationSeconds = parseFloat(videoInfo.media.track[0].Duration);

    if (videoInfo.media.track[0].IsStreamable === 'Yes') {
      return {
        tempPath: path,
        stream: resultStream,
        type: 'video/' + options.extension,
        extension: options.extension,
        processed: false,
        duration: durationSeconds
      };
    }

    const transformStream = new stream.Transform();
    transformStream._transform = function (chunk, encoding, done) {
      this.push(chunk);
      done();
    };

    new ffmpeg(path)
      .inputFormat(options.extension)
      .outputOptions("-movflags faststart+frag_keyframe+empty_moov")
      .output(transformStream)
      .outputFormat('mp4')// TODO: check if options.extension format supported
      .on('progress', function (progress) {
        let a = progress.timemark.split(':');
        let currentSeconds = (+a[0]) * 60 * 60 + (+a[1]) * 60 + (+a[2]);
        progress.percent = currentSeconds / durationSeconds * 100;
        if (options.onProgress) {
          options.onProgress(progress);
        }
        console.log('progress:', progress);
      })
      .on('error', function (err, stdout, stderr) {
        console.error('An error occurred: ' + err.message, err, stderr);
        options.onError && options.onError(err);
      })
      .run();

    transformStream.on("finish", () => {
      fs.unlinkSync(path);
    });
    transformStream.on("error", (err) => {
      console.error('transformStream error', err);
      fs.unlinkSync(path);
      options.onError && options.onError(err);
    });

    return {
      tempPath: path,
      stream: transformStream,
      type: 'video/mp4',
      extension: 'mp4',
      processed: true,
      duration: durationSeconds
    };
  }
}
