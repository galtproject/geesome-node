import assert from 'node:assert/strict';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import apiModule from '../app/modules/api/index.js';
import {withStorageFence, stopStorageFence} from '../app/storageLifecycle.js';

function deferred() {
    let resolve;
    const promise = new Promise<void>(done => { resolve = done; });
    return {promise, resolve};
}

async function fixture(register, storageAdmissionTimeoutMs = 150) {
    const sequelize = new Sequelize({...databaseConfig, logging: false} as any);
    const app: any = {config: {}, ms: {database: {sequelize}}};
    const port = await new Promise<number>(resolve => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as net.AddressInfo).port;
            server.close(() => resolve(port));
        });
    });
    const api = await apiModule(app, {port, host: '127.0.0.1', storageAdmissionTimeoutMs,
        registerRoutes: async (_app, module) => register(module, app)});
    return {app, post: (route, signal?) => fetch(`http://127.0.0.1:${api.port}/v1/${route}`, {
        method: 'POST', body: '{}', headers: {'content-type': 'application/json'}, signal
    }), close: async () => {
        await api.stop();
        await stopStorageFence(app);
        await sequelize.close();
    }};
}

async function saturate(app) {
    const held = deferred(), ready = deferred();
    let count = 0;
    const writers = Array.from({length: 10}, () => withStorageFence(app, 'shared', async () => {
        if (++count === 10) {
            ready.resolve();
        }
        await held.promise;
    }));
    await ready.promise;
    return async () => {
        held.resolve();
        await Promise.all(writers);
    };
}

describe('bounded HTTP storage admission', function () {
    this.timeout(15000);

    it('returns typed busy before client timeout and never invokes a late callback', async () => {
        let calls = 0;
        const f = await fixture(api => api.onPost('write', (_req, res) => {
            calls++;
            res.send({ok: true});
        }));
        const release = await saturate(f.app);
        try {
            const started = Date.now();
            const response = await f.post('write', AbortSignal.timeout(2000));
            assert.equal(response.status, 503);
            assert.equal(response.headers.get('retry-after'), '2');
            assert.equal((await response.json()).code, 'storage_busy');
            assert(Date.now() - started < 1500);
            await release();
            const next = await f.post('write');
            assert.equal(next.status, 200);
            await next.arrayBuffer();
            assert.equal(calls, 1, 'only the new request may execute');
        } finally {
            await release();
            await f.close();
        }
    });

    it('does not start a writer after its HTTP client disconnects while waiting', async () => {
        let calls = 0;
        const f = await fixture(api => api.onPost('write', (_req, res) => {
            calls++;
            res.send({ok: true});
        }), 3000);
        const release = await saturate(f.app);
        try {
            await assert.rejects(f.post('write', AbortSignal.timeout(50)));
            // Allow the server to observe the socket closure before capacity returns.
            await delay(100);
            await release();
            await delay(50);
            assert.equal(calls, 0);
        } finally {
            await release();
            await f.close();
        }
    });

    it('bounds handler-owned inner admission while preserving the unfenced read path', async () => {
        let writes = 0;
        const f = await fixture((api, app) => {
            api.onPost('receipt', (_req, res) => res.send({receipt: 42}), {storageFence: 'handler'});
            api.onPost('new-receipt', async (_req, res) => withStorageFence(app, 'shared', async () => {
                writes++;
                res.send({receipt: 43});
            }), {storageFence: 'handler'});
        });
        const release = await saturate(f.app);
        try {
            const read = await f.post('receipt');
            assert.equal(read.status, 200);
            assert.equal((await read.json()).receipt, 42);
            const write = await f.post('new-receipt');
            assert.equal(write.status, 503);
            await write.arrayBuffer();
            await release();
            await delay(50);
            assert.equal(writes, 0);
        } finally {
            await release();
            await f.close();
        }
    });

    it('keeps accepted work fenced after its response closes', async () => {
        const hold = deferred(), entered = deferred(), done = deferred();
        const f = await fixture((api, app) => api.onPost('accepted', (_req, res) => {
            void withStorageFence(app, 'shared', async () => {
                entered.resolve();
                await hold.promise;
            }).finally(() => done.resolve());
            res.send({accepted: true});
        }));
        try {
            const response = await f.post('accepted');
            await response.arrayBuffer();
            await entered.promise;
            await assert.rejects(withStorageFence(f.app, 'exclusive', async () => {}, {wait: false}),
                error => error.code === 'storage_maintenance_busy');
            hold.resolve();
            await done.promise;
            await withStorageFence(f.app, 'exclusive', async () => {}, {wait: false});
        } finally {
            hold.resolve();
            await done.promise;
            await f.close();
        }
    });
});
