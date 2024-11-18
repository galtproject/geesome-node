/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

// process.env.FONTCONFIG_PATH = '';

import sharp from "sharp";
import {Stream} from "stream";
import {DriverInput, OutputSize} from "../interface.js";
import AbstractDriver from "../abstractDriver.js";
import helpers from "../helpers.js";

export class ImageWatermarkDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Small, OutputSize.Medium, OutputSize.Large];

  async processByStream(inputStream, options: any = {}) {
    console.log('ImagePreviewDriver.processByStream');
    const path = await helpers.writeStreamToRandomPath(inputStream, options.extension)
    const metadata = await sharp(path).metadata();
    console.log('metadata', metadata);

    const text = {
      text: `<span foreground="#ffff00">${options.text}</span>`,
      width: 100,
      height: 20,
      justify: true,
      align: 'left',
      spacing: 50,
      rgba: true
    };
    const watermarkStream = sharp(path)
        .composite([{
          input: { text },
          left: 30,
          top: metadata.height - 30
        }])
        .withMetadata()
        .toFormat(options.extension);
    console.log('ImagePreviewDriver.watermarkStream');

    const resultStream = inputStream.pipe(watermarkStream) as Stream;

    resultStream.on("error", (err) => {
      console.error('resultStream error', err);
      options.onError && options.onError(err);
    });

    return {stream: resultStream};
  }
}
