import {DriverInput, OutputSize} from "../interface";

import {Stream} from "stream";
import AbstractDriver from "../abstractDriver";

const ffmpeg = require('fluent-ffmpeg');
const _ = require('lodash');
const stream = require('stream');

export class VideoThumbnail extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Small, OutputSize.Medium, OutputSize.Large];

  async processByStream(inputStream, options: any = {}) {

    const transformStream = new stream.Transform();
    transformStream._transform = function (chunk,encoding,done) {
      this.push(chunk);
      done();
    };
    
    ffmpeg(inputStream)
      .outputOptions(['-f image2', '-vframes 1', '-vcodec png', '-f rawvideo', '-ss 00:00:05'])//, '-s 320x240'
      .output(transformStream)
      .on('error', function (err, stdout, stderr) {
        console.log('An error occurred: ' + err.message, err, stderr);
        if(options.onError) {
          options.onError(err);
        }
      })
      .run();
    
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
