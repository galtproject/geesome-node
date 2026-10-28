/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import sharp from 'sharp';
import debug from 'debug';
import {Readable, Transform, Writable, Duplex} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {DriverInput, OutputSize} from '../interface.js';
import AbstractDriver from '../abstractDriver.js';
import {imagePreviewWork, ImagePreviewWork} from './imageWork.js';

const log = debug('geesome:app:drivers');

export const imagePreviewPolicy = {quality: 85, effort: 3, maxInputPixels: 40000000, maxInputBytes: 64 * 1024 * 1024, timeoutMs: 10000};
export function imagePreviewEdge(size: string) {
  return size === OutputSize.Small ? 512 : size === OutputSize.Large ? 2048 : 1024;
}

export class ImagePreviewDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];
  supportedOutputSizes = [OutputSize.Small, OutputSize.Medium, OutputSize.Large];

  constructor(private readonly work: ImagePreviewWork = imagePreviewWork, private readonly timeoutMs = imagePreviewPolicy.timeoutMs) {
    super();
  }

  async getSourceEdge(inputStream: Readable) {
    log('ImagePreviewDriver.metadata queued');
    return this.withSlot(inputStream, async () => {
      log('ImagePreviewDriver.metadata start');
      const bytes = await this.read(inputStream);
      const metadata = await sharp(bytes, {limitInputPixels: imagePreviewPolicy.maxInputPixels, failOn: 'error'}).metadata();
      if ((metadata.width || 0) * (metadata.height || 0) > imagePreviewPolicy.maxInputPixels) {
        throw new Error('image_preview_pixel_limit');
      }
      return Math.max(metadata.width || 0, metadata.height || 0);
    });
  }

  async processByStream(inputStream: Readable, options: any = {}) {
    log('ImagePreviewDriver.processByStream queued');
    return this.withSlot(inputStream, async () => {
      log('ImagePreviewDriver.encode start');
      const edge = imagePreviewEdge(options.size);
      const encoder = sharp({limitInputPixels: imagePreviewPolicy.maxInputPixels, failOn: 'error'})
        .rotate()
        .resize({width: edge, height: edge, fit: 'inside', withoutEnlargement: true})
        .webp({quality: imagePreviewPolicy.quality, effort: imagePreviewPolicy.effort})
        .timeout({seconds: Math.max(1, Math.ceil(this.timeoutMs / 1000))});
      const bytes = await this.read(inputStream, encoder);
      log('ImagePreviewDriver.encode finish');
      return {stream: Readable.from([bytes]), type: 'image/webp', extension: 'webp'};
    });
  }

  private async read(inputStream: Readable, encoder?: Duplex) {
    let size = 0;
    const bounded = new Transform({transform(chunk, _encoding, callback) {
      size += chunk.length;
      callback(size > imagePreviewPolicy.maxInputBytes ? new Error('image_preview_input_too_large') : null, chunk);
    }});
    const chunks: Buffer[] = [];
    const output = new Writable({write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      await pipeline(encoder ? [inputStream, bounded, encoder, output] : [inputStream, bounded, output], {signal: controller.signal});
    } finally {
      clearTimeout(timer);
    }
    return Buffer.concat(chunks);
  }

  private async withSlot<T>(inputStream: Readable, action: () => Promise<T>): Promise<T> {
    let inputError;
    const rememberError = error => {inputError = error;};
    inputStream.on('error', rememberError);
    try {
      return await this.work.run(async () => {
        if (inputError) {
          throw inputError;
        }
        return action();
      });
    } finally {
      // Queued rejections never reach pipeline, so release their inputs too.
      // A filesystem open can still fail after a queued job was rejected.
      // Keep its error listener until close, including this late failure.
      inputStream.once('close', () => inputStream.off('error', rememberError));
      inputStream.destroy();
      if (inputStream.closed) {
        inputStream.off('error', rememberError);
      }
    }
  }
}
