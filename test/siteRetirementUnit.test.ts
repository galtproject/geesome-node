import assert from 'node:assert/strict';
import {collectRetiredBlocks} from '../app/modules/storageSpace/siteRetirement.js';

describe('resumed site retirement', () => {
    it('repins newly referenced candidates and skips global GC when none remain eligible', async () => {
        const cid = 'QmYWQu4zcgiBCR5ztA4PYwMyCYXLRuWngxuwnjJVH929mE';
        const pins = [];
        const row: any = {result: {cleanup: {retained: [], candidates: [{storageId: cid, unpinned: true}]}},
            update: async patch => Object.assign(row, structuredClone(patch))};
        const service = {app: {ms: {
            storage: {addPin: async id => pins.push(id), node: {repo: {
                stat: () => { throw Error('GC must be skipped'); },
                gc: () => { throw Error('GC must be skipped'); },
            }}},
            database: {getStorageObjectDeleteSafety: async () => ({blockers: [{key: 'new-reference'}]}),
                sequelize: {model: () => ({count: async () => 0})}},
        }}};
        await collectRetiredBlocks(service, [row], async () => {});
        assert.deepEqual(pins, [cid]);
        assert.equal(row.result.cleanup.candidates[0].unpinned, false);
        assert.equal(row.result.cleanup.candidates[0].retained, true);
        assert.equal(row.status, 'complete_with_retained');
        assert.equal(row.result.cleanup.gc, undefined);
    });
});
