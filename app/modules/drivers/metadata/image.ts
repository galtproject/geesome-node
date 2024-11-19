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
import AbstractDriver from "../abstractDriver.js";
import {DriverInput} from "../interface.js";
import {Stream} from "stream";
const {pick} = _;

export class ImageMetadataDriver extends AbstractDriver {
  supportedInputs = [DriverInput.Stream];

  async processByStream(inputStream, options: any = {}) {
    const image = inputStream.pipe(sharp());
    const metadata = await image.metadata();
    return pick(metadata, ['format', 'width', 'height', 'space', 'channels', 'depth', 'density', 'chromaSubsampling', 'isProgressive', 'hasProfile', 'hasAlpha', 'orientation']);
  }
}
