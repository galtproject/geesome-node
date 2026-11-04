import assert from 'node:assert/strict';
import {Op} from 'sequelize';
import {CID} from 'multiformats/cid';
import {sha256} from 'multiformats/hashes/sha2';
import {storageJobs, countStorageHolds, withStorageJobSnapshot, releaseStorageJobHolds} from '../app/modules/asyncOperation/storageHolds.js';

const cid = 'QmYWQu4zcgiBCR5ztA4PYwMyCYXLRuWngxuwnjJVH929mE';
let root: string;
const terminal = (retention: any, input: any = {sources: []}, holdsReleased: any = false) => ({
    id: 1, module: 'site-replacement', isWaiting: false,
    inputJson: JSON.stringify({input}),
    asyncOperation: {output: JSON.stringify({status: 'complete_with_retained', result: {
        externalLinksRetention: retention, cleanup: {holdsReleased}}})},
});
const retained = (changes: any = {}) => ({reason: 'external_links_pending', previousPageStorageId: root,
    previousArchiveStorageId: null, sources: [], ...changes});
function fixture(rows) {
    let lastQuery: any;
    const app = {ms: {database: {sequelize: {model: () => ({
        count: async () => 0,
        findAll: async options => {
            lastQuery = options;
            const clauses = options.where[Op.or];
            assert.deepEqual(clauses[0], {isWaiting: true});
            assert.equal(clauses[1].module, 'site-replacement');
            assert.equal(clauses[1]['$asyncOperation.output$'][Op.like], '%"externalLinksRetention"%');
            return rows.filter(row => row.isWaiting === true || row.module === 'site-replacement'
                && row.asyncOperation?.output?.includes('"externalLinksRetention"')).slice(0, options.limit);
        },
    })}}}};
    return {app, query: () => lastQuery};
}

describe('terminal external-gallery storage holds', () => {
    before(async () => {root = CID.createV1(0x70, await sha256.digest(new TextEncoder().encode('retained-root'))).toString();});

    it('reads terminal retained receipts together with active work in one bounded query', async () => {
        const held = terminal(retained());
        const waiting = {id: 2, isWaiting: true, module: 'content-resave', inputJson: JSON.stringify({source: {storageId: cid}})};
        const irrelevant = {id: 3, isWaiting: false, module: 'content-resave', inputJson: '{}'};
        const f = fixture([held, waiting, irrelevant]);
        assert.deepEqual(await storageJobs(f.app), [held, waiting]);
        assert.equal(f.query().limit, 1001);
    });

    it('retains Page/archive, originals, manifests and every preview after terminal completion', async () => {
        const evidence = [retained({previousPageStorageId: cid}), retained({previousArchiveStorageId: cid}),
            ...['storageId', 'manifestStorageId', 'smallPreviewStorageId', 'mediumPreviewStorageId', 'largePreviewStorageId']
                .map(field => retained({sources: [{contentId: 45, [field]: cid}]}))];
        for (const retention of evidence) {
            assert.equal(await countStorageHolds(fixture([terminal(retention)]).app, cid), 1);
        }
        // Preserve the immutable input snapshot as well as the explicit hold.
        assert.equal(await countStorageHolds(fixture([terminal(retained(), {sources: [{storageId: cid}]})]).app, cid), 1);
    });

    it('another replacement cannot release shared originals held for external links', async () => {
        const held = terminal(retained({sources: [{contentId: 45, storageId: cid}]}));
        const ordinary = {id: 2, isWaiting: true, module: 'site-replacement',
            inputJson: JSON.stringify({input: {sources: [{id: 45, storageId: cid}]}}),
            asyncOperation: {output: JSON.stringify({status: 'retiring', result: {cleanup: {holdsReleased: false}}})}};
        const {app} = fixture([held, ordinary]);
        await withStorageJobSnapshot(app, async () => {
            assert.equal(await countStorageHolds(app, cid), 2);
            assert.equal(await countStorageHolds(app, cid, ordinary.id), 1,
                'ordinary retirement sees the independent retained reference');
            releaseStorageJobHolds(app, ordinary.id);
            assert.equal(await countStorageHolds(app, cid, ordinary.id), 1,
                'releasing the retiring workflow cannot release the external hold');
        });
        assert.equal(await countStorageHolds(app, cid, ordinary.id), 1, 'the hold survives the next independent snapshot');
    });

    it('fails closed for malformed retained receipts and shared active/terminal overflow', async () => {
        const bad = {...terminal(retained()), asyncOperation: {output: '{"externalLinksRetention":'}};
        assert.equal(await countStorageHolds(fixture([bad]).app, cid), 1001);
        assert.equal(await countStorageHolds(fixture([terminal(retained({sources: null}))]).app, cid), 1001);
        const rows = Array.from({length: 1001}, (_, index) => ({...terminal(retained()), id: index + 1}));
        assert.equal(await countStorageHolds(fixture(rows).app, cid), 1001);
    });

    it('only explicit true releases a hold, never a truthy malformed value', async () => {
        for (const value of [false, undefined, 'true']) {
            assert.equal(await countStorageHolds(fixture([terminal(retained({sources: [{storageId: cid}]}), {sources: []}, value)]).app, cid), 1);
        }
        assert.equal(await countStorageHolds(fixture([terminal(retained({sources: [{storageId: cid}]}), {sources: []}, true)]).app, cid), 0);
    });
});
