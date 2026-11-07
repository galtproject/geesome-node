import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {Sequelize, QueryTypes} from 'sequelize';
import config from '../app/modules/database/config.js';
import {withStorageControlTaskLock, withStorageTaskLock, stopStorageFence} from '../app/storageLifecycle.js';

describe('bounded storage control locks', function () {
    this.timeout(15000);
    let sequelize, app;
    before(async () => {
        sequelize = new Sequelize(config.database, config.username, config.password,
            {...config, logging: false, pool: {max: 1, min: 0, acquire: 2000}});
        app = {ms: {database: {sequelize}}};
    });
    after(async () => {
        await stopStorageFence(app);
        await sequelize.close();
    });

    it('runs concurrent different roots and same-root nesting with one application SQL connection', async () => {
        const results = await Promise.all(Array.from({length: 4}, (_, index) => {
            const identity = 'control-' + randomUUID();
            return withStorageControlTaskLock(app, identity, async () => {
                await withStorageControlTaskLock(app, identity, () => sequelize.query('SELECT 1', {type: QueryTypes.SELECT}));
                await assert.rejects(() => withStorageControlTaskLock(app, identity + ':different', async () => {}),
                    /storage_control_lock_nesting_forbidden/);
                return index;
            });
        }));
        assert.deepEqual(results, [0, 1, 2, 3]);
    });

    it('refuses a concurrent same-root claim and releases the lock after an exception', async () => {
        const identity = 'control-' + randomUUID();
        let entered;
        const ready = new Promise(resolve => {entered = resolve;});
        let release;
        const waiting = new Promise(resolve => {release = resolve;});
        const first = withStorageControlTaskLock(app, identity, async () => {
            entered();
            await waiting;
        });
        await ready;
        try {
            await assert.rejects(() => withStorageControlTaskLock(app, identity, async () => {}), {code: 'storage_control_busy'});
        } finally {
            release();
            await first;
        }
        await assert.rejects(() => withStorageControlTaskLock(app, identity, async () => {throw Error('test-control-error');}),
            /test-control-error/);
        assert.equal(await withStorageControlTaskLock(app, identity, async () => 'released'), 'released');
    });

    it('fails closed on a lost advisory session and permits a fresh claim afterward', async () => {
        const identity = 'control-' + randomUUID();
        const key = createHash('sha256').update(identity).digest().readInt32BE(0) >>> 0;
        await assert.rejects(() => withStorageControlTaskLock(app, identity, async () => {
            const rows = await sequelize.query('SELECT pid FROM pg_locks WHERE locktype=\'advisory\' AND classid=17421 AND objid=:key',
                {replacements: {key}, type: QueryTypes.SELECT});
            assert.equal(rows.length, 1);
            await sequelize.query('SELECT pg_terminate_backend(:pid)', {replacements: {pid: rows[0].pid}});
            await new Promise(resolve => setTimeout(resolve, 25));
        }), /storage_control_lock_lost/);
        assert.equal(await withStorageControlTaskLock(app, identity, async () => 'reclaimed'), 'reclaimed');
    });

    it('shares the original queue lock namespace without reserving an application SQL connection', async () => {
        const identity = 'queue-' + randomUUID();
        await withStorageTaskLock(app, identity, async () => {
            await assert.rejects(() => withStorageControlTaskLock(app, identity, async () => {}, {taskLockNamespace: true}),
                /image_render_in_process/);
        });
        await withStorageControlTaskLock(app, identity,
            () => sequelize.query('SELECT 1', {type: QueryTypes.SELECT}), {taskLockNamespace: true});
    });
});
