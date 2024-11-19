/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import fs from "fs";
import assert from "assert";
import mediainfo from 'node-mediainfo';
import driversModule from '../app/modules/drivers/index.js';
import resourcesHelper from './helpers/resources.js';
import appHelpers from '../app/helpers.js';

describe("drivers", function () {
  const drivers = driversModule();
  this.timeout(100000);

  describe('image', () => {
    it("should successfully get preview of jpg image", async () => {
      const imagePath = await resourcesHelper.prepare('input-image.jpg');

      const result = await drivers['preview']['image'].processByStream(fs.createReadStream(imagePath));

      const ouputStreamablePath = resourcesHelper.getOutputDir() + '/output-image.jpg';
      await new Promise(async (resolve, reject) => {
        const strm = fs.createWriteStream(ouputStreamablePath);
        result.stream.pipe(strm);

        strm.on('finish', resolve);
        strm.on('error', reject);
      });

      assert.equal(fs.existsSync(ouputStreamablePath), true);
    });

    it("should successfully get metadata of jpg image", async () => {
      const imagePath = await resourcesHelper.prepare('input-image.jpg');

      const result = await drivers['metadata']['image'].processByStream(fs.createReadStream(imagePath));
      console.log('result', result);

      assert.equal(result.width > 0, true);
    });

    it("should successfully put watermark to jpg image", async () => {
      const imagePath = await resourcesHelper.prepare('input-image.jpg');

      const result = await drivers['convert']['imageWatermark'].processByStream(fs.createReadStream(imagePath), {
        text: 'test.com',
        color: 'black',
        background: '#ffffff80',
        font: 'monospace',
        spacing: 50,
        sizeRatio: 1/50,
        extension: 'jpg'
      });
      // console.log('result', result);

      const ouputStreamablePath = resourcesHelper.getOutputDir() + '/output-image.jpg';
      await new Promise(async (resolve, reject) => {
        const strm = fs.createWriteStream(ouputStreamablePath);
        result.stream.pipe(strm);

        strm.on('finish', resolve);
        strm.on('error', reject);
      });

      assert.equal(fs.existsSync(ouputStreamablePath), true);
    });
  });

  describe.skip('youtube video', () => {

    it("should successfully getting video from youtube", async () => {
      const ouputStreamablePath = resourcesHelper.getOutputDir() + '/output-youtube-video.mp4';

      async function downloadVideo() {
        const result = await drivers['upload']['youtubeVideo'].processBySource('https://www.youtube.com/watch?v=DXUAyRRkI6k');

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
      const videoPath = await resourcesHelper.prepare('not-streamable-input-video.mp4');

      let videoInfo = await mediainfo(videoPath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'No');

      const result = await drivers['convert']['videoToStreamable'].processByStream(fs.createReadStream(videoPath), {
        extension: 'mp4',
        onError() {
          assert.equal(false, true);
        }
      });

      assert.equal(result.processed, true);

      const ouputStreamablePath = resourcesHelper.getOutputDir() + '/output-video.mp4';
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

    it.skip("should convert mov video to streamable", async () => {
      const videoPath = await resourcesHelper.prepare('input-video.mov');

      let videoInfo = await mediainfo(videoPath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'No');

      const result = await drivers['convert']['videoToStreamable'].processByStream(fs.createReadStream(videoPath), {
        extension: 'mov',
        onError() {
          assert.equal(false, true);
        }
      });

      assert.equal(result.processed, true);

      const ouputStreamablePath = resourcesHelper.getOutputDir() + '/output-video.mp4';
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
      const videoPath = await resourcesHelper.prepare('streamable-input-video.mp4');

      let videoInfo = await mediainfo(videoPath);
      assert.equal(videoInfo.media.track[0].IsStreamable, 'Yes');

      const result = await drivers['convert']['videoToStreamable'].processByStream(fs.createReadStream(videoPath), {
        extension: 'mp4',
        onError() {
          assert.equal(false, true);
        }
      });

      assert.equal(result.processed, false);

      const ouputStreamablePath = resourcesHelper.getOutputDir() + '/output-video.mp4';
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

        const videoPath = await resourcesHelper.prepare('streamable-input-video.mp4');
        let videoInfo = await mediainfo(videoPath);
        assert.equal(videoInfo.media.track[0].IsStreamable, 'Yes');

        const result = await drivers['preview']['videoThumbnail'].processByStream(fs.createReadStream(videoPath), {
          extension: 'mp4',
          onError() {
            assert.equal(false, true);
          }
        });

        const strm = fs.createWriteStream(resourcesHelper.getOutputDir() + '/output-screenshot.png');
        result.stream.pipe(strm);

        strm.on('finish', resolve);
        strm.on('error', reject);
      });
    });

    it("should get video screenshot correctly with path", async () => {
      await new Promise(async (resolve, reject) => {

        const videoPath = await resourcesHelper.prepare('streamable-input-video.mp4');
        const result = await drivers['preview']['videoThumbnail'].processByStream(fs.createReadStream(videoPath), {
          extension: 'mp4',
          onError() {
            assert.equal(false, true);
          }
        });

        const strm = fs.createWriteStream(resourcesHelper.getOutputDir() + '/output-screenshot.png');
        result.stream.pipe(strm);

        strm.on('finish', resolve);
        strm.on('error', reject);
      });
    });
  });

  describe('preview gif-thumbnail', () => {
    //TODO: make the source to download gif for test
    it.skip("should get gif screenshot correctly", async () => {
      await new Promise(async (resolve, reject) => {
        const gifPath = await resourcesHelper.prepare('test-gif.gif');
        const result = await drivers['preview']['gif'].processByPath(gifPath, {
          extension: 'png',
          onError() {
            assert.equal(false, true);
          }
        });

        const strm = fs.createWriteStream(resourcesHelper.getOutputDir() + '/output-gif-screenshot.png');
        result.stream.pipe(strm);

        strm.on('finish', () => result.emitFinish(resolve));
        strm.on('error', reject);
      });
    });
  });

  describe('upload archive', () => {
    it("should upload and extract archive", async () => {
      await new Promise(async (resolve, reject) => {

        const archivePath = await resourcesHelper.prepare('test-archive.zip');
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
          resolve(true);
        });
      });
    });
  });
});
