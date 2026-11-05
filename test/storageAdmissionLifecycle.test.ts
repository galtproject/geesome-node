import assert from 'node:assert/strict';
import {Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import {stopStorageFence, storageFenceSignal, withStorageAdmission, withStorageFence} from '../app/storageLifecycle.js';

function deferred() {
    let resolve;
    const promise = new Promise<void>(done => { resolve = done; });
    return {promise, resolve: () => resolve()};
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const busy = (error: any) => error?.code === 'storage_busy' && error?.status === 503;

describe('storage fence admission lifecycle with PostgreSQL', function () {
    this.timeout(15000);
    let sequelize: Sequelize, app: any, other: any;
    beforeEach(() => {
        sequelize = new Sequelize({...databaseConfig, logging: false} as any);
        app = {ms: {database: {sequelize}}};
        other = {ms: {database: {sequelize}}};
    });
    afterEach(async () => {
        await Promise.all([stopStorageFence(app), stopStorageFence(other)]);
        await sequelize.close();
    });

    async function saturate() {
        const held = deferred(), ready = deferred();
        let entered = 0;
        const writers = Array.from({length: 10}, () => withStorageFence(app, 'shared', async () => {
            if (++entered === 10) {
                ready.resolve();
            }
            await held.promise;
        }));
        await Promise.race([ready.promise, Promise.all(writers)]);
        return {release: async () => { held.resolve(); await Promise.all(writers); }};
    }

    it('expires a checkout before client timeout and never invokes its late callback', async () => {
        const writers = await saturate();
        let invoked = 0;
        try {
            await assert.rejects(withStorageAdmission(app, {timeoutMs: 40}, () =>
                withStorageFence(app, 'shared', async () => { invoked++; }, {wait: false})), busy);
        } finally {
            await writers.release();
        }
        await pause(30);
        assert.equal(invoked, 0);
        // Ten new holders prove the abandoned checkout did not leak a connection.
        const subsequent = await saturate();
        await subsequent.release();
    });

    it('abandons a pending checkout on disconnect and releases its eventual connection', async () => {
        const writers = await saturate();
        const abort = new AbortController();
        let invoked = false;
        const attempt = withStorageAdmission(app, {timeoutMs: 3000, signal: abort.signal}, () =>
            withStorageFence(app, 'shared', async () => { invoked = true; }));
        abort.abort();
        try {
            await assert.rejects(attempt, busy);
        } finally {
            await writers.release();
        }
        await pause(30);
        assert.equal(invoked, false);
        await withStorageFence(app, 'exclusive', async () => undefined);
    });

    it('counts pre-admission validation time against the original deadline', async () => {
        let invoked = false;
        await assert.rejects(withStorageAdmission(app, {timeoutMs: 5}, async () => {
            await pause(20);
            return withStorageFence(app, 'shared', async () => { invoked = true; });
        }), busy);
        assert.equal(invoked, false);
    });

    it('cancels a waiting advisory lock without a late callback or orphan lock', async () => {
        const entered = deferred(), held = deferred();
        const writer = withStorageFence(other, 'shared', async () => { entered.resolve(); await held.promise; });
        await entered.promise;
        let invoked = false;
        try {
            await assert.rejects(withStorageAdmission(app, {timeoutMs: 50}, () =>
                withStorageFence(app, 'exclusive', async () => { invoked = true; })), busy);
        } finally {
            held.resolve();
            await writer;
        }
        await pause(30);
        assert.equal(invoked, false);
        await withStorageFence(other, 'exclusive', async () => undefined, {wait: false});
    });

    it('keeps accepted and detached writes protected after the caller disconnects', async () => {
        const held = deferred(), entered = deferred();
        const abort = new AbortController();
        let child;
        await withStorageAdmission(app, {timeoutMs: 30, signal: abort.signal}, () =>
            withStorageFence(app, 'shared', async () => {
                child = withStorageFence(app, 'shared', async () => { entered.resolve(); await held.promise; });
                await entered.promise;
                abort.abort();
                await pause(40);
                await withStorageFence(app, 'shared', async () => undefined);
            }));
        try {
            await assert.rejects(withStorageFence(other, 'exclusive', async () => undefined, {wait: false}),
                (error: any) => error.code === 'storage_maintenance_busy');
        } finally {
            held.resolve();
            await child;
        }
        await withStorageFence(other, 'exclusive', async () => undefined, {wait: false});
    });

    it('continues subsequent fenced work after the request was already admitted', async () => {
        const abort = new AbortController();
        let completed = 0;
        await withStorageAdmission(app, {timeoutMs: 20, signal: abort.signal}, async () => {
            await withStorageFence(app, 'shared', async () => { completed++; });
            abort.abort();
            await pause(30);
            await withStorageFence(app, 'shared', async () => { completed++; });
        });
        assert.equal(completed, 2);
    });

    it('rejects new descendants after its session fence is lost', async () => {
        await withStorageFence(app, 'shared', async assertHeld => {
            const signal = storageFenceSignal();
            const [rows]: any = await sequelize.query(`SELECT pg_terminate_backend(pid) FROM pg_locks
                WHERE locktype='advisory' AND classid=17419 AND objid=9301 AND granted
                AND mode='ShareLock' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`);
            assert(rows.length > 0);
            await pause(20);
            assert.equal(signal.aborted, true);
            await assert.rejects(assertHeld(), /storage_fence_lost/);
            let invoked = false;
            await assert.rejects(withStorageFence(app, 'shared', async () => { invoked = true; }), /storage_fence_lost/);
            assert.equal(invoked, false);
        });
    });

    it('emits only bounded safe admission and hold diagnostics when enabled', async () => {
        const prior = process.env.GEESOME_STORAGE_FENCE_DIAGNOSTICS;
        const log = console.info, events: any[] = [];
        process.env.GEESOME_STORAGE_FENCE_DIAGNOSTICS = '1';
        console.info = value => { events.push(JSON.parse(value)); };
        try {
            await withStorageAdmission(app, {timeoutMs: 1000, route: '/v1/user/site-replacements', requestId: 'req_safe'}, () =>
                withStorageFence(app, 'shared', async () => undefined));
            await withStorageAdmission(app, {timeoutMs: 1000, route: '/v1/user/123?token=secret', requestId: 'bad\nsecret'}, () =>
                withStorageFence(app, 'shared', async () => undefined));
            assert.equal(events.length, 4);
            assert.equal(events[0].stage, 'acquired');
            assert.equal(events[0].route, '/v1/user/site-replacements');
            assert.equal(events[1].stage, 'released');
            assert.equal(typeof events[1].holdMs, 'number');
            assert.equal(events[2].route, undefined);
            assert.equal(events[2].requestId, undefined);
            assert.equal(JSON.stringify(events).includes('secret'), false);
        } finally {
            console.info = log;
            if (prior === undefined) {
                delete process.env.GEESOME_STORAGE_FENCE_DIAGNOSTICS;
            } else {
                process.env.GEESOME_STORAGE_FENCE_DIAGNOSTICS = prior;
            }
        }
    });
});
