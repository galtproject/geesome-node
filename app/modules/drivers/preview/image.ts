/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import _ from 'lodash';
import sharp from "sharp";
import {Stream} from "stream";
import {DriverInput, OutputSize} from "../interface.js";
import AbstractDriver from "../abstractDriver.js";
const {extend} = _;

export class ImagePreviewDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Small, OutputSize.Medium, OutputSize.Large];

  async processByStream(inputStream, options: any = {}) {
    console.log('ImagePreviewDriver.processByStream');
    const extension = options.extension || 'jpg';

    // TODO: get size by settings
    let size = {width: 1024};
    if(options.size === 'small') {
      size = {width: 512};
    }
    if(options.size === 'large') {
      size = {width: 2048};
    }
    const resizerStream = sharp()
        .resize(extend(size, {withoutEnlargement: true}))
        .withMetadata()
        .toFormat(extension);

    const resultStream = inputStream.pipe(resizerStream) as Stream;

    resultStream.on("error", (err) => {
      console.error('resultStream error', err);
      options.onError && options.onError(err);
    });

    return {
      stream: resultStream,
      type: 'image/' + extension,
      extension: extension
    };
  }
}
