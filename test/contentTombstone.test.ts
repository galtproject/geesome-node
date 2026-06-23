import assert from 'node:assert';
import {CorePermissionName} from '../app/modules/database/interface.js';
import {IGeesomeApp} from '../app/interface.js';

describe('content tombstones', function () {
	this.timeout(60000);

	let app: IGeesomeApp;
	let admin;
	let testUser;

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7792});
		await app.flushDatabase();
		admin = await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'}).then(r => r.user);
		testUser = await app.registerUser({
			email: 'content-tombstone@user.com',
			name: 'content-tombstone-user',
			password: 'user',
			permissions: [CorePermissionName.UserAll]
		});
	});

	afterEach(async () => {
		await app.stop();
	});

	it('lists and restores a deleted content tombstone while storage still exists', async () => {
		const content = await app.ms.content.saveData(testUser.id, 'restore tombstone body', 'restore.txt', {
			mimeType: 'text/plain'
		});

		await app.ms.database.deleteContent(content.id);
		const activeContent = await app.ms.database.getContent(content.id);
		const deletedList = await app.ms.content.getDeletedContentList(admin.id, undefined, {limit: 20});

		assert.equal(activeContent, null);
		assert.equal(deletedList.total, 1);
		assert.equal(deletedList.list[0].id, content.id);
		assert.equal(deletedList.list[0].isDeleted, true);

		const restoredContent = await app.ms.content.restoreDeletedContent(admin.id, content.id);
		const activeRestoredContent = await app.ms.database.getContent(content.id);
		const afterRestoreDeletedList = await app.ms.content.getDeletedContentList(admin.id, undefined, {limit: 20});

		assert.equal(restoredContent.id, content.id);
		assert.equal(restoredContent.isDeleted, false);
		assert.equal(restoredContent.deletedAt, null);
		assert.equal(activeRestoredContent.id, content.id);
		assert.equal(afterRestoreDeletedList.total, 0);
	});

	it('refuses to restore a tombstone when a replacement active row uses the same storage id', async () => {
		const content = await app.ms.content.saveData(testUser.id, 'restore conflict body', 'restore-conflict.txt', {
			mimeType: 'text/plain'
		});

		await app.ms.database.deleteContent(content.id);
		const replacementContent = await app.ms.content.saveData(testUser.id, 'restore conflict body', 'restore-conflict-again.txt', {
			mimeType: 'text/plain'
		});

		let thrownError;
		try {
			await app.ms.content.restoreDeletedContent(admin.id, content.id);
		} catch (e) {
			thrownError = e;
		}

		const deletedContent = await app.ms.database.getContent(content.id, {includeDeleted: true});
		const activeContent = await app.ms.database.getContentByStorageAndUserId(content.storageId, testUser.id);

		assert.equal(replacementContent.storageId, content.storageId);
		assert.notEqual(replacementContent.id, content.id);
		assert.equal(thrownError?.message, 'content_restore_storage_conflict');
		assert.equal(thrownError?.code, 409);
		assert.equal(thrownError?.activeContentId, replacementContent.id);
		assert.equal(deletedContent.isDeleted, true);
		assert.equal(activeContent.id, replacementContent.id);
	});
});
