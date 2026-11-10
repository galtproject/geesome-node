import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes, randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import models from '../app/modules/asyncOperation/models.js';
import {getModule} from '../app/modules/asyncOperation/index.js';
import {DurableUploads, uploadStagingPolicy} from '../app/modules/content/durableUploads.js';
import {withStorageFence, stopStorageFence} from '../app/storageLifecycle.js';
import {Readable} from 'node:stream';

function multipart(bytes, fields: any = {}) {
    const boundary = `test-${randomUUID()}`;
    const parts = Object.entries({async: 'true', ...fields}).map(([key, value]) =>
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`),
        bytes, Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    const stream: any = Readable.from(body);
    stream.complete = true;
    return {stream, user: {id: 7}, apiKey: {id: 13}, headers: {'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length)}};
}

// Uses disposable PostgreSQL in the standard test harness; storage writes are
// controlled at the real PostgreSQL fence so races do not depend on timing.
describe('durable upload staging across storage maintenance', function () {
    this.timeout(15000);
    let sequelize, app: any, uploads: DurableUploads, directory;
    let calls, failImport, revoked, savedOptions, uploadedBytes;
    before(async () => {
        sequelize = new Sequelize({...databaseConfig, pool: {max: 4, min: 0, acquire: 3000, idle: 1000}, logging: false} as any);
        const model = await models(sequelize);
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'durable-uploads-'));
        app = {ms: {database: {sequelize, getApiKey: async () => ({id: 13, userId: 7, scopes: ['content:write']})}},
            checkUserCan: async () => {
                if (revoked) {
                    throw Error('not_permitted');
                }
            },
            getUserLimitRemained: async () => null, runWithApiKey: (_key, callback) => callback()};
        uploads = new DurableUploads(app, {...uploadStagingPolicy(), directory, maxFileBytes: 1024, maxBytes: 2048,
            userBytes: 2048, minFreeBytes: 1, maxJobs: 10});
        app.ms.content = {saveData: async (_user, stream, _filename, options) => {
            calls++;
            savedOptions = options;
            const chunks = [];
            for await (const chunk of stream) { chunks.push(chunk); }
            uploadedBytes = Buffer.concat(chunks);
            if (failImport) {
                throw Error('connection_lost_after_import');
            }
            return {id: 123, storageId: 'fixture'};
        }};
        app.ms.asyncOperation = getModule(app, model);
    });
    beforeEach(async () => {
        calls = 0; failImport = false; revoked = false;
        await uploads.Queue.destroy({where: {module: 'durable-upload'}});
        await uploads.Operation.destroy({where: {module: 'durable-upload'}});
        await fs.rm(directory, {recursive: true, force: true});
        await fs.mkdir(directory, {recursive: true});
    });
    after(async () => {
        await app.ms.asyncOperation.stop();
        await stopStorageFence(app);
        await sequelize.close();
        await fs.rm(directory, {recursive: true, force: true});
    });
    it('accepts and polls one durable receipt during exclusive GC, then imports original bytes and destination', async () => {
        let release, entered;
        const held = new Promise<void>(resolve => { release = resolve; });
        const ready = new Promise<void>(resolve => { entered = resolve; });
        const gc = withStorageFence(app, 'exclusive', async () => { entered(); await held; });
        await ready;
        const bytes = randomBytes(501);
        try {
            const accepted = await uploads.accept(multipart(bytes, {path: '/gallery/crop.png', folderId: '42'}));
            assert.ok(accepted.receipt.asyncOperationId);
            const row = await uploads.Operation.findByPk(accepted.receipt.asyncOperationId);
            assert.equal(row.inProcess, true);
            assert.equal(JSON.parse(row.output).upload.phase, 'staged');
            await uploads.processQueue();
            assert.equal(calls, 0);
            const queue = await uploads.Queue.findOne({where: {asyncOperationId: row.id}});
            assert.deepEqual(await fs.readFile(uploads.file(JSON.parse(queue.inputJson).fileId)), bytes);
            release(); await gc;
            await uploads.processQueue();
            assert.equal(calls, 1);
            assert.deepEqual(uploadedBytes, bytes);
            assert.equal(savedOptions.path, '/gallery/crop.png');
            assert.equal(savedOptions.folderId, '42');
            await row.reload();
            assert.equal(row.inProcess, false);
            assert.equal(row.contentId, 123);
            assert.equal(JSON.parse(row.output).content.id, 123);
            assert.deepEqual(await fs.readdir(directory), []);
        } finally { release(); await gc; }
    });
    it('accepts ten concurrent small multipart uploads without reserving ten maximum-size files', async () => {
        const previous = {...uploads.policy};
        Object.assign(uploads.policy, {maxFileBytes: 2000 * 1024 ** 2, maxBytes: 8192 * 1024 ** 2,
            userBytes: 4096 * 1024 ** 2, maxJobs: 20});
        try {
            const accepted = await Promise.all(Array.from({length: 10}, () => uploads.accept(multipart(randomBytes(30)))));
            assert.equal(new Set(accepted.map(item => item.receipt.asyncOperationId)).size, 10);
            await uploads.processQueue();
            assert.equal(calls, 10);
        } finally { Object.assign(uploads.policy, previous); }
    });
    it('accepts thirty receivers with a four-connection SQL pool and database-backed quota reads', async () => {
        const previous = {...uploads.policy};
        const quota = app.getUserLimitRemained;
        Object.assign(uploads.policy, {maxBytes: 1024 * 1024, userBytes: 1024 * 1024, maxJobs: 50});
        app.getUserLimitRemained = async () => {
            await sequelize.query('SELECT 1');
            return null;
        };
        try {
            const accepted = await Promise.all(Array.from({length: 30}, () => uploads.accept(multipart(randomBytes(10)))));
            assert.equal(accepted.length, 30);
            assert.equal(new Set(accepted.map(item => item.receipt.asyncOperationId)).size, 30);
        } finally { Object.assign(uploads.policy, previous); app.getUserLimitRemained = quota; }
    });
    it('extends unknown-length reservations before writing additional bytes', async () => {
        const previous = {...uploads.policy};
        Object.assign(uploads.policy, {maxFileBytes: 32 * 1024 ** 2, maxBytes: 64 * 1024 ** 2, userBytes: 64 * 1024 ** 2});
        try {
            const req = multipart(randomBytes(17 * 1024 ** 2));
            delete req.headers['content-length'];
            const accepted = await uploads.accept(req);
            const queue = await uploads.Queue.findOne({where: {asyncOperationId: accepted.receipt.asyncOperationId}});
            const input = JSON.parse(queue.inputJson);
            assert.equal(input.reservedBytes, 17 * 1024 ** 2);
            assert.equal((await fs.stat(uploads.file(input.fileId))).size, input.reservedBytes);
        } finally { Object.assign(uploads.policy, previous); }
    });
    it('does not resurrect a released reservation when a late receive-budget extension arrives', async () => {
        const pending = await uploads.reserve(7, 13, '1');
        await uploads.removeFile(pending.queue, pending.input);
        await assert.rejects(uploads.extendReservation(pending.queue, pending.input, 200), /already closed/);
        await pending.queue.reload();
        assert.equal(JSON.parse(pending.queue.inputJson).reservedBytes, 0);
        assert.equal(pending.queue.isWaiting, false);
    });
    it('aborts while a streaming budget check is pending without reviving released quota', async () => {
        const original = uploads.extendReservation.bind(uploads);
        let enter, release;
        const entered = new Promise<void>(resolve => { enter = resolve; });
        const held = new Promise<void>(resolve => { release = resolve; });
        let late;
        uploads.extendReservation = async (...args: any[]) => {
            enter();
            await held;
            late = original(args[0], args[1], args[2]);
            return late;
        };
        try {
            const req = multipart(randomBytes(200));
            req.headers['content-length'] = '1';
            const accepting = uploads.accept(req);
            await entered;
            req.stream.emit('aborted');
            await assert.rejects(accepting, /aborted/);
            release();
            await new Promise(resolve => setTimeout(resolve, 30));
            await late?.catch(() => {});
            const queue = await uploads.Queue.findOne({where: {module: 'durable-upload'}});
            assert.equal(JSON.parse(queue.inputJson).reservedBytes, 0);
            assert.deepEqual(await fs.readdir(directory), []);
        } finally { release(); uploads.extendReservation = original; }
    });
    it('recovers staged bytes after restart with the same receipt', async () => {
        const accepted = await uploads.accept(multipart(randomBytes(30)));
        await app.ms.asyncOperation.closeAllAsyncOperation();
        const restarted = new DurableUploads(app, uploads.policy);
        await restarted.recover();
        const row = await uploads.Operation.findByPk(accepted.receipt.asyncOperationId);
        assert.equal(row.inProcess, true);
        assert.equal(row.errorType, null);
        await restarted.processQueue();
        await row.reload();
        assert.equal(row.contentId, 123);
        assert.equal(calls, 1);
    });
    it('never replays interrupted or failed imports and keeps their bytes charged against staging capacity', async () => {
        const accepted = await uploads.accept(multipart(randomBytes(50)));
        failImport = true;
        await uploads.processQueue();
        const row = await uploads.Operation.findByPk(accepted.receipt.asyncOperationId);
        assert.equal(row.inProcess, false);
        assert.equal(row.errorType, 'upload_outcome_unknown');
        assert.equal(JSON.parse(row.output).upload.retained, true);
        await uploads.recover(); await uploads.processQueue();
        assert.equal(calls, 1);
        uploads.policy.maxBytes = 50;
        try {
            await assert.rejects(uploads.accept(multipart(randomBytes(40))), /quota exhausted/);
        } finally { uploads.policy.maxBytes = 2048; }
    });
    it('quarantines an importing restart checkpoint without a second write', async () => {
        const accepted = await uploads.accept(multipart(randomBytes(30)));
        const row = await uploads.Operation.findByPk(accepted.receipt.asyncOperationId);
        await row.update({output: JSON.stringify({upload: {phase: 'importing'}})});
        await uploads.recover(); await uploads.processQueue();
        await row.reload();
        assert.equal(row.errorType, 'upload_outcome_unknown');
        assert.equal(calls, 0);
        assert.equal((await fs.readdir(directory)).length, 1);
    });
    it('restores a confirmed import checkpoint without replay, including after reservation release', async () => {
        const accepted = await uploads.accept(multipart(randomBytes(30)));
        const row = await uploads.Operation.findByPk(accepted.receipt.asyncOperationId);
        await row.update({output: JSON.stringify({content: {id: 555}, upload: {phase: 'imported'}})});
        await uploads.recover();
        await row.reload();
        assert.equal(row.inProcess, false);
        assert.equal(row.contentId, 555);
        assert.equal(calls, 0);
        assert.deepEqual(await fs.readdir(directory), []);
        await uploads.recover();
        assert.equal(calls, 0);
    });
    it('keeps unknown originals and quota metadata beyond ordinary operation retention', async () => {
        const accepted = await uploads.accept(multipart(randomBytes(30)));
        failImport = true;
        await uploads.processQueue();
        await app.ms.asyncOperation.cleanupFinishedAsyncOperations({cutoff: new Date(Date.now() + 100000)});
        assert.ok(await uploads.Operation.findByPk(accepted.receipt.asyncOperationId));
        assert.equal((await fs.readdir(directory)).length, 1);
    });
    it('cleans an interrupted receiving reservation without executing it', async () => {
        const pending = await uploads.reserve(7, 13);
        await fs.mkdir(path.dirname(uploads.file(pending.input.fileId)), {recursive: true});
        await fs.writeFile(path.join(path.dirname(uploads.file(pending.input.fileId)), 'partial'), 'partial');
        await uploads.recover();
        await pending.operation.reload();
        assert.equal(pending.operation.errorType, 'upload_not_accepted');
        assert.deepEqual(await fs.readdir(directory), []);
    });
    it('honors queued cancellation and permission revocation before importing', async () => {
        const accepted = await uploads.accept(multipart(randomBytes(30)));
        await app.ms.asyncOperation.cancelAsyncOperation(7, accepted.receipt.asyncOperationId);
        await uploads.processQueue();
        assert.equal(calls, 0);
        assert.deepEqual(await fs.readdir(directory), []);
        const next = await uploads.accept(multipart(randomBytes(30)));
        revoked = true;
        await uploads.processQueue();
        assert.equal(calls, 0);
        assert.deepEqual(await fs.readdir(directory), []);
        const row = await uploads.Operation.findByPk(next.receipt.asyncOperationId);
        assert.match(row.errorMessage, /not_permitted/);
    });
    it('rejects oversized multipart bytes and releases reservation and temporary files', async () => {
        await assert.rejects(uploads.accept(multipart(randomBytes(2048))), /size limit/);
        assert.equal(await uploads.Queue.count({where: {module: 'durable-upload', isWaiting: true}}), 0);
        assert.deepEqual(await fs.readdir(directory), []);
    });
    it('rejects changed staged bytes before any storage mutation', async () => {
        const accepted = await uploads.accept(multipart(randomBytes(20)));
        const queue = await uploads.Queue.findOne({where: {asyncOperationId: accepted.receipt.asyncOperationId}});
        await fs.writeFile(uploads.file(JSON.parse(queue.inputJson).fileId), 'tampered');
        await uploads.processQueue();
        assert.equal(calls, 0);
        const row = await uploads.Operation.findByPk(accepted.receipt.asyncOperationId);
        assert.match(row.errorMessage, /integrity/);
        assert.deepEqual(await fs.readdir(directory), []);
    });
});
