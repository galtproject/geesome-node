/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import _ from 'lodash';
import {DriverInput, OutputSize} from "../interface.js";
import AbstractDriver from "../abstractDriver.js";
import {getYoutubeInfo, streamYoutubeFormat} from "../youtubeDlp.js";
const {orderBy} = _;

export class YoutubeVideoUploadDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Source];
  supportedOutputSizes = [OutputSize.Medium];

  async processBySource(url, options: any = {}) {
    const videoInfo: any = await getYoutubeInfo(url);
    const bestFormat = orderBy(videoInfo.formats.filter(f => f.ext === 'mp4'), [(f) => f.filesize], ['desc'])[0];
    if(!bestFormat) {
      throw new Error('video_not_found');
    }
    let stream = streamYoutubeFormat(url, bestFormat.format_id);
    
    return {
      stream,
      type: 'video/mp4',
      extension: 'mp4'
    }
  }
}
