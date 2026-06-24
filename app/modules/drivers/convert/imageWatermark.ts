/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

// process.env.FONTCONFIG_PATH = '';

import debug from 'debug';
import fs from "fs";
import sharp from "sharp";
import {Stream} from "stream";
import {DriverInput, OutputSize} from "../interface.js";
import AbstractDriver from "../abstractDriver.js";
import helpers from "../helpers.js";
const log = debug('geesome:app:drivers');

export class ImageWatermarkDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Small, OutputSize.Medium, OutputSize.Large];

  async processByStream(inputStream, options: any = {}) {
    log('ImagePreviewDriver.processByStream');
    const outputExtension = normalizeImageExtension(options.extension || 'jpg');
    const path = await helpers.writeStreamToRandomPath(inputStream, options.inputExtension || options.extension || 'image')
    const metadata = await sharp(path).metadata();

    const {color, background, spacing, font, sizeRatio} = options;
    const biggestSide = metadata.width > metadata.height ? metadata.width : metadata.height;
    const size = Math.round(biggestSide * (sizeRatio || 1 / 50)); //size
    const padding = Math.round(size / 2);
    const textLen = options.text.length;
    const width = Math.round(size * textLen * 0.7), height = size;

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
      .toFormat(outputExtension);

    const resultStream = watermarkStream as Stream;
    const cleanup = once(() => fs.rm(path, {force: true}, () => {}));

    resultStream.on("error", (err) => {
      cleanup();
      if (isStreamAbortError(err)) {
        return;
      }
      console.error('ImageWatermarkDriver resultStream error', err);
      options.onError && options.onError(err);
    });
    resultStream.on("end", cleanup);
    resultStream.on("close", cleanup);

    return {
      stream: resultStream,
      type: getImageMimeType(outputExtension),
      extension: outputExtension
    };
  }
}

function normalizeImageExtension(extension) {
  if (extension === 'jpeg') {
    return 'jpg';
  }
  return extension;
}

function getImageMimeType(extension) {
  if (extension === 'jpg') {
    return 'image/jpeg';
  }
  return 'image/' + extension;
}

function once(callback) {
  let called = false;
  return () => {
    if (called) {
      return;
    }
    called = true;
    callback();
  };
}

function isStreamAbortError(error) {
  return error?.code === 'ABORT_ERR';
}
