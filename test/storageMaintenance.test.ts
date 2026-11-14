import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import {storageMaintenanceSession} from '../app/storageMaintenance.js';
import {withStorageFence, stopStorageFence} from '../app/storageLifecycle.js';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function deferred() {
    let resolve;
    const promise = new Promise<void>(done => {resolve = done;});
    return {promise, resolve: () => resolve()};
}

describe('scheduled storage maintenance fence', function () {
    this.timeout(15000);
    let sequelize, writer, maintenance, input, output, messages: string;
    beforeEach(() => {
        sequelize = new Sequelize({...config, logging: false} as any);
        writer = {ms: {database: {sequelize}}};
        maintenance = {ms: {database: {sequelize}}};
        input = new PassThrough();
        output = new PassThrough();
        messages = '';
        output.on('data', data => {messages += data.toString();});
    });
    afterEach(async () => {
        input.end();
        await Promise.all([stopStorageFence(writer), stopStorageFence(maintenance)]);
        await sequelize.close();
    });
    async function message(expected: string) {
        for (let attempt = 0; attempt < 100 && !messages.includes(expected); attempt++) {
            await pause(10);
        }
        assert.ok(messages.includes(expected), `missing ${expected}; received ${messages}`);
    }

    it('drains active writers, rejects new writes, and holds through readiness checks', async () => {
        const entered = deferred(), release = deferred();
        const active = withStorageFence(writer, 'shared', async () => {entered.resolve(); await release.promise;});
        await entered.promise;
        const session = storageMaintenanceSession(maintenance, input, output, {drainTimeoutMs: 3000});
        await pause(60);
        assert.equal(messages, '', 'no restart acknowledgement while an active writer holds the fence');
        release.resolve();
        await active;
        await message('READY\n');
        await assert.rejects(withStorageFence(writer, 'shared', async () => assert.fail('must not execute'), {wait: false}),
            (error: any) => error.code === 'storage_maintenance_busy');
        input.write('CHECK\n');
        await message('HELD\n');
        input.write('RELEASE\n');
        await session;
        assert.ok(messages.endsWith('RELEASED\n'));
        await withStorageFence(writer, 'shared', async () => undefined);
    });

    it('never acknowledges maintenance after drain timeout', async () => {
        const entered = deferred(), release = deferred();
        const active = withStorageFence(writer, 'shared', async () => {entered.resolve(); await release.promise;});
        await entered.promise;
        try {
            await assert.rejects(storageMaintenanceSession(maintenance, input, output, {drainTimeoutMs: 40}));
            assert.equal(messages, '');
        } finally {
            release.resolve();
            await active;
        }
        await withStorageFence(writer, 'exclusive', async () => undefined);
    });

    it('disconnect before draining cancels admission and cannot acquire a late lock', async () => {
        const entered = deferred(), release = deferred();
        const active = withStorageFence(writer, 'shared', async () => {entered.resolve(); await release.promise;});
        await entered.promise;
        const session = assert.rejects(storageMaintenanceSession(maintenance, input, output, {drainTimeoutMs: 3000}));
        input.end();
        await session;
        release.resolve();
        await active;
        assert.equal(messages, '');
        await withStorageFence(writer, 'exclusive', async () => undefined);
    });

    it('disconnect after acquisition releases the fence without a success receipt', async () => {
        const session = assert.rejects(storageMaintenanceSession(maintenance, input, output), /disconnected/);
        await message('READY\n');
        input.end();
        await session;
        assert.equal(messages, 'READY\n');
        await withStorageFence(writer, 'exclusive', async () => undefined);
    });

    it('lost database session never confirms a CHECK or successful release', async () => {
        const session = assert.rejects(storageMaintenanceSession(maintenance, input, output), /storage_fence_lost/);
        await message('READY\n');
        await sequelize.query(`SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype='advisory'
            AND classid=17419 AND objid=9301 AND mode='ExclusiveLock' AND granted`);
        await session;
        assert.equal(messages, 'READY\n');
    });

    it('idle host and invalid protocol fail closed and free the lock', async () => {
        await assert.rejects(storageMaintenanceSession(maintenance, input, output, {idleTimeoutMs: 40}), /idle_timeout/);
        await withStorageFence(writer, 'exclusive', async () => undefined);
        input = new PassThrough();
        messages = '';
        const session = assert.rejects(storageMaintenanceSession(maintenance, input, output), /command_invalid/);
        await message('READY\n');
        input.write('RESTART WITHOUT CHECK\n');
        await session;
        assert.equal(messages, 'READY\n');
    });
});
