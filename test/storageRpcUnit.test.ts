import assert from 'node:assert/strict';
import {storageRpc, storageRpcOptions, gcTimeoutMs} from '../app/modules/storage/rpcDeadline.js';
import {configureStoragePinning} from '../app/modules/storage/index.js';
import {cleanupDue, cleanupFailure} from '../app/modules/staticSiteGenerator/cleanupRetry.js';

const cid = 'QmYWQu4zcgiBCR5ztA4PYwMyCYXLRuWngxuwnjJVH929mE';
describe('bounded storage RPC and cleanup recovery', () => {

    it('bounds pinned imports through completion without relying on a later addPin call', async () => {
        for (const name of ['saveFile', 'saveDirectory', 'saveObject']) {
            const controller = new AbortController();
            let received;
            const module: any = {[name]: async (_data, options) => {
                received = options;
                await new Promise((_resolve, reject) => options.signal.addEventListener('abort',
                    () => reject(options.signal.reason), {once: true}));
            }};
            configureStoragePinning(module);
            const work = module[name]('input', {signal: controller.signal, timeout: 1000, waitForPin: true});
            controller.abort(new Error('request_cancelled'));
            await assert.rejects(work, error => error.code === 'storage_import_cancelled');
            assert.equal(received.timeout, 1000);
            assert.equal(received.waitForPin, true);
            assert.equal(received.signal.aborted, true);
            await assert.rejects(module[name]('input', {timeout: 10}),
                error => error.code === 'storage_import_timeout');
        }
    });
    it('preserves pin options and caller cancellation through the actual storage adapter', async () => {
        const controller = new AbortController();
        let received;
        const module: any = {addPin() {}, node: {pin: {add: async (_cid, options) => {
            received = options;
            await new Promise((_resolve, reject) => options.signal.addEventListener('abort',
                () => reject(options.signal.reason), {once: true}));
        }}}};
        configureStoragePinning(module);
        const work = module.addPin(cid, {signal: controller.signal, timeout: 1000, recursive: false});
        controller.abort(new Error('request_cancelled'));
        await assert.rejects(work, error => error.code === 'storage_pin_cancelled' && error.cause.message === 'request_cancelled');
        assert.equal(received.timeout, 1000);
        assert.equal(received.recursive, false);
        assert.equal(received.signal.aborted, true);
    });
    it('bounds a stuck RPC and retains transport causes', async () => {
        await assert.rejects(storageRpc('pin', {timeout: 10}, async options => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), {once: true});
        })), /storage_pin_timeout/);
        const transport = Object.assign(new Error('fetch failed'), {cause: {code: 'UND_ERR_HEADERS_TIMEOUT'}});
        await assert.rejects(storageRpc('gc', {}, async () => { throw transport; }), error =>
            error.code === 'storage_gc_failed' && error.cause === transport && /UND_ERR_HEADERS_TIMEOUT/.test(error.message));
        assert.equal(storageRpcOptions({}, gcTimeoutMs).timeout, 1800000, 'large GC has an explicit bounded deadline');
    });
    it('persists backoff and stops retrying after three failures', () => {
        const row: any = {status: 'gc_pending', result: {cleanup: {candidates: [{unpinned: true}]}}};
        for (let count = 1; count <= 3; count++) {
            Object.assign(row, cleanupFailure(row, new Error('unavailable'), 1000));
            assert.equal(row.result.cleanupRetry.failures, count);
            assert.equal(row.status, count === 3 ? 'cleanup_failed' : 'gc_pending');
            assert.equal(cleanupDue(row, 1000), false);
            assert.equal(cleanupDue(row, Date.parse(row.result.cleanupRetry.nextAttemptAt)), true);
        }
        assert.deepEqual(row.result.cleanup.candidates, [{unpinned: true}], 'failure cannot claim local deletion');
        assert.equal(row.result.cleanupRetry.resumeStatus, 'gc_pending');
    });
});


describe('cleanup batch scheduling', () => {
    it('accumulates idle receipts and defers behind foreground work only until the durable maximum', async () => {
        const {cleanupBatchReady, cleanupIdleWaitMs, cleanupMaxWaitMs} = await import('../app/modules/staticSiteGenerator/cleanupBatch.js');
        const start = Date.now();
        const rows = Array.from({length: 20}, (_, id) => ({id, result: {cleanupQueuedAt: new Date(start).toISOString()}}));
        assert.equal(cleanupBatchReady(rows, false, start), false);
        assert.equal(cleanupBatchReady(rows, false, start + cleanupIdleWaitMs), true);
        assert.equal(cleanupBatchReady(rows, true, start + cleanupIdleWaitMs), false);
        assert.equal(cleanupBatchReady(structuredClone(rows), true, start + cleanupMaxWaitMs), true, 'restart uses persisted queue times');
        assert.equal(cleanupBatchReady([], true, start + cleanupMaxWaitMs), false);
        assert.equal(cleanupBatchReady([{result: {cleanupRetry: {force: true}}}], true, start), true);
    });
});

describe('separate import and pin-proof policy', () => {
    it('allows a slow import beyond its pin-proof budget without renewing cancellation', async () => {
        let received;
        const module: any = {saveFile: async (_data, options) => {
            received = options;
            await new Promise(resolve => setTimeout(resolve, 40));
            options.signal.throwIfAborted();
            return {id: 'confirmed-root'};
        }};
        configureStoragePinning(module, {importTimeoutMs: 200, pinProofTimeoutMs: 20});
        assert.deepEqual(await module.saveFile('bytes'), {id: 'confirmed-root'});
        assert.equal(received.timeout, 200);
        assert.equal(received.pinProofTimeoutMs, 20);
        assert.equal(received.signal.aborted, false);
        await assert.rejects(module.saveFile('bytes', {pinProofTimeoutMs: 0}), /proof_budget_invalid/);
    });
    it('validates configurable import policy independently of the old pin deadline', async () => {
        const {storageImportTimeoutMs, defaultImportTimeoutMs, pinTimeoutMs} = await import('../app/modules/storage/rpcDeadline.js');
        assert.equal(storageImportTimeoutMs({} as any), defaultImportTimeoutMs);
        assert(defaultImportTimeoutMs > pinTimeoutMs);
        assert.equal(storageImportTimeoutMs({GEESOME_STORAGE_IMPORT_TIMEOUT_MS: '900000'} as any), 900000);
        for (const value of ['0', '-1', 'NaN', '86400001', '']) {
            assert.throws(() => storageImportTimeoutMs({GEESOME_STORAGE_IMPORT_TIMEOUT_MS: value} as any), /configuration_invalid/);
        }
    });
});
