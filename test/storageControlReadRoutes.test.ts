import assert from 'node:assert/strict';
import net from 'node:net';
import {Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import apiModule from '../app/modules/api/index.js';
import registerCoreApi from '../app/modules/api/api.js';
import registerGroupApi from '../app/modules/group/api.js';
import registerContentApi from '../app/modules/content/api.js';
import registerSitesApi from '../app/modules/staticSiteGenerator/api.js';
import {withStorageFence, stopStorageFence} from '../app/storageLifecycle.js';

function deferred() {
    let resolve;
    const promise = new Promise<void>(done => { resolve = done; });
    return {promise, resolve};
}

async function port() {
    return new Promise<number>(resolve => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address() as net.AddressInfo;
            server.close(() => resolve(address.port));
        });
    });
}

describe('audited storage-independent control/read routes', function () {
    this.timeout(20000);

    for (const saturation of ['writers', 'gc']) {
        it(`preserves login, private-post checks and owner reads under ${saturation}`, async () => {
            const sequelize = new Sequelize({...databaseConfig, logging: false} as any);
            let api;
            const app: any = {
                config: {}, ms: {database: {sequelize}},
                getUserByApiToken: async token => ({user: token === 'owner' ? {id: 7}
                    : token === 'other-owner' ? {id: 8} : null, apiKey: {id: 1}}),
                runWithApiKey: (_key, run) => run(),
                loginPassword: async (username, password) => username === 'owner' && password === 'correct' ? {id: 7} : null,
                generateUserApiKey: async userId => `test-key-${userId}`
            };
            const held = deferred(), ready = deferred();
            let entered = 0;
            const count = saturation === 'writers' ? 10 : 1;
            const blockers = Array.from({length: count}, () => withStorageFence(app, saturation === 'gc' ? 'exclusive' : 'shared', async () => {
                if (++entered === count) {
                    ready.resolve();
                }
                await held.promise;
            }));
            try {
                await Promise.race([ready.promise, Promise.all(blockers)]);
                api = await apiModule(app, {port: await port(), host: '127.0.0.1', storageAdmissionTimeoutMs: 100,
                    registerRoutes: async (_app, module) => {
                        app.ms.api = module;
                        // Register the real login callback/options without the core
                        // placeholder discovery route shadowing the runtime index.
                        const loginModule = new Proxy(module, {get(target, name) {
                            if (name === 'onPost') {
                                return (route, callback, options) => {
                                    if (route === 'login/password') {
                                        return target.onPost(route, callback, options);
                                    }
                                };
                            }
                            if (String(name).startsWith('on')) {
                                return () => undefined;
                            }
                            const value = target[name];
                            return typeof value === 'function' ? value.bind(target) : value;
                        }});
                        registerCoreApi(app, loginModule);
                        registerGroupApi(app, {
                            getPostByParams: async body => body.id === 999 ? null : {id: 11, groupId: 22},
                            assertGroupReadable: async userId => {
                                if (userId !== 7) {
                                    throw new Error('not_permitted');
                                }
                            },
                            isMemberInGroup: async (userId, groupId) => userId === 7 && Number(groupId) === 22
                        } as any);
                        registerContentApi(app, {
                            getContentByStorageIdListAndUserId: async (ids, userId) => ({owner: userId, ids})
                        } as any);
                        registerSitesApi(app, {
                            getStaticSiteResponse: async userId => ({list: [{id: userId === 7 ? 71 : 81, userId}], total: 1})
                        } as any);
                    }});
                const base = `http://127.0.0.1:${api.port}/v1/`;
                const post = (route, body = {}, token?) => fetch(base + route, {method: 'POST',
                    headers: {'content-type': 'application/json', ...(token ? {authorization: `Bearer ${token}`} : {})},
                    body: JSON.stringify(body), signal: AbortSignal.timeout(2000)});
                const login = await post('login/password', {username: 'owner', password: 'correct'});
                assert.equal(login.status, 200);
                assert.equal((await login.json()).apiKey, 'test-key-7');
                const wrong = await post('login/password', {username: 'owner', password: 'wrong'});
                assert.equal(wrong.status, 403);
                await wrong.arrayBuffer();
                const allowed = await post('post/get', {id: 11}, 'owner');
                assert.equal(allowed.status, 200);
                assert.equal((await allowed.json()).id, 11);
                const privatePost = await post('post/get', {id: 11});
                assert.equal(privatePost.status, 403);
                await privatePost.arrayBuffer();
                const foreign = await post('post/get', {id: 11}, 'other-owner');
                assert.equal(foreign.status, 403);
                await foreign.arrayBuffer();
                const missing = await post('post/get', {id: 999}, 'owner');
                assert.equal(missing.status, 200);
                assert.equal(await missing.json(), null);
                const member = await post('user/group/22/is-member', {}, 'owner');
                assert.equal(member.status, 200);
                assert.equal((await member.json()).result, true);
                const contents = await post('content-list-by-storage-id', {idList: ['owned']}, 'owner');
                assert.equal(contents.status, 200);
                assert.deepEqual(await contents.json(), {owner: 7, ids: ['owned']});
                const sites = await post('render/static-site-generator/get-list', {}, 'owner');
                assert.equal(sites.status, 200);
                assert.equal((await sites.json()).list[0].userId, 7);
                const foreignSites = await post('render/static-site-generator/get-list', {}, 'other-owner');
                assert.equal(foreignSites.status, 200);
                assert.equal((await foreignSites.json()).list[0].userId, 8);
                for (const route of ['content-list-by-storage-id', 'render/static-site-generator/get-list', 'user/group/22/is-member']) {
                    const invalid = await post(route, {}, 'invalid');
                    assert.equal(invalid.status, 401);
                    await invalid.arrayBuffer();
                }
            } finally {
                held.resolve();
                await Promise.allSettled(blockers);
                await api?.stop();
                await stopStorageFence(app);
                await sequelize.close();
            }
        });
    }
});
