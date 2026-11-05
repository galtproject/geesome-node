import assert from 'node:assert/strict';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import apiModule from '../app/modules/api/index.js';
import {ApiProblemError} from '../app/modules/api/problem.js';
import {withStorageAdmission, withStorageFence, stopStorageFence} from '../app/storageLifecycle.js';

function deferred() {
    let resolve;
    const promise = new Promise<void>(done => { resolve = done; });
    return {promise, resolve};
}

async function fixture(register, storageAdmissionTimeoutMs = 150, legacyDefault = false) {
    const sequelize = new Sequelize({...databaseConfig, logging: false} as any);
    const app: any = {config: {}, ms: {database: {sequelize}}};
    const port = await new Promise<number>(resolve => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as net.AddressInfo).port;
            server.close(() => resolve(port));
        });
    });
    const api = await apiModule(app, {port, host: '127.0.0.1', ...(legacyDefault ? {} : {storageAdmissionTimeoutMs}),
        registerRoutes: async (_app, module) => register(module, app)});
    return {app, baseUrl: `http://127.0.0.1:${api.port}`, post: (route, signal?, headers = {}, body = {}) => fetch(`http://127.0.0.1:${api.port}/v1/${route}`, {
        method: 'POST', body: JSON.stringify(body), headers: {'content-type': 'application/json', ...headers}, signal
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
            const refusal = await response.json();
            assert.equal(refusal.code, 'storage_busy');
            assert.equal(refusal.admissionRejected, true);
            assert.equal(refusal.executionStarted, false);
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
            api.onPost('receipt', (_req, res) => res.send({receipt: 42}), {storageFence: 'handler', storageAdmissionRejectionSafe: true});
            api.onPost('new-receipt', async (_req, res) => withStorageFence(app, 'shared', async () => {
                writes++;
                res.send({receipt: 43});
            }), {storageFence: 'handler', storageAdmissionRejectionSafe: true});
        });
        const release = await saturate(f.app);
        try {
            const read = await f.post('receipt');
            assert.equal(read.status, 200);
            assert.equal((await read.json()).receipt, 42);
            const write = await f.post('new-receipt');
            assert.equal(write.status, 503);
            const refused = await write.json();
            assert.equal(refused.admissionRejected, true);
            assert.equal(refused.executionStarted, false);
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
    it('preserves legacy admission through a six-second saturation wait', async () => {
        let calls = 0;
        const f = await fixture(api => api.onPost('legacy-write', (_req, res) => {
            calls++;
            res.send({ok: true});
        }), 150, true);
        const release = await saturate(f.app);
        const timer = setTimeout(() => { void release(); }, 6000);
        try {
            const started = Date.now();
            const response = await f.post('legacy-write', AbortSignal.timeout(9000));
            assert.equal(response.status, 200);
            await response.arrayBuffer();
            assert(Date.now() - started >= 5500);
            assert.equal(calls, 1);
        } finally {
            clearTimeout(timer);
            await release();
            await f.close();
        }
    });

    it('honors explicit three-second admission without a late writer', async () => {
        let calls = 0;
        const f = await fixture(api => api.onPost('short-write', (_req, res) => {
            calls++;
            res.send({ok: true});
        }), 150, true);
        const release = await saturate(f.app);
        try {
            const started = Date.now();
            const response = await f.post('short-write', AbortSignal.timeout(5000), {'X-Geesome-Storage-Admission-Ms': '3000'});
            assert.equal(response.status, 503);
            const refusal = await response.json();
            assert.equal(refusal.admissionRejected, true);
            assert.equal(refusal.executionStarted, false);
            assert(Date.now() - started >= 2800);
            assert(Date.now() - started < 4500);
            await release();
            await delay(50);
            assert.equal(calls, 0);
        } finally {
            await release();
            await f.close();
        }
    });

    it('rejects malformed opt-in budgets before execution', async () => {
        let calls = 0;
        const f = await fixture(api => api.onPost('write', (_req, res) => {
            calls++;
            res.send({ok: true});
        }));
        try {
            for (const value of ['0', '3001', '10000', '-1', '1.5', 'invalid']) {
                const response = await f.post('write', undefined, {'X-Geesome-Storage-Admission-Ms': value});
                assert.equal(response.status, 400);
                const refusal = await response.json();
                assert.equal(refusal.code, 'storage_admission_budget_invalid');
                assert.equal(refusal.admissionRejected, undefined);
            }
            assert.equal(calls, 0);
        } finally {
            await f.close();
        }
    });

    it('does not label arbitrary business busy errors as proven admission refusals', async () => {
        let effects = 0;
        const f = await fixture(api => {
            const business = () => {
                effects++;
                throw new ApiProblemError(503, 'storage_busy', 'storage busy');
            };
            api.onPost('business', business);
            api.onPost('audited-business', business, {storageFence: 'handler', storageAdmissionRejectionSafe: true});
        });
        try {
            for (const route of ['business', 'audited-business']) {
                const response = await f.post(route);
                assert.equal(response.status, 503);
                const refusal = await response.json();
                assert.equal(refusal.code, 'storage_busy');
                assert.equal(refusal.admissionRejected, undefined);
                assert.equal(refusal.executionStarted, undefined);
            }
            assert.equal(effects, 2);
        } finally {
            await f.close();
        }
    });

    it('does not label unaudited handler-owned late fence errors as safe', async () => {
        let effects = 0;
        const f = await fixture((api, app) => api.onPost('unsafe', async () => {
            effects++;
            await withStorageFence(app, 'shared', async () => undefined);
        }, {storageFence: 'handler'}));
        const release = await saturate(f.app);
        try {
            const response = await f.post('unsafe');
            assert.equal(response.status, 503);
            const refusal = await response.json();
            assert.equal(refusal.code, 'storage_busy');
            assert.equal(refusal.admissionRejected, undefined);
            assert.equal(effects, 1);
        } finally {
            await release();
            await f.close();
        }
    });

    it('advertises the optional budget and allows its CORS request header', async () => {
        const f = await fixture(() => undefined, 150, true);
        try {
            const response = await fetch(f.baseUrl + '/v1');
            assert.equal(response.status, 200);
            const capability = (await response.json()).publicDiscovery.capabilities.storageAdmission;
            assert.equal(capability.contract, 1);
            assert.equal(capability.requestHeader, 'X-Geesome-Storage-Admission-Ms');
            assert.equal(capability.legacyTimeoutMs, 10000);
            assert.equal(capability.maximumOptInTimeoutMs, 3000);
            assert.deepEqual(capability.safeRefusal, {admissionRejected: true, executionStarted: false});
            const cors = await fetch(f.baseUrl + '/v1/write', {method: 'OPTIONS'});
            assert(cors.headers.get('access-control-allow-headers').toLowerCase().includes('x-geesome-storage-admission-ms'));
        } finally {
            await f.close();
        }
    });

    it('does not reuse a private admission proof across different HTTP requests', async () => {
        let staleError;
        const f = await fixture(api => api.onPost('stale-refusal', () => { throw staleError; },
            {storageFence: 'handler', storageAdmissionRejectionSafe: true}));
        const release = await saturate(f.app);
        try {
            await assert.rejects(withStorageAdmission(f.app, {timeoutMs: 20, signal: new AbortController().signal}, () =>
                withStorageFence(f.app, 'shared', async () => undefined)), error => {
                staleError = error;
                return error.code === 'storage_busy';
            });
            await release();
            const response = await f.post('stale-refusal');
            assert.equal(response.status, 503);
            const refusal = await response.json();
            assert.equal(refusal.code, 'storage_busy');
            assert.equal(refusal.admissionRejected, undefined);
            assert.equal(refusal.executionStarted, undefined);
        } finally {
            await release();
            await f.close();
        }
    });

});
