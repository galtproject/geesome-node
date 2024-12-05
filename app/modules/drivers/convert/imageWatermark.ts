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

    const {color, background, spacing, font, sizeRatio} = options;
    const biggestSide = metadata.width > metadata.height ? metadata.width : metadata.height;
    const size = Math.round(biggestSide * (sizeRatio || 1/50)); //size
    const padding = size / 2; //margin
    const textLen = options.text.length;
    const width = r(size * textLen * 0.7), height = size;

    const text = {
      text: `<span foreground="${color}">${options.text}</span>`,
      font: font || 'monospace',
      justify: true,
      align: 'left',
      rgba: true,
      spacing,
      height,
      width
    };
    const createBackground = {
      background,
      channels: 4,
      width: metadata.width,
      height: metadata.height + size * 2
    };
    const watermarkStream = sharp({create: createBackground})
        .composite([
          {input: path, left: 0, top: 0},
          {input: {text}, left: size, top: metadata.height + padding},
        ])
        .withMetadata()
        .toFormat(options.extension);

    const resultStream = inputStream.pipe(watermarkStream) as Stream;

    resultStream.on("error", (err) => {
      console.error('ImageWatermarkDriver resultStream error', err);
      options.onError && options.onError(err);
    });

    return {stream: resultStream};
  }
}

function r(number) {
  return Math.round(number);
}