import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {contentIds} from '../app/modules/content/publicationInput.js';
import {ImagePreviewDriver} from '../app/modules/drivers/preview/image.js';
import {ImageOptimizeDriver, encodePublicationImage, optimizationRequest} from '../app/modules/drivers/convert/imageOptimize.js';
import Gallery from '../app/modules/staticSiteGenerator/site/public/pages/ContentList/index.js';

async function bytes(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

describe('image optimization saving policy', function () {
    this.timeout(15000);
    it('reads profile and watermark only from the optimization driver', () => {
        const driver = {name: 'imageOptimize', module: 'convert', params: {policy: 'publication-jpeg95-v1'}};
        assert.deepEqual(optimizationRequest(driver), {policy: 'publication-jpeg95-v1', watermark: null});
        assert.deepEqual(optimizationRequest(JSON.stringify(driver)), optimizationRequest(driver));
        assert.equal(optimizationRequest(null), null);
        assert.throws(() => optimizationRequest({...driver, module: 'upload'}), /driver invalid/);
        assert.throws(() => optimizationRequest({...driver, params: {imagePolicy: 'publication-jpeg95-v1'}}), /driver invalid/);
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
        assert.equal(previewMeta.width, 717);
        assert.equal(previewMeta.height, 1024);
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

    it('loads WebP previews for visible cards while the viewer retains the original extension', async () => {
        const previous = {Image: globalThis.Image, window: globalThis.window, IntersectionObserver: globalThis.IntersectionObserver};
        const requested: string[] = [];
        let opened;
        const vm: any = {contents: [{type: 'image', storageId: 'original', previewStorageId: 'preview', extension: 'png', previewExtension: 'webp'}],
            previewRoot: './preview/', contentRoot: './content/', previewSources: {},
            $refs: {gallery: {querySelectorAll: () => [{dataset: {galleryIndex: '0'}}]}},
            $root: {$modal: {open: value => {opened = value;}}}};
        vm.originalUrl = (content, index) => Gallery.methods.originalUrl.call(vm, content, index);
        try {
            globalThis.Image = class {
                onload; onerror;
                set src(value) {requested.push(value); queueMicrotask(() => this.onload?.());}
                removeAttribute() {}
            } as any;
            globalThis.IntersectionObserver = class {
                constructor(private callback) {}
                observe(target) {this.callback([{target, isIntersecting: true}]);}
                disconnect() {}
            } as any;
            globalThis.window = {IntersectionObserver: globalThis.IntersectionObserver} as any;
            Gallery.mounted.call(vm);
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(vm.previewSources[0], './preview/1_preview.webp');
            assert.deepEqual(requested, ['./preview/1_preview.webp', './content/1_original.png']);
            Gallery.methods.openMedia.call(vm, 0);
            assert.deepEqual(opened.props.imageList, ['./content/1_original.png']);
        } finally {
            vm.stopLoading?.();
            for (const [key, value] of Object.entries(previous)) {
                if (value === undefined) {
                    delete globalThis[key];
                } else {
                    globalThis[key] = value;
                }
            }
        }
    });
});
