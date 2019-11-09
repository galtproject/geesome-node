/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {DriverInput, OutputSize} from "../interface";

import {Stream} from "stream";
import AbstractDriver from "../abstractDriver";

let youtubedl;
try {
  youtubedl = require('@microlink/youtube-dl');
} catch (e) {
  console.warn('Failed youtubedl init', e)
}

export class YoutubeVideoUploadDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Source];
  supportedOutputSizes = [OutputSize.Medium];

  async processBySource(url, options: any = {}) {
    
    let stream = youtubedl(url,
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
