/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const assert = require('assert');
const fs = require('fs');

const drivers = require('../components/drivers');
const mediainfo = require('node-mediainfo');

describe("drivers", function () {
  this.timeout(100000);

  describe('youtube video', () => {

    it("should successfully getting video from youtube", async () => {
      const ouputStreamablePath = __dirname + '/resources/output-youtube-video.mp4';
      
      async function downloadVideo() {
        const result = await drivers['upload']['youtube-video'].processBySource('https://www.youtube.com/watch?v=DXUAyRRkI6k');

        await new Promise(async (resolve, reject) => {
          const strm = fs.createWriteStream(ouputStreamablePath);
          result.stream.pipe(strm);

          strm.on('finish', resolve);
          strm.on('error', reject);
        });
      }
      
      try {
        await downloadVideo();
      } catch (e) {
        console.warn('error', e.message, 'try again...');
        //try again
        await downloadVideo();
      }

      let videoInfo = await mediainfo(ouputStreamablePath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'Yes');
    });
  });
  
  describe('convert video', () => {
    it("should convert video to streamable", async () => {
      const videoPath = __dirname + '/resources/not-streamable-input-video.mp4';

      let videoInfo = await mediainfo(videoPath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'No');

      const result = await drivers['convert']['video-to-streamable'].processByStream(fs.createReadStream(videoPath), {
        extension: 'mp4',
        onError() {
          assert.equal(false, true);
        }
      });

      assert.equal(result.processed, true);

      const ouputStreamablePath = __dirname + '/resources/output-video.mp4';
      await new Promise(async (resolve, reject) => {
        const strm = fs.createWriteStream(ouputStreamablePath);
        result.stream.pipe(strm);

        strm.on('finish', resolve);
        strm.on('error', reject);
      });

      videoInfo = await mediainfo(ouputStreamablePath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'Yes');

      console.log('result.tempPath', result.tempPath);
      assert.equal(fs.existsSync(result.tempPath), false);
    });

    it("should convert mov video to streamable", async () => {
      const videoPath = __dirname + '/resources/input-video.mov';

      let videoInfo = await mediainfo(videoPath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'No');

      const result = await drivers['convert']['video-to-streamable'].processByStream(fs.createReadStream(videoPath), {
        extension: 'mov',
        onError() {
          assert.equal(false, true);
        }
      });

      assert.equal(result.processed, true);

      const ouputStreamablePath = __dirname + '/resources/output-video.mp4';
      await new Promise(async (resolve, reject) => {
        const strm = fs.createWriteStream(ouputStreamablePath);
        result.stream.pipe(strm);

        // result.stream.on('data', (src) => {
        //   console.log('Something is piping into the result.', src.length);
        //   // assert.equal(src);
        // });

        strm.on('finish', resolve);
        strm.on('error', reject);
      });

      videoInfo = await mediainfo(ouputStreamablePath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'Yes');

      console.log('result.tempPath', result.tempPath);
      assert.equal(fs.existsSync(result.tempPath), false);
    });

    it("should not process already streamable video", async () => {
      const videoPath = __dirname + '/resources/streamable-input-video.mp4';

      let videoInfo = await mediainfo(videoPath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'Yes');

      const result = await drivers['convert']['video-to-streamable'].processByStream(fs.createReadStream(videoPath), {
        extension: 'mp4',
        onError() {
          assert.equal(false, true);
        }
      });

      assert.equal(result.processed, false);

      const ouputStreamablePath = __dirname + '/resources/output-video.mp4';
      await new Promise(async (resolve, reject) => {
        const strm = fs.createWriteStream(ouputStreamablePath);
        result.stream.pipe(strm);

        strm.on('finish', resolve);
        strm.on('error', reject);
      });

      videoInfo = await mediainfo(ouputStreamablePath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'Yes');

      console.log('result.tempPath', result.tempPath);
      assert.equal(fs.existsSync(result.tempPath), false);
    });
  });

  describe('preview video-thumbnail', () => {
    it("should get video screenshot correctly", async () => {
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

  describe('upload archive', () => {
    it("should upload and extract archive", async () => {
      await new Promise(async (resolve, reject) => {

        const archivePath = __dirname + '/resources/test-archive.zip';
        const result = await drivers['upload']['archive'].processByStream(fs.createReadStream(archivePath), {
          onError() {
            assert.equal(false, true);
            reject();
          }
        });

        const testTxt = fs.readFileSync(result.tempPath + '/test.txt', 'utf8');
        assert.equal(testTxt, 'Test\n');

        const test2Txt = fs.readFileSync(result.tempPath + '/test2.txt', 'utf8');
        assert.equal(test2Txt, 'Test2\n');

        result.emitFinish(() => {
          assert.equal(fs.existsSync(result.tempPath), false);
          resolve();
        });
      });
    });
  });
})
;
