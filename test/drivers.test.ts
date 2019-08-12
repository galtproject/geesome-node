/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

const assert = require('assert');
const fs = require('fs');

const drivers = require('../components/drivers');

describe("drivers", function () {
  describe('preview video-thumbnail', () => {

    it.only("should get video screenshot correctly", () => {
      return new Promise(async (resolve, reject) => {
        const result = await drivers['preview']['video-thumbnail'].processByStream(fs.createReadStream(__dirname + '/resources/input-video.mp4'), {});
        const strm = fs.createWriteStream(__dirname + '/resources/output-screenshot.png');
        result.stream.pipe(strm);

        strm.on('finish', resolve);
        strm.on('error', reject);
      })
      
    });
  });
});
