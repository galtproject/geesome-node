import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {contentIds} from '../app/modules/content/publicationInput.js';
import {ImagePreviewDriver} from '../app/modules/drivers/preview/image.js';
import {ImageOptimizeDriver, encodePublicationImage, optimizationRequest} from '../app/modules/drivers/convert/imageOptimize.js';
import {createApp} from '../app/modules/staticSiteGenerator/site/public/index.js';
import {renderToString} from 'vue/server-renderer';
import {load} from 'cheerio';

async function bytes(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

describe('image optimization saving policy', function () {
    this.timeout(15000);
    it('normalizes new drivers and legacy flags to one profile and rejects conflicting instructions', () => {
        const driver = {name: 'imageOptimize', module: 'convert', params: {policy: 'publication-jpeg95-v1'}};
        assert.deepEqual(optimizationRequest(driver), optimizationRequest(null, 'publication-jpeg95-v1', true));
        assert.deepEqual(optimizationRequest(JSON.stringify(driver)), {policy: 'publication-jpeg95-v1', watermark: null});
        assert.equal(optimizationRequest(null), null);
        assert.throws(() => optimizationRequest(driver, 'publication-webp-v1'), /policy conflict/);
        assert.throws(() => optimizationRequest(driver, undefined, false), /driver conflict/);
        assert.throws(() => optimizationRequest({...driver, module: 'upload'}), /driver conflict/);
        assert.throws(() => optimizationRequest({...driver, params: {policy: 'unknown'}}), /policy invalid/);
    });

    it('creates a full-resolution WebP and smaller WebP preview from a PNG', async () => {
        const png = await sharp({create: {width: 1344, height: 1920, channels: 3, background: '#bc798f'}})
            .composite([{input: Buffer.from('<svg width="1344" height="1920"><path d="M1 1L1340 1910" stroke="black" stroke-width="4"/></svg>')}]).png().toBuffer();
        const source = Buffer.from(png);
        const converted = await new ImageOptimizeDriver().processByStream(Readable.from([png]));
        const full = await bytes(converted.stream);
        const meta = await sharp(full).metadata();
        assert.equal(converted.type, 'image/webp');
        assert.equal(converted.extension, 'webp');
        assert.equal(meta.width, 1344);
        assert.equal(meta.height, 1920);
        const preview = await new ImagePreviewDriver().processByStream(Readable.from([full]), {extension: 'png'});
        const previewBytes = await bytes(preview.stream);
        const previewMeta = await sharp(previewBytes).metadata();
        assert.equal(preview.type, 'image/webp');
        assert.equal(preview.extension, 'webp');
        assert.equal(previewMeta.width, 1024);
        assert.equal(previewMeta.height, 1463);
        assert.ok(previewBytes.length < png.length);
        assert.deepEqual(png, source, 'source bytes remain unchanged');
    });

    it('orients EXIF JPEG once, strips orientation and retains oriented dimensions', async () => {
        const jpeg = await sharp({create: {width: 90, height: 150, channels: 3, background: '#bb4433'}})
            .jpeg().withMetadata({orientation: 6}).toBuffer();
        const result = await encodePublicationImage(Readable.from([jpeg]));
        const metadata = await sharp(result.bytes).metadata();
        assert.deepEqual([metadata.width, metadata.height], [150, 90]);
        assert.equal(metadata.orientation, undefined);
    });

    it('keeps alpha and never enlarges small previews', async () => {
        const png = await sharp({create: {width: 40, height: 60, channels: 4, background: {r: 100, g: 25, b: 80, alpha: 0.3}}}).png().toBuffer();
        const full = await encodePublicationImage(Readable.from([png]), null, false, 'publication-webp-v1');
        assert.equal((await sharp(full.bytes).metadata()).hasAlpha, true);
        for (const size of ['small', 'medium', 'large']) {
            const preview = await new ImagePreviewDriver().processByStream(Readable.from([png]), {size});
            const metadata = await sharp(await bytes(preview.stream)).metadata();
            assert.deepEqual([metadata.width, metadata.height, metadata.hasAlpha], [40, 60, true]);
        }
    });

    it('rejects corrupt and animated sources and invalid ordered IDs', async () => {
        await assert.rejects(() => encodePublicationImage(Readable.from([Buffer.from('not an image')])));
        const gif = await sharp({create: {width: 10, height: 20, channels: 3, background: 'red', pageHeight: 10}}).gif().toBuffer();
        await assert.rejects(() => encodePublicationImage(Readable.from([gif])));
        for (const value of [[], [1, 1], [-1], ['1'], [1.5], Array.from({length: 1001}, (_, i) => i + 1)]) {
            assert.throws(() => contentIds(value));
        }
    });

    it('renders the real preview extension while originals keep their own extension', async () => {
        const {app} = await createApp({options: {}, contents: [{id: 1, type: 'image', name: 'mixed formats',
            storageId: 'original', previewStorageId: 'preview', extension: 'png', previewExtension: 'webp'}], path: '/content-list'}, '/content-list');
        const $ = load(await renderToString(app));
        assert.ok($('.content-item').attr('style').includes('1_preview.webp'));
        assert.equal($('.content-item img').attr('src'), './content/1_original.png');
    });
});
