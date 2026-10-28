import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createReadStream} from 'node:fs';
import {randomUUID} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {ImagePreviewDriver, imagePreviewPolicy} from '../app/modules/drivers/preview/image.js';
import {ImagePreviewWork} from '../app/modules/drivers/preview/imageWork.js';
import {ImageMetadataDriver} from '../app/modules/drivers/metadata/image.js';
import contentModule from '../app/modules/content/index.js';

async function collect(stream) {
  const parts = [];
  for await (const chunk of stream) {
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts);
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const picture = (width, height) => sharp({create: {width, height, channels: 4, background: {r: 120, g: 30, b: 80, alpha: 0.4}}}).png().toBuffer();

describe('bounded image previews', function () {
  this.timeout(15000);
  it('fits portraits and landscapes in square bounds without modifying source or alpha', async () => {
    const driver = new ImagePreviewDriver();
    for (const [width, height] of [[600, 1200], [1200, 600], [40, 60]]) {
      const source = await picture(width, height), before = Buffer.from(source);
      const {stream} = await driver.processByStream(Readable.from([source]), {size: 'small'});
      const result = await collect(stream), metadata = await sharp(result).metadata();
      assert(Math.max(metadata.width, metadata.height) <= 512);
      assert.equal(metadata.hasAlpha, true);
      assert.equal(metadata.width / metadata.height, width / height);
      assert.deepEqual(source, before);
      const expected = await sharp(source).rotate().resize({width: 512, height: 512, fit: 'inside', withoutEnlargement: true})
        .webp({quality: 85, effort: 3}).toBuffer();
      assert.deepEqual(result, expected);
    }
  });
  it('auto-orients previews before fitting', async () => {
    const input = await sharp({create: {width: 60, height: 120, channels: 3, background: 'red'}}).jpeg().withMetadata({orientation: 6}).toBuffer();
    const result = await new ImagePreviewDriver().processByStream(Readable.from([input]));
    const metadata = await sharp(await collect(result.stream)).metadata();
    assert.deepEqual([metadata.width, metadata.height, metadata.orientation], [120, 60, undefined]);
  });
  it('bounds parallel work, rejects excess producers and recovers after failures', async () => {
    const queue = new ImagePreviewWork(1, 1, 1000);
    let release!: () => void, running = 0, peak = 0;
    const first = queue.run(async () => {running++; peak = Math.max(peak, running); await new Promise<void>(done => {release = done;}); running--;});
    const second = queue.run(async () => {running++; peak = Math.max(peak, running); running--; throw Error('encode failed');});
    const rejectedSecond = assert.rejects(second, /encode failed/);
    await assert.rejects(queue.run(async () => null), /image_preview_busy/);
    release();
    await first; await rejectedSecond;
    assert.equal(peak, 1);
    assert.equal(await queue.run(async () => 'recovered'), 'recovered');
  });
  it('handles a late filesystem error after rejecting a full queue', async () => {
    const queue = new ImagePreviewWork(1, 0);
    let release!: () => void;
    const busy = queue.run(async () => new Promise<void>(done => {release = done;}));
    const source = createReadStream(path.join(os.tmpdir(), `absent-preview-${randomUUID()}`));
    await assert.rejects(new ImagePreviewDriver(queue).processByStream(source), /image_preview_busy/);
    await new Promise(resolve => source.closed ? resolve(null) : source.once('close', resolve));
    assert(source.destroyed);
    release(); await busy;
  });
  it('expires queued work without running it or leaking capacity', async () => {
    const queue = new ImagePreviewWork(1, 1, 15);
    let release!: () => void, ran = false;
    const first = queue.run(async () => new Promise<void>(done => {release = done;}));
    await assert.rejects(queue.run(async () => {ran = true;}), /image_preview_queue_timeout/);
    release(); await first;
    assert.equal(ran, false);
    assert.equal(await queue.run(async () => 'ok'), 'ok');
  });
  it('destroys stalled and corrupt sources and releases the encode slot', async () => {
    const queue = new ImagePreviewWork(1, 0);
    const driver = new ImagePreviewDriver(queue, 30);
    const stalled = new Readable({read() {}});
    await assert.rejects(driver.processByStream(stalled), error => error.name === 'AbortError');
    assert.equal(stalled.destroyed, true);
    const bad = Readable.from([Buffer.from('corrupt')]);
    await assert.rejects(driver.processByStream(bad));
    assert.equal(bad.destroyed, true);
    const good = await driver.processByStream(Readable.from([await picture(10, 10)]));
    assert((await collect(good.stream)).length > 0);
  });
  it('bounds metadata reads as well as encodes and destroys a source that fails while queued', async () => {
    const queue = new ImagePreviewWork(1, 1, 1000);
    const driver = new ImagePreviewDriver(queue, 30);
    const stalled = new Readable({read() {}});
    await assert.rejects(driver.getSourceEdge(stalled), error => error.name === 'AbortError');
    assert(stalled.destroyed);
    let release!: () => void;
    const busy = queue.run(async () => new Promise<void>(done => {release = done;}));
    const source = new Readable({read() {}});
    const pending = driver.processByStream(source);
    const rejected = assert.rejects(pending, /source disconnected/);
    source.destroy(new Error('source disconnected'));
    await tick(); release();
    await busy; await rejected;
    assert(source.destroyed);
    assert.equal(await queue.run(async () => 'ok'), 'ok');
  });
  it('rejects oversized source bytes while reading instead of buffering beyond the cap', async () => {
    const chunk = Buffer.alloc(1024 * 1024);
    const source = Readable.from((async function* () {
      for (let i = 0; i < 65; i++) {
        yield chunk;
      }
    })());
    await assert.rejects(new ImagePreviewDriver().getSourceEdge(source), /image_preview_input_too_large/);
    assert(source.destroyed);
  });
  it('rejects oversized pixel dimensions before encoding', async () => {
    const source = Buffer.from('<svg width="10000" height="10000"><rect width="10000" height="10000" fill="red"/></svg>');
    await assert.rejects(new ImagePreviewDriver().processByStream(Readable.from([source])), /pixel limit/i);
    assert.equal(imagePreviewPolicy.maxInputPixels, 40000000);
  });
});

describe('content preview rendition reuse', function () {
  this.timeout(15000);
  async function fixture(width: number, height: number) {
    const source = await picture(width, height), sizes: string[] = [];
    const app: any = {checkModules() {}, ms: {api: new Proxy({}, {get: () => () => {}}),
      storage: {getFileStream: async () => Readable.from([source])},
      drivers: {preview: {image: new ImagePreviewDriver()}, metadata: {image: new ImageMetadataDriver()}}}};
    const content: any = await contentModule(app);
    content.getContentPreviewStorageFile = async (_file, driver, options) => {
      sizes.push(options.size);
      const {stream} = await driver.processByStream(Readable.from([source]), options);
      const bytes = await collect(stream);
      return {storageFile: {id: 'rendition-' + sizes.length, size: bytes.length}, type: 'image/webp', extension: 'webp'};
    };
    return {content, sizes};
  }
  it('encodes a 512-pixel source once and reuses all three references', async () => {
    const {content, sizes} = await fixture(512, 512);
    const result = await content.getPreview({id: 'source', size: 100}, 'png', 'image/png');
    assert.equal(sizes.length, 1);
    assert.equal(result.smallPreviewStorageId, result.mediumPreviewStorageId);
    assert.equal(result.largePreviewStorageId, result.mediumPreviewStorageId);
  });
  it('encodes only two distinct dimensions for a 700-pixel source', async () => {
    const {content, sizes} = await fixture(350, 700);
    const result = await content.getPreview({id: 'source', size: 100}, 'png', 'image/png');
    assert.deepEqual(sizes, ['medium', 'small']);
    assert.equal(result.largePreviewStorageId, result.mediumPreviewStorageId);
    assert.notEqual(result.smallPreviewStorageId, result.mediumPreviewStorageId);
  });
  it('reuses existing stored previews on repeated saves without encoding them again', async () => {
    const {content} = await fixture(40, 60);
    content.getPreview = async () => {throw Error('must not encode stored previews');};
    const stored = {mediumPreviewStorageId: 'existing-preview-cid', previewMimeType: 'image/webp', view: 'contents'};
    await content.updateExistsContentMetadata(1, stored, {});
    assert.equal(stored.mediumPreviewStorageId, 'existing-preview-cid');
  });
  it('does not retain a failed or previous-set rendition in process memory', async () => {
    const {content, sizes} = await fixture(40, 60);
    const render = content.getContentPreviewStorageFile;
    let fail = true;
    content.getContentPreviewStorageFile = async (...args) => {
      if (fail) {
        fail = false;
        throw Error('transient storage failure');
      }
      return render(...args);
    };
    const original = console.error;
    try {
      console.error = () => {};
      assert.deepEqual(await content.getPreview({id: 'source', size: 100}, 'png', 'image/png'), {});
    } finally {
      console.error = original;
    }
    assert((await content.getPreview({id: 'source', size: 100}, 'png', 'image/png')).mediumPreviewStorageId);
    assert.equal(sizes.length, 1);
  });
});
