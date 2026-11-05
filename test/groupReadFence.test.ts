import assert from 'node:assert/strict';
import net from 'node:net';
import {Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import apiModule from '../app/modules/api/index.js';
import registerGroupApi from '../app/modules/group/api.js';
import {withStorageFence, stopStorageFence} from '../app/storageLifecycle.js';

describe('group lookup under storage writer saturation', function () {
    this.timeout(15000);

    it('serves authorized SQL reads without bypassing private-group checks or mutation fences', async () => {
        const sequelize = new Sequelize({...databaseConfig, logging: false} as any);
        let api, releaseWriters;
        const held = new Promise<void>(resolve => { releaseWriters = resolve; });
        let entered = 0, allEntered;
        const ready = new Promise<void>(resolve => { allEntered = resolve; });
        const port = await new Promise<number>(resolve => {
            const server = net.createServer();
            server.listen(0, '127.0.0.1', () => {
                const address = server.address() as net.AddressInfo;
                server.close(() => resolve(address.port));
            });
        });
        const app: any = {
            config: {}, ms: {database: {sequelize}},
            getUserByApiToken: async token => ({user: token === 'owner' ? {id: 7} : null, apiKey: {id: 1}}),
            runWithApiKey: (_key, run) => run()
        };
        const writers = Array.from({length: 10}, () => withStorageFence(app, 'shared', async () => {
            entered++;
            if (entered === 10) {
                allEntered();
            }
            await held;
        }));
        let mutation;
        try {
            await Promise.race([ready, Promise.all(writers)]);
            api = await apiModule(app, {port, host: '127.0.0.1', registerRoutes: async (_app, module) => {
                app.ms.api = module;
                registerGroupApi(app, {
                    getGroupByParams: async () => ({id: 11, isPublic: false}),
                    assertGroupReadable: async userId => {
                        if (userId !== 7) {
                            throw new Error('not_permitted');
                        }
                    }
                } as any);
                module.onPost('writer-probe', async (_req, res) => res.send({ok: true}));
            }});
            const base = `http://127.0.0.1:${api.port}`;
            const post = (path, token?) => fetch(base + '/v1/' + path, {
                method: 'POST', headers: {'content-type': 'application/json', ...(token ? {authorization: `Bearer ${token}`} : {})},
                body: '{"id":11}', signal: AbortSignal.timeout(2000)
            });
            let mutationFinished = false;
            mutation = post('writer-probe').then(response => { mutationFinished = true; return response; });
            // A failing regression must still release writers before reporting transport errors.
            void mutation.catch(() => {});
            const authorized = await post('group/get', 'owner');
            assert.equal(authorized.status, 200);
            assert.equal((await authorized.json()).id, 11);
            const forbidden = await post('group/get');
            assert.equal(forbidden.status, 403);
            await forbidden.arrayBuffer();
            const invalid = await post('group/get', 'invalid');
            assert.equal(invalid.status, 401);
            await invalid.arrayBuffer();
            assert.equal(mutationFinished, false, 'mutations still queue behind the saturated writer pool');
            releaseWriters();
            const resumed = await mutation;
            assert.equal(resumed.status, 200);
            await resumed.arrayBuffer();
        } finally {
            releaseWriters();
            await Promise.allSettled(writers);
            await mutation?.catch(() => {});
            await api?.stop();
            await stopStorageFence(app);
            await sequelize.close();
        }
    });
});
