import {DriverInput, OutputSize} from "../interface";

import {Stream} from "stream";
import AbstractDriver from "../abstractDriver";

const sharp = require('sharp');
const _ = require('lodash');

export class ImagePreviewDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Small, OutputSize.Medium, OutputSize.Large];

  async processByStream(inputStream, options: any = {}) {
    const extension = options.extension || 'jpg';

    // TODO: get size by settings
    let size = {width: 400};
    if(options.size === 'small') {
      size = {width: 200};
    }
    if(options.size === 'large') {
      size = {width: 800};
    }
    const resizerStream = sharp()
        .resize(_.extend(size, {withoutEnlargement: true}))
        .toFormat(extension);

    return {
      stream: inputStream.pipe(resizerStream) as Stream,
      type: 'image/' + extension,
      extension: extension
    };
  }
}
