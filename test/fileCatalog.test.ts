/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../app/interface";
import {
	CorePermissionName,
} from "../app/modules/database/interface";
import IGeesomeFileCatalogModule, {FileCatalogItemType} from "../app/modules/fileCatalog/interface";

const assert = require('assert');

describe("app", function () {
	const databaseConfig = {
		name: 'geesome_test', options: {
			logging: () => {
			}, storage: 'database-test.sqlite'
		}
	};

	this.timeout(60000);

	let app: IGeesomeApp, fileCatalog: IGeesomeFileCatalogModule;

	beforeEach(async () => {
		const appConfig = require('../app/config');
		appConfig.storageConfig.implementation = 'js-ipfs';
		appConfig.storageConfig.jsNode.repo = '.jsipfs-test';
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		appConfig.storageConfig.jsNode.config = {
			Addresses: {
				Swarm: [
					"/ip4/0.0.0.0/tcp/40002",
					"/ip4/127.0.0.1/tcp/40003/ws",
					"/dns4/wrtc-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star"
				]
			}
		};

		try {
			app = await require('../app')({databaseConfig, storageConfig: appConfig.storageConfig, port: 7771});
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
			assert.equal(e.message, 'file does not exist');
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
			assert.equal(e.message, 'file does not exist');
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
