import assert from 'node:assert/strict';
import {beginStorageActivity, noteStorageActivity, storageActivitySnapshot} from '../app/modules/staticSiteGenerator/cleanupActivity.js';
import {cleanupBatchReady, cleanupIdleWaitMs} from '../app/modules/staticSiteGenerator/cleanupBatch.js';
import {cleanupDiskPressure} from '../app/modules/staticSiteGenerator/cleanupDisk.js';
import {cleanupPhase} from '../app/modules/staticSiteGenerator/cleanupTiming.js';

describe('interactive cleanup scheduling and telemetry', () => {
    const rows = () => [{result: {cleanupQueuedAt: new Date(0).toISOString(), cleanupRetry: {force: true, nextAttemptAt: new Date(0).toISOString()}}}];
    it('counts live uploads, attempts, and time since the last finished upload', () => {
        const app = {};
        const now = cleanupIdleWaitMs * 10;
        const end = beginStorageActivity(app, now);
        assert.equal(cleanupBatchReady(rows(), false, now + cleanupIdleWaitMs, storageActivitySnapshot(app)), false);
        end(now + cleanupIdleWaitMs);
        end(now + cleanupIdleWaitMs + 1000);
        assert.equal(storageActivitySnapshot(app).active, 0, 'duplicate completion cannot corrupt writer count');
        assert.equal(cleanupBatchReady(rows(), false, now + cleanupIdleWaitMs * 2 - 1, storageActivitySnapshot(app)), false);
        assert.equal(cleanupBatchReady(rows(), false, now + cleanupIdleWaitMs * 2, storageActivitySnapshot(app)), true);
        noteStorageActivity(app, now + cleanupIdleWaitMs * 2);
        assert.equal(cleanupBatchReady(rows(), false, now + cleanupIdleWaitMs * 2 + 1, storageActivitySnapshot(app)), false);
    });
    it('starts conservatively after restart and keeps healthy disk retries behind foreground', () => {
        const now = cleanupIdleWaitMs * 100;
        assert.equal(cleanupBatchReady(rows(), false, now, storageActivitySnapshot({}, now)), false);
        assert.equal(cleanupBatchReady(rows(), true, now, {active: 0, lastActivityAt: 0}), false);
        assert.equal(cleanupBatchReady(rows(), true, now, {active: 1, lastActivityAt: now}, true), true);
    });
    it('only accepts explicit known disk pressure on the configured filesystem', async () => {
        const read: any = async path => {
            assert.equal(path, '/ipfs-data');
            return {bavail: 10, bsize: 1024};
        };
        assert.equal(await cleanupDiskPressure({}, read), false);
        assert.equal(await cleanupDiskPressure({STORAGE_CLEANUP_DATA_PATH: '/ipfs-data', STORAGE_CLEANUP_MIN_FREE_BYTES: '11000'} as any, read), true);
        assert.equal(await cleanupDiskPressure({STORAGE_CLEANUP_DATA_PATH: '/ipfs-data', STORAGE_CLEANUP_MIN_FREE_BYTES: '9000'} as any, read), false);
        assert.equal(await cleanupDiskPressure({STORAGE_CLEANUP_DATA_PATH: '/ipfs-data', STORAGE_CLEANUP_MIN_FREE_BYTES: 'NaN'} as any, read), false);
        assert.equal(await cleanupDiskPressure({STORAGE_CLEANUP_DATA_PATH: '/ipfs-data'} as any, async () => { throw Error('mount missing'); }), false);
    });
    it('persists phase failures and records an interrupted prior attempt on recovery', async () => {
        let clock = 100;
        const row: any = {result: {}, update: async patch => Object.assign(row, structuredClone(patch))};
        await assert.rejects(cleanupPhase([row], 'gc', async () => {
            clock = 170;
            throw Object.assign(Error('RPC unavailable'), {code: 'storage_gc_failed'});
        }, () => clock), /RPC unavailable/);
        assert.equal(row.result.cleanupTiming.gc.durationMs, 70);
        assert.equal(row.result.cleanupTiming.gc.error, 'storage_gc_failed');
        row.result.cleanupTiming.gc = {startedAt: new Date(10).toISOString(), attempts: 1};
        await cleanupPhase([row], 'gc', async () => { clock = 190; }, () => clock);
        assert.equal(row.result.cleanupTiming.gc.attempts, 2);
        assert.equal(row.result.cleanupTiming.gc.interruptedAt, new Date(10).toISOString());
        assert.equal(row.result.cleanupTiming.gc.outcome, 'complete');
        assert.equal(row.result.cleanupTiming.gc.error, undefined);
    });
    it('does not checkpoint telemetry after losing the storage fence', async () => {
        let lost = false;
        const updates = [];
        const row: any = {result: {}, update: async patch => { updates.push(patch); Object.assign(row, patch); }};
        await assert.rejects(cleanupPhase([row], 'gc', async () => { lost = true; }, Date.now, async () => {
            if (lost) {
                throw Error('storage_fence_lost');
            }
        }), /storage_fence_lost/);
        assert.equal(updates.length, 1);
        assert.equal(row.result.cleanupTiming.gc.finishedAt, undefined);
    });
});
