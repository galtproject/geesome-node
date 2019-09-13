/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
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
