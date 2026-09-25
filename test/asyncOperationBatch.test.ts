import assert from 'assert';
import {Op} from 'sequelize';
import {getModule} from '../app/modules/asyncOperation/index.js';
import api from '../app/modules/asyncOperation/api.js';

describe('batch async operation status', () => {
    it('uses one bounded user-scoped query for running and finished records', async () => {
        const rows = [{id: 1, userId: 7, inProcess: true}, {id: 2, userId: 7, inProcess: false, contentId: 31}, {id: 3, userId: 8}];
        let calls = 0;
        const module = getModule({} as any, {UserAsyncOperation: {findAll: async options => {
            calls++;
            assert.deepEqual(options, {where: {userId: 7, id: {[Op.in]: [2, 1, 3, 99]}}, order: [['id', 'ASC']], limit: 100});
            return rows.filter(row => row.userId === options.where.userId && options.where.id[Op.in].includes(row.id));
        }}});
        assert.deepEqual(await module.getAsyncOperations(7, [2, 1, 3, 99, 2]), rows.slice(0, 2));
        assert.equal(calls, 1);
    });

    for (const ids of [undefined, null, {}, [], ['1'], [0], [-1], [1.5], [NaN], [Number.MAX_SAFE_INTEGER + 1], Array(101).fill(1)]) {
        it(`rejects invalid input ${JSON.stringify(ids)} before accessing the database`, async () => {
            const module = getModule({} as any, {});
            await assert.rejects(() => module.getAsyncOperations(7, ids as any), error => error['code'] === 'invalid_operation_ids');
        });
    }

    it('accepts the 100-ID boundary', async () => {
        const module = getModule({} as any, {UserAsyncOperation: {findAll: async () => []}});
        assert.deepEqual(await module.getAsyncOperations(7, Array.from({length: 100}, (_, i) => i + 1)), []);
    });

    it('registers an authenticated scoped route and uses the authenticated user', async () => {
        const routes = {};
        api({ms: {api: {onAuthorizedGet: () => {}, onAuthorizedPost: (path, handler) => {routes[path] = handler;}}}} as any, {
            getAsyncOperations: async (userId, ids) => {
                assert.equal(userId, 7);
                assert.deepEqual(ids, [1]);
                return [{id: 1}];
            }
        } as any);
        const handler = routes['user/get-async-operations'];
        const req = {user: {id: 7}, apiKey: {scopes: ['operations:read']}, body: {ids: [1], userId: 8}};
        let result;
        await handler(req, {send: value => {result = value;}});
        assert.deepEqual(result, {list: [{id: 1}]});
        await assert.rejects(() => handler({...req, apiKey: {scopes: ['assets:write']}}, {}), error => error['code'] === 'insufficient_scope');
    });
});
