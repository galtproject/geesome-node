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
const mediainfo = require('node-mediainfo');

describe.only("drivers", function () {
  this.timeout(60000);
  
  describe('convert video', () => {
    
    it("should convert video to stremable", async () => {
      const videoPath = __dirname + '/resources/not-streamable-input-video.mp4';

      let videoInfo = await mediainfo(videoPath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'No');

      const result = await drivers['convert']['video-to-streamable'].processByStream(fs.createReadStream(videoPath), {
        extension: 'mp4',
        onError() {
          assert.equal(false, true);
        }
      });

      const ouputStreamablePath = __dirname + '/resources/output-video.mp4';
      await new Promise(async (resolve, reject) => {
        const strm = fs.createWriteStream(ouputStreamablePath);
        result.stream.pipe(strm);

        strm.on('finish', resolve);
        strm.on('error', reject);
      });

      videoInfo = await mediainfo(ouputStreamablePath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'Yes');
    });
  });

  describe('preview video-thumbnail', () => {
    it.only("should get video screenshot correctly", async () => {
      await new Promise(async (resolve, reject) => {

        const videoPath = __dirname + '/resources/streamable-input-video.mp4';
        let videoInfo = await mediainfo(videoPath);
        assert.equal(videoInfo.media.track[0].IsStreamable, 'Yes');

        const result = await drivers['preview']['video-thumbnail'].processByStream(fs.createReadStream(videoPath), {
          extension: 'mp4',
          onError() {
            assert.equal(false, true);
          }
        });
        const strm = fs.createWriteStream(__dirname + '/resources/output-screenshot.png');
        result.stream.pipe(strm);

        strm.on('finish', resolve);
        strm.on('error', reject);
      });
    });
  });
})
;
