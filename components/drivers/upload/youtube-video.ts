/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {DriverInput, OutputSize} from "../interface";

import {Stream} from "stream";
import AbstractDriver from "../abstractDriver";

const _ = require('lodash');

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

    const [videoInfo] = await new Promise((resolve, reject) => {
      youtubedl.getInfo([process.env.URL], function(err, info) {
        if (err) return reject(err);
        resolve(info);
      });
    });
    const bestFormat = _.orderBy(videoInfo.formats.filter(f => f.ext === 'mp4'), [(f) => f.filesize], ['desc'])[0];
    if(!bestFormat) {
      throw new Error('video_not_found');
    }
    let stream = youtubedl(url,
      // Optional arguments passed to youtube-dl.
      ['--format=' + bestFormat.format_id],
      // Additional options can be given for calling `child_process.execFile()`.
      {cwd: __dirname});
    
    return {
      stream,
      type: 'video/mp4',
      extension: 'mp4'
    }
  }
}
