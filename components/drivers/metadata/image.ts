/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {DriverInput, OutputSize} from "../interface";

import AbstractDriver from "../abstractDriver";

const sharp = require('sharp');
const _ = require('lodash');

export class ImageMetadataDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];

  async processByStream(inputStream, options: any = {}) {
    const buffer = await new Promise((resolve, reject) => {
      const bufs = [];
      inputStream.on('data', function(d){ bufs.push(d); });
      inputStream.on('end', function(){
        resolve(Buffer.concat(bufs));
      });
    });

    const metadata = await sharp(buffer).metadata();

    return _.pick(metadata, ['format', 'width', 'height', 'space', 'channels', 'depth', 'density', 'chromaSubsampling', 'isProgressive', 'hasProfile', 'hasAlpha', 'orientation']);
  }
}
