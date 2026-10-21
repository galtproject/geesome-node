import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CorePermissionName} from '../app/modules/database/interface.js';
import {normalizeStorageId} from '../app/modules/archive/index.js';
import {assertArchiveMatchesStorage, readArchive} from './helpers/archive.js';

describe('content archive', function () {
	this.timeout(60000);
	let app, user, otherUser, token, content;
	const origin = `http://127.0.0.1:${process.env.PORT || 7771}/v1`;
	before(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7771});
		await app.flushDatabase();
		await app.setup({name: 'admin', password: 'admin'});
		user = await app.registerUser({name: 'archive-owner', password: 'user', permissions: [CorePermissionName.UserAll]});
		otherUser = await app.registerUser({name: 'archive-reader', password: 'user', permissions: [CorePermissionName.UserAll]});
		token = await app.generateUserApiKey(user.id, {});
		content = await app.ms.content.saveData(user.id, 'Archive bytes: Привет\n', 'example.txt', {mimeType: 'text/plain', waitForPin: true});
	});
	after(async () => { await app?.stop(); });

	it('rejects invalid hashes, paths and non-owned content before creating jobs', async () => {
		for (const value of ['no-cid', content.storageId + '/index.html', '../' + content.storageId, 'QmInvalid']) {
			await assert.rejects(() => app.ms.archive.requestArchive(user.id, value), /invalid_storage_id/);
		}
		await assert.rejects(() => app.ms.archive.requestArchive(otherUser.id, content.storageId), /not_permitted/);
		const response = await fetch(`${origin}/user/archive/${content.storageId}`, {method: 'POST'});
		assert.equal(response.status, 401);
		const readToken = await app.generateUserApiKey(user.id, {scopes: ['operations:read']});
		const denied = await fetch(`${origin}/user/archive/${content.storageId}`, {method: 'POST', headers: {Authorization: `Bearer ${readToken}`}});
		assert.equal(denied.status, 403);
		const invalid = await fetch(`${origin}/archive/not-a-cid`);
		assert.equal(invalid.status, 400);
		const remote = await app.ms.storage.saveFile(Buffer.from('remote-only'));
		await app.ms.database.addContent({userId: user.id, storageId: remote.id, isRemote: true});
		await assert.rejects(() => app.ms.archive.requestArchive(user.id, remote.id), /not_permitted/);

	});

	it('archives a real upload via HTTP and publicly downloads it by the original CID', async () => {
		const response = await fetch(`${origin}/user/archive/${content.storageId}`, {method: 'POST', headers: {Authorization: `Bearer ${token}`}});
		assert.equal(response.status, 202, await response.clone().text());
		const queued = await response.json();
		await app.ms.archive.processQueue();
		const queue = await app.ms.asyncOperation.getUserOperationQueue(user.id, queued.queueId);
		assert.equal(queue.isWaiting, false);
		assert.equal(queue.asyncOperation.errorMessage, null);
		const lookup = await fetch(`${origin}/archive/${content.storageId}`);
		assert.equal(lookup.status, 200);
		const mapping = await lookup.json();
		assert.equal(mapping.originalStorageId, normalizeStorageId(content.storageId));
		const download = await fetch(`${origin}/archive/${content.storageId}/download`);
		assert.equal(download.status, 200);
		assert.equal(download.headers.get('content-type'), 'application/gzip');
		assert.match(download.headers.get('content-disposition'), /attachment; filename=/);
		const bytes = Buffer.from(await download.arrayBuffer());
		assert.deepEqual(bytes, Buffer.from((await app.ms.storage.getFileData(mapping.archivedStorageId)).slice()));
		await assertArchiveMatchesStorage(app.ms.storage, mapping.originalStorageId, await readArchive(bytes));
		assert.equal((await app.ms.archive.requestArchive(user.id, content.storageId)).status, 'completed');
		assert.equal((await app.ms.database.getStorageObjectDeleteSafety(mapping.archivedStorageId)).safeToRemovePhysical, false);
	});

	it('preserves nested files, empty directories, binary bytes and unicode paths', async () => {
		const directory = await fs.mkdtemp(path.join(tmpdir(), 'archive-source-'));
		try {
			await fs.mkdir(path.join(directory, 'empty'));
			await fs.mkdir(path.join(directory, 'nested'));
			await fs.writeFile(path.join(directory, 'nested', 'данные.bin'), Buffer.from([0, 255, 1, 128]));
			await fs.writeFile(path.join(directory, 'zero.txt'), '');
			const saved = await app.ms.storage.saveDirectory(directory);
			await app.ms.database.addContent({userId: user.id, storageId: saved.id, name: 'directory', mimeType: 'application/x-directory'});
			await app.ms.archive.requestArchive(user.id, saved.id);
			await app.ms.archive.processQueue();
			const mapping = await app.ms.archive.getArchive(saved.id);
			const entries = await readArchive(Buffer.from((await app.ms.storage.getFileData(mapping.archivedStorageId)).slice()));
			await assertArchiveMatchesStorage(app.ms.storage, mapping.originalStorageId, entries);
			assert.equal(entries.get(mapping.originalStorageId + '/empty/'), null);
		} finally {
			await fs.rm(directory, {recursive: true, force: true});
		}
	});

	it('records a failed job without a mapping and allows a successful retry', async () => {
		const source = await app.ms.content.saveData(user.id, 'retry archive bytes', 'retry.txt', {mimeType: 'text/plain'});
		const getFileStream = app.ms.storage.getFileStream.bind(app.ms.storage);
		app.ms.storage.getFileStream = async id => {
			if (id === source.storageId) {
				throw new Error('archive_test_read_failed');
			}
			return getFileStream(id);
		};
		let queued;
		try {
			queued = await app.ms.archive.requestArchive(user.id, source.storageId);
			await app.ms.archive.processQueue();
		} finally {
			app.ms.storage.getFileStream = getFileStream;
		}
		assert.equal(await app.ms.archive.getArchive(source.storageId), null);
		const failed = await app.ms.asyncOperation.getUserOperationQueue(user.id, queued.queueId);
		assert.equal(failed.isWaiting, false);
		assert.equal(failed.asyncOperation.errorMessage, 'archive_test_read_failed');
		await app.ms.archive.requestArchive(user.id, source.storageId);
		await app.ms.archive.processQueue();
		assert.ok(await app.ms.archive.getArchive(source.storageId));
	});

	it('returns 404 while no completed mapping exists', async () => {
		const saved = await app.ms.storage.saveFile(Buffer.from('not archived'));
		for (const suffix of ['', '/download']) {
			const response = await fetch(`${origin}/archive/${saved.id}${suffix}`);
			assert.equal(response.status, 404);
		}
	});
});
