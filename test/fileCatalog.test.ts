/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from "assert";
import IGeesomeFileCatalogModule, {FileCatalogItemType} from "../app/modules/fileCatalog/interface.js";
import {ContentView, CorePermissionName} from "../app/modules/database/interface.js";
import {IGeesomeApp} from "../app/interface.js";
import {PostStatus} from "../app/modules/group/interface.js";

function isUniqueConstraintError(error: any) {
	assert.equal(error.name, 'SequelizeUniqueConstraintError');
	return true;
}

describe("app", function () {
	this.timeout(60000);

	let app: IGeesomeApp, fileCatalog: IGeesomeFileCatalogModule;

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';

		try {
			app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7771});
			await app.flushDatabase();

			await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
			const testUser = await app.registerUser({
				email: 'user@user.com',
				name: 'user',
				password: 'user',
				permissions: [CorePermissionName.UserAll]
			});
			await app.ms.group.createGroup(testUser.id, {
				name: 'test',
				title: 'Test'
			});
			fileCatalog = app.ms['fileCatalog'] as IGeesomeFileCatalogModule;
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it("enforces active file catalog path uniqueness per user and parent", async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const otherUser = await app.registerUser({
			email: 'other@user.com',
			name: 'other',
			password: 'other',
			permissions: [CorePermissionName.UserAll]
		});

		const rootFolder = await fileCatalog.createUserFolder(testUser.id, null, 'shared');
		await assert.rejects(
			() => fileCatalog.createUserFolder(testUser.id, null, 'shared'),
			isUniqueConstraintError
		);

		await fileCatalog.createUserFolder(otherUser.id, null, 'shared');
		await fileCatalog.updateFileCatalogItem(testUser.id, rootFolder.id, {isDeleted: true});

		const recreatedRootFolder = await fileCatalog.createUserFolder(testUser.id, null, 'shared');
		const childFolder = await fileCatalog.createUserFolder(testUser.id, recreatedRootFolder.id, 'nested');
		await assert.rejects(
			() => fileCatalog.addFileCatalogItem({
				name: childFolder.name,
				type: FileCatalogItemType.File,
				position: 2,
				parentItemId: recreatedRootFolder.id,
				userId: testUser.id
			}),
			isUniqueConstraintError
		);
	});

	it("updates an existing file catalog path instead of adding duplicate active items", async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const firstContent = await app.ms.content.saveData(testUser.id, 'first', 'file.txt');
		const secondContent = await app.ms.content.saveData(testUser.id, 'second', 'file.txt');

		const firstFileItem = await fileCatalog.saveContentByPath(testUser.id, '/race/file.txt', firstContent.id);
		const secondFileItem = await fileCatalog.saveContentByPath(testUser.id, '/race/file.txt', secondContent.id);
		const activePathItems = await fileCatalog.getFileCatalogItems(
			testUser.id,
			secondFileItem.parentItemId,
			FileCatalogItemType.File,
			'file.txt'
		);

		assert.equal(firstFileItem.id, secondFileItem.id);
		assert.equal(secondFileItem.contentId, secondContent.id);
		assert.equal(activePathItems.total, 1);
	});

	it("keeps content rows that are still referenced by posts when deleting a catalog item", async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const adminUser = (await app.ms.database.getAllUserList('admin'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(adminUser.id, 'test').then(r => r.list))[0];
		const content = await app.ms.content.saveData(testUser.id, 'Hello post', 'post.md', {
			mimeType: 'text/markdown'
		});
		const fileItem = await fileCatalog.saveContentByPath(testUser.id, '/post.md', content.id);

		await app.ms.group.createPost(testUser.id, {
			contents: [{id: content.id, view: ContentView.Attachment}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});

		await fileCatalog.deleteFileCatalogItem(testUser.id, fileItem.id, {deleteContent: true});

		const gotContent = await app.ms.database.getContent(content.id);
		assert.equal(!!gotContent, true);
		assert.equal(await fileCatalog.getFileCatalogItem(fileItem.id), null);
	});

	it("keeps pinned content rows and physical storage when deleting a catalog item", async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const content = await app.ms.content.saveData(testUser.id, 'Pinned body', 'pinned.txt', {
			mimeType: 'text/plain'
		});
		const fileItem = await fileCatalog.saveContentByPath(testUser.id, '/pinned.txt', content.id);

		await app.ms.database.updateContent(content.id, {isPinned: true});
		await fileCatalog.deleteFileCatalogItem(testUser.id, fileItem.id, {deleteContent: true});

		const gotContent = await app.ms.database.getContent(content.id);
		assert.equal(!!gotContent, true);
		assert.equal(await app.ms.storage.getFileData(content.storageId), 'Pinned body');
		assert.equal(await fileCatalog.getFileCatalogItem(fileItem.id), null);
	});

	it("keeps physical storage when the canonical storage object is pinned", async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const content = await app.ms.content.saveData(testUser.id, 'Canonical pinned body', 'canonical-pinned.txt', {
			mimeType: 'text/plain'
		});
		const fileItem = await fileCatalog.saveContentByPath(testUser.id, '/canonical-pinned.txt', content.id);
		const extraCatalogItems = await fileCatalog.getFileCatalogItemsByContent(testUser.id, content.id, FileCatalogItemType.File);

		await app.ms.database.markStorageObjectPinnedByContent(content);
		await Promise.all(extraCatalogItems
			.filter((item) => item.id !== fileItem.id)
			.map((item) => fileCatalog.deleteFileCatalogItem(testUser.id, item.id)));
		await fileCatalog.deleteFileCatalogItem(testUser.id, fileItem.id, {deleteContent: true});

		assert.equal(await app.ms.database.getContent(content.id), null);
		assert.equal(await app.ms.storage.getFileData(content.storageId), 'Canonical pinned body');
		assert.equal(await fileCatalog.getFileCatalogItem(fileItem.id), null);
	});

	it("keeps physical storage when derived rows or static ids reference the same storage id", async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const content = await app.ms.content.saveData(testUser.id, 'Derived storage ref body', 'derived-ref.txt', {
			mimeType: 'text/plain'
		});
		const fileItem = await fileCatalog.saveContentByPath(testUser.id, '/derived-ref.txt', content.id);
		const extraCatalogItems = await fileCatalog.getFileCatalogItemsByContent(testUser.id, content.id, FileCatalogItemType.File);

		await (app.ms['staticSiteGenerator'] as any).createDbStaticSite({
			userId: testUser.id,
			entityType: 'content-list',
			entityId: 'derived-ref',
			name: 'derived-ref',
			title: 'Derived ref',
			options: '{}',
			storageId: content.storageId
		});
		await Promise.all(extraCatalogItems
			.filter((item) => item.id !== fileItem.id)
			.map((item) => fileCatalog.deleteFileCatalogItem(testUser.id, item.id)));

		const refs = await app.ms.database.countStorageIdReferences(content.storageId, content.id);
		assert.equal(refs.derivedStorageRefs, 1);

		await fileCatalog.deleteFileCatalogItem(testUser.id, fileItem.id, {deleteContent: true});

		assert.equal(await app.ms.database.getContent(content.id), null);
		assert.equal(await app.ms.storage.getFileData(content.storageId), 'Derived storage ref body');
		assert.equal(await fileCatalog.getFileCatalogItem(fileItem.id), null);

		const staticRefContent = await app.ms.content.saveData(testUser.id, 'Static id ref body', 'static-ref.txt', {
			mimeType: 'text/plain'
		});
		const staticRefFileItem = await fileCatalog.saveContentByPath(testUser.id, '/static-ref.txt', staticRefContent.id);
		const staticRefExtraCatalogItems = await fileCatalog.getFileCatalogItemsByContent(testUser.id, staticRefContent.id, FileCatalogItemType.File);
		const staticId = await app.ms.staticId.createStaticAccountId(testUser.id, 'static-ref-target');
		const StaticIdBinding = app.ms.database.sequelize.model('staticIdBinding') as any;

		await app.ms.staticId.bindToStaticId(testUser.id, staticRefContent.storageId, staticId);
		await Promise.all(staticRefExtraCatalogItems
			.filter((item) => item.id !== staticRefFileItem.id)
			.map((item) => fileCatalog.deleteFileCatalogItem(testUser.id, item.id)));

		let staticRefs = await app.ms.database.countStorageIdReferences(staticRefContent.storageId, staticRefContent.id);
		assert.equal(staticRefs.derivedStorageRefs, 1);

		await StaticIdBinding.destroy({where: {staticId}});
		staticRefs = await app.ms.database.countStorageIdReferences(staticRefContent.storageId, staticRefContent.id);
		assert.equal(staticRefs.derivedStorageRefs, 1);

		await fileCatalog.deleteFileCatalogItem(testUser.id, staticRefFileItem.id, {deleteContent: true});

		assert.equal(await app.ms.database.getContent(staticRefContent.id), null);
		assert.equal(await app.ms.storage.getFileData(staticRefContent.storageId), 'Static id ref body');
		assert.equal(await fileCatalog.getFileCatalogItem(staticRefFileItem.id), null);
	});

	it("should create directory by files manifests correctly", async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];

		const indexHtml = '<h1>Hello world</h1>';
		const fileName = 'index.html';
		const foldersPath = '/1/2/3/';

		const indexHtmlContent = await app.ms.content.saveData(testUser.id, indexHtml, fileName);

		const resultFolder = await fileCatalog.saveManifestsToFolder(testUser.id, foldersPath, [{
			manifestStorageId: indexHtmlContent.manifestStorageId
		}]);
		let publishFolderResult = await fileCatalog.publishFolder(testUser.id, resultFolder.id,);

		let gotIndexHtmlByFolder = await app.ms.storage.getFileData(publishFolderResult.storageId + '/' + fileName);
		assert.equal(gotIndexHtmlByFolder, indexHtml);
	});

	it("publishes every child file beyond the default list page", async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const folder = await fileCatalog.createUserFolder(testUser.id, null, 'bulk');
		const fileCount = 25;

		for (let i = 0; i < fileCount; i++) {
			const name = `file-${i}.txt`;
			await fileCatalog.saveDataToPath(testUser.id, `content-${i}`, `/bulk/${name}`);
		}

		const publishFolderResult = await fileCatalog.publishFolder(testUser.id, folder.id);

		const firstFile = await app.ms.storage.getFileData(publishFolderResult.storageId + '/file-0.txt');
		const lastFile = await app.ms.storage.getFileData(publishFolderResult.storageId + '/file-24.txt');
		assert.equal(firstFile, 'content-0');
		assert.equal(lastFile, 'content-24');
	});

	it("should file catalog working properly", async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];

		const indexHtml = '<h1>Hello world</h1>';
		const fileName = 'index.html';
		const foldersPath = '/1/2/3/';
		const filePath = foldersPath + fileName;

		const indexHtmlContent = await app.ms.content.saveData(testUser.id, indexHtml, fileName);

		console.log('1 saveContentByPath');
		const indexHtmlFileItem = await fileCatalog.saveContentByPath(testUser.id, filePath, indexHtmlContent.id);
		assert.equal(indexHtmlFileItem.name, fileName);

		let parentFolderId = indexHtmlFileItem.parentItemId;
		let level = 3;

		while (parentFolderId) {
			const parentFolder = await fileCatalog.getFileCatalogItem(parentFolderId);
			assert.equal(parentFolder.name, level.toString());
			level -= 1;
			parentFolderId = parentFolder.parentItemId;
		}

		console.log('2 getContentByPath');
		const foundIndexHtmlFileContent = await fileCatalog.getContentByPath(testUser.id, filePath);

		assert.equal(foundIndexHtmlFileContent.id, indexHtmlFileItem.content.id);

		console.log('3 getFileData');
		const gotIndexHtml = await app.ms.storage.getFileData(indexHtmlFileItem.content.storageId);

		assert.equal(gotIndexHtml, indexHtml);

		console.log('4 publishFolder');
		let publishFolderResult = await fileCatalog.publishFolder(testUser.id, indexHtmlFileItem.parentItemId, {bindToStatic: true});

		console.log('5 resolveStaticId');
		const resolvedStorageId = await app.ms.staticId.resolveStaticId(publishFolderResult.staticId);

		assert.equal(publishFolderResult.storageId, resolvedStorageId);

		console.log('6 getFileData');
		let gotIndexHtmlByFolder = await app.ms.storage.getFileData(publishFolderResult.storageId + '/' + fileName);

		assert.equal(gotIndexHtmlByFolder, indexHtml);

		try {
			await app.ms.storage.getFileData(publishFolderResult.storageId + '/incorrect' + fileName);
			assert.equal(true, false);
		} catch (e) {
			assert.match(e.message, /file does not exist|no link named/);
		}

		console.log('7 getFileCatalogItemByPath');
		const firstFolder = await fileCatalog.getFileCatalogItemByPath(testUser.id, '/1/', FileCatalogItemType.Folder);

		console.log('8 publishFolder');
		publishFolderResult = await fileCatalog.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});

		console.log('9 getFileData');
		gotIndexHtmlByFolder = await app.ms.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName);

		assert.equal(gotIndexHtmlByFolder, indexHtml);

		let indexHtml2 = '<h1>Hello world 2</h1>';
		const fileName2 = 'index2.json';
		const filePath2 = foldersPath + fileName2;
		await fileCatalog.saveDataToPath(testUser.id, indexHtml2, filePath2);

		try {
			await app.ms.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName2);
			assert.equal(true, false);
		} catch (e) {
			assert.match(e.message, /file does not exist|no link named/);
		}

		console.log('10 publishFolder');
		publishFolderResult = await fileCatalog.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});
		console.log('11 getFileData');
		gotIndexHtmlByFolder = await app.ms.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName2);
		assert.equal(gotIndexHtmlByFolder, indexHtml2);

		indexHtml2 = '<h1>Hello world 3</h1>';
		console.log('12 saveData');
		await fileCatalog.saveDataToPath(testUser.id, indexHtml2, filePath2);
		publishFolderResult = await fileCatalog.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});
		gotIndexHtmlByFolder = await app.ms.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName2);
		assert.equal(gotIndexHtmlByFolder, indexHtml2);

		indexHtml2 = '<h1>Hello world 2</h1>';
		console.log('13 saveData');
		await fileCatalog.saveDataToPath(testUser.id, indexHtml2, filePath2);
		publishFolderResult = await fileCatalog.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});
		gotIndexHtmlByFolder = await app.ms.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName2);
		assert.equal(gotIndexHtmlByFolder, indexHtml2);
	});
});
