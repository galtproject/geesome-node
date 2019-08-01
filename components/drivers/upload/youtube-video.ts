import {DriverInput, OutputSize} from "../interface";

import {Stream} from "stream";
import AbstractDriver from "../abstractDriver";

const youtubedl = require('@microlink/youtube-dl');

export class YoutubeVideoUploadDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Source];
  supportedOutputSizes = [OutputSize.Medium];

  async processBySource(url, options: any = {}) {
    const stream = youtubedl(url,
      // Optional arguments passed to youtube-dl.
      ['--format=18'],
      // Additional options can be given for calling `child_process.execFile()`.
      {cwd: __dirname});
    return {
      stream,
      type: 'video/mp4',
      extension: 'mp4'
    }
  }
}
