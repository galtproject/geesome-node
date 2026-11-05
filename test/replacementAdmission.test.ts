import assert from 'node:assert/strict';
import net from 'node:net';
import {Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import apiModule from '../app/modules/api/index.js';
import registerReplacementApi from '../app/modules/staticSiteGenerator/replacementApi.js';
import {SiteReplacements} from '../app/modules/staticSiteGenerator/replacements.js';
import {digest} from '../app/storageIdentity.js';
import {problem} from '../app/modules/content/publicationInput.js';
import {withStorageFence, stopStorageFence} from '../app/storageLifecycle.js';

function deferred() {
    let resolve;
    const promise = new Promise<void>(done => { resolve = done; });
    return {promise, resolve: () => resolve()};
}

async function unusedPort() {
    return new Promise<number>(resolve => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address() as net.AddressInfo;
            server.close(() => resolve(address.port));
        });
    });
}

describe('replacement receipt admission under writer saturation', function () {
    this.timeout(20000);

    it('returns authorized existing receipts without a writer slot while new snapshots remain fenced', async () => {
        const sequelize = new Sequelize({...databaseConfig, logging: false} as any);
        const held = deferred(), ready = deferred();
        let entered = 0, sourceReads = 0, creates = 0, api;
        const input = {requestKey: 'existing-receipt', contentIds: [11],
            driver: {module: 'convert', name: 'imageOptimize', params: {policy: 'publication-webp-v1'}}};
        const requestHash = digest({contentIds: [11], previousSiteStorageId: null,
            postId: null, deleteReplacedFiles: false});
        const receipts = new Map([['7:existing-receipt', {id: 91, userId: 7,
            requestHash, status: 'preparing', result: null, error: null}]]);
        const app: any = {
            config: {}, ms: {database: {sequelize}, content: {publicationImages: {
                authorize: async userId => {
                    if (userId !== 7) {
                        problem('not_permitted', 403);
                    }
                },
                owned: async (userId, id) => {
                    sourceReads++;
                    assert.equal(userId, 7);
                    assert.equal(id, 11);
                    return {id, userId, storageId: 'owned-source'};
                }
            }}},
            getUserByApiToken: async token => ({user: token === 'owner' ? {id: 7}
                : token === 'other-owner' ? {id: 8} : null, apiKey: {id: 1}}),
            runWithApiKey: (_key, run) => run()
        };
        const service = new SiteReplacements(app, {});
        service.jobs = {
            byKey: async (userId, key) => receipts.get(`${userId}:${key}`),
            get: async (userId, id) => [...receipts.values()].find(row => row.userId === userId && row.id === id),
            create: async (userId, _apiKeyId, key, state) => {
                creates++;
                const row = {id: 92, userId, ...state};
                receipts.set(`${userId}:${key}`, row);
                return row;
            }
        } as any;
        const writers = Array.from({length: 10}, () => withStorageFence(app, 'shared', async () => {
            entered++;
            if (entered === 10) {
                ready.resolve();
            }
            await held.promise;
        }));
        try {
            await Promise.race([ready.promise, Promise.all(writers)]);
            api = await apiModule(app, {port: await unusedPort(), host: '127.0.0.1',
                storageAdmissionTimeoutMs: 150, registerRoutes: async (_app, module) => {
                    app.ms.api = module;
                    registerReplacementApi(app, service);
                }});
            const post = (body = input, token = 'owner') => fetch(`http://127.0.0.1:${api.port}/v1/user/site-replacements`, {
                method: 'POST', headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
                body: JSON.stringify(body), signal: AbortSignal.timeout(5000)
            });
            const existing = await post();
            assert.equal(existing.status, 202);
            assert.equal((await existing.json()).id, 91);
            const conflict = await post({...input, contentIds: [12]});
            assert.equal(conflict.status, 409);
            assert.equal((await conflict.json()).code, 'image_replacement_idempotency_conflict');
            const denied = await post(input, 'other-owner');
            assert.equal(denied.status, 403);
            await denied.arrayBuffer();
            const invalid = await post(input, 'invalid');
            assert.equal(invalid.status, 401);
            await invalid.arrayBuffer();
            const fresh = {...input, requestKey: 'new-receipt'};
            const refused = await post(fresh);
            assert.equal(refused.status, 503);
            const refusal = await refused.json();
            assert.equal(refusal.code, 'storage_busy');
            assert.equal(refusal.admissionRejected, true);
            assert.equal(refusal.executionStarted, false);
            assert.equal(refused.headers.get('retry-after'), '2');
            assert.equal(creates, 0);
            assert.equal(sourceReads, 0, 'new snapshot must not run without the shared fence');
            held.resolve();
            await Promise.all(writers);
            const accepted = await post(fresh);
            assert.equal(accepted.status, 202);
            assert.equal((await accepted.json()).id, 92);
            assert.equal(creates, 1);
            assert.equal(sourceReads, 1);
            const replay = await post(fresh);
            assert.equal(replay.status, 202);
            assert.equal((await replay.json()).id, 92);
            assert.equal(creates, 1);
            assert.equal(sourceReads, 1);

            const gcEntered = deferred(), gcHeld = deferred();
            const gc = withStorageFence(app, 'exclusive', async () => {
                gcEntered.resolve();
                await gcHeld.promise;
            });
            await gcEntered.promise;
            try {
                const oldReceipt = await post(input);
                assert.equal(oldReceipt.status, 202);
                assert.equal((await oldReceipt.json()).id, 91);
                const started = Date.now();
                const maintenance = await post({...input, requestKey: 'new-during-gc'});
                assert.equal(maintenance.status, 503);
                const refusedByGc = await maintenance.json();
                assert.equal(refusedByGc.code, 'storage_maintenance_busy');
                assert.equal(refusedByGc.admissionRejected, true);
                assert.equal(refusedByGc.executionStarted, false);
                assert(Date.now() - started < 1000);
                assert.equal(creates, 1);
                assert.equal(sourceReads, 1);
            } finally {
                gcHeld.resolve();
                await gc;
            }
        } finally {
            held.resolve();
            await Promise.allSettled(writers);
            await api?.stop();
            await stopStorageFence(app);
            await sequelize.close();
        }
    });
});
