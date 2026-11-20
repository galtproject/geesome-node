import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareImageBundle, validateImageBundle, imageBytesHash} from '../app/modules/content/preparedImage.js';

describe('prepared publication image validation', function () {
    this.timeout(30000);
    const source = {id: 1, storageId: 'bafkreifakestorageidentity123456789', propertiesJson: '{}'};
    let bundle;
    before(async () => {
        const bytes = await sharp({create: {width: 351, height: 731, channels: 3, background: '#538aca'}}).png().toBuffer();
        bundle = await prepareImageBundle(bytes, source);
    });
    it('uses server JPEG and WebP policies and validates every slot', async () => {
        await validateImageBundle(bundle.manifest, bundle.files);
        const main = await sharp(bundle.files.file).metadata();
        assert.equal(main.format, 'jpeg');
        assert.equal(main.chromaSubsampling, '4:4:4');
        assert.deepEqual(bundle.files.medium, bundle.files.large);
    });
    it('rejects corrupted bytes and hashes before persistence', async () => {
        await assert.rejects(validateImageBundle(bundle.manifest, {...bundle.files, small: Buffer.from('corrupt')}), /hash mismatch/);
        const files = {...bundle.files, small: Buffer.from('corrupt')};
        const manifest = {...bundle.manifest, files: {...bundle.manifest.files, small: imageBytesHash(files.small)}};
        await assert.rejects(validateImageBundle(manifest, files), /decode failed/);
    });
    it('rejects missing slots, non-JPEG originals, and wrong preview dimensions', async () => {
        const {large, ...missing} = bundle.files;
        await assert.rejects(validateImageBundle(bundle.manifest, missing), /manifest invalid/);
        for (const [slot, bytes] of [['file', await sharp(bundle.files.file).png().toBuffer()],
            ['small', await sharp(bundle.files.small).resize(20, 20).webp().toBuffer()]] as const) {
            const files = {...bundle.files, [slot]: bytes};
            const manifest = {...bundle.manifest, files: {...bundle.manifest.files, [slot]: imageBytesHash(bytes)}};
            await assert.rejects(validateImageBundle(manifest, files), /format invalid|dimensions invalid/);
        }
    });
    it('validates dimensions for tiny and rotated source images without upscaling', async () => {
        for (const [width, height] of [[1, 31], [1031, 719], [2001, 3061]]) {
            const bytes = await sharp({create: {width, height, channels: 3, background: 'blue'}}).jpeg().withMetadata({orientation: 6}).toBuffer();
            const tiny = await prepareImageBundle(bytes, source);
            await validateImageBundle(tiny.manifest, tiny.files);
        }
    });
    it('accepts the native inside resize rounding produced for odd JPEG dimensions', async () => {
        for (const [width, height] of [[1640, 2662], [2662, 1640]]) {
            const bytes = await sharp({create: {width, height, channels: 3, background: 'blue'}}).png().toBuffer();
            const prepared = await prepareImageBundle(bytes, source);
            await validateImageBundle(prepared.manifest, prepared.files);
            const small = await sharp(prepared.files.small).metadata();
            assert.equal(Math.max(small.width, small.height), 512);
            assert.ok([315, 316].includes(Math.min(small.width, small.height)));
            for (const [w, h] of [[314, 512], [317, 512], [316, 513]]) {
                const bad = await sharp(prepared.files.small).resize(w, h, {fit: 'fill'}).webp().toBuffer();
                const files = {...prepared.files, small: bad};
                const manifest = {...prepared.manifest, files: {...prepared.manifest.files, small: imageBytesHash(bad)}};
                await assert.rejects(validateImageBundle(manifest, files), /dimensions invalid/);
            }
        }
    });
    it('keeps integer aspect ratios and non-upscaled dimensions strict', async () => {
        for (const [width, height] of [[1024, 512], [31, 1]]) {
            const bytes = await sharp({create: {width, height, channels: 3, background: 'red'}}).png().toBuffer();
            const prepared = await prepareImageBundle(bytes, source);
            await validateImageBundle(prepared.manifest, prepared.files);
            const m = await sharp(prepared.files.small).metadata();
            const bad = await sharp(prepared.files.small).resize(m.width, m.height + 1, {fit: 'fill'}).webp().toBuffer();
            const files = {...prepared.files, small: bad};
            const manifest = {...prepared.manifest, files: {...prepared.manifest.files, small: imageBytesHash(bad)}};
            await assert.rejects(validateImageBundle(manifest, files), /dimensions invalid/);
        }
    });
});
