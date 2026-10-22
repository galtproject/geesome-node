import assert from 'node:assert/strict';
import {assertStorageWritable, countStorageHolds} from '../app/modules/asyncOperation/storageHolds.js';
import {variants} from '../app/storageIdentity.js';

const cid = 'QmYWQu4zcgiBCR5ztA4PYwMyCYXLRuWngxuwnjJVH929mE';
function fixture(rows) {
    return {ms: {database: {sequelize: {model: () => ({findAll: async () => rows})}}}};
}
function job(id, input, result = null) {
    return {id, module: 'site-replacement', inputJson: JSON.stringify({input, result})};
}

describe('storage holds derived from existing jobs', () => {
    it('allows ordinary content writes when the queue module is not configured', async () => {
        const app = {ms: {database: {sequelize: {models: {}}}}};
        await assertStorageWritable(app, {storageId: cid});
        assert.equal(await countStorageHolds(app, cid), 0);
    });

    it('retains sources, previews and previous site/archive across competing jobs and CID encodings', async () => {
        for (const input of [
            {sources: [{storageId: cid}]}, {sources: [{mediumPreviewStorageId: cid}]},
            {sources: [], previous: {storageId: cid}}, {sources: [], previous: {archiveStorageId: cid}},
        ]) {
            const app = fixture([job(1, input), job(2, input)]);
            assert.equal(await countStorageHolds(app, variants(cid)[1]), 2);
            assert.equal(await countStorageHolds(app, cid, 1), 1);
        }
        assert.equal(await countStorageHolds(fixture([{module: 'content-resave',
            inputJson: JSON.stringify({source: {storageId: cid}})}]), cid), 1);
    });

    it('releases only detached workflow holds and fails closed for unknown or overflowing work', async () => {
        const detached = job(1, {sources: [{storageId: cid}]}, {cleanup: {holdsReleased: true}});
        assert.equal(await countStorageHolds(fixture([detached]), cid), 0);
        assert.equal(await countStorageHolds(fixture([{module: 'site-replacement', inputJson: '{'}]), cid), 1001);
        const app = fixture(Array.from({length: 1001}, () => detached));
        assert.equal(await countStorageHolds(app, cid), 1001);
        await assert.rejects(() => assertStorageWritable(app, {storageId: cid}), {code: 'storage_maintenance_busy'});
    });

    it('blocks a pending cleanup CID temporarily while allowing remote identities and new writes afterwards', async () => {
        const rows = [job(1, {sources: []}, {cleanup: {candidates: [{storageId: cid}]}})];
        const app = fixture(rows);
        await assert.rejects(() => assertStorageWritable(app, {storageId: variants(cid)[1]}), {code: 'storage_cleanup_in_progress'});
        await assertStorageWritable(app, {storageId: 'https://example.com/image.png'});
        rows.length = 0;
        await assertStorageWritable(app, {storageId: cid});
    });
});
