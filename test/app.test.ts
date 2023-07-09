/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../app/interface";
import {CorePermissionName, UserLimitName} from "../app/modules/database/interface";

const ipfsHelper = require("geesome-libs/src/ipfsHelper");
const assert = require('assert');
const fs = require('fs');
const _ = require('lodash');
const resourcesHelper = require('./helpers/resources');
const log = require('../app/helpers').log;

describe("app", function () {
	const databaseConfig = {
		name: 'geesome_test', options: {
			logging: () => {
			}, storage: 'database-test.sqlite'
		}
	};

	this.timeout(60000);

	let admin, app: IGeesomeApp;
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

			admin = await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'}).then(r => r.user);
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
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it("should initialized successfully", async () => {
		assert.equal(await app.ms.database.getUsersCount(), 2);

		await new Promise((resolve, reject) => {
			fs.writeFile('/tmp/test', 'test', resolve);
		});
		const resultFile = await app.ms.storage.saveFileByPath('/tmp/test');

		assert.notEqual(resultFile.id, undefined);

		const adminUser = (await app.ms.database.getAllUserList('admin'))[0];
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const limitData = {
			name: UserLimitName.SaveContentSize,
			value: 100 * (10 ** 3),
			adminId: adminUser.id,
			userId: testUser.id,
			periodTimestamp: 60,
			isActive: true
		};
		await app.setUserLimit(adminUser.id, limitData);

		try {
			await app.ms.content.saveData(testUser.id, fs.createReadStream(`${__dirname}/../exampleContent/post3.jpg`), 'post3.jpg', {
				userId: testUser.id,
				groupId: testGroup.id
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(true, true);
		}

		limitData.value = 1000 * (10 ** 3);

		await app.setUserLimit(adminUser.id, limitData);

		await app.ms.content.saveData(testUser.id, fs.createReadStream(`${__dirname}/../exampleContent/post3.jpg`), 'post3.jpg', {
			userId: testUser.id,
			groupId: testGroup.id
		});

		const contentObj = await app.ms.content.saveData(testUser.id, {type: "Buffer", data: [49]}, '1.txt', {
			userId: testUser.id,
			groupId: testGroup.id
		});

		const mainfestData = await app.getDataStructure(contentObj.manifestStorageId);
		const savedManifestStorageId = await app.saveDataStructure(mainfestData);

		assert.equal(contentObj.manifestStorageId, savedManifestStorageId);

		// const contentObj = await app.saveDataByUrl('https://www.youtube.com/watch?v=rxGnonKB7TY', {userId: 1, groupId: 1, driver: 'youtube-video'});
		// console.log('contentObj', contentObj);
		//
		// assert.notEqual(contentObj.storageAccountId, null);
	});

	it('loginPassword and updateUser should work properly', async () => {
		const adminUser = (await app.ms.database.getAllUserList('admin'))[0];

		let byIncorrectPassword = await app.loginPassword('admin', 'admin1');
		assert.equal(byIncorrectPassword, null);

		let byCorrectPassword = await app.loginPassword('admin', 'admin');
		assert.equal(byCorrectPassword.id, adminUser.id);

		await app.updateUser(byCorrectPassword.id, {name: 'new-admin', email: 'new-admin@admin.com'});

		const updatedUser = await app.ms.database.getUser(byCorrectPassword.id);
		assert.equal(updatedUser.name, 'new-admin');
		assert.equal(updatedUser.email, 'new-admin@admin.com');

		byIncorrectPassword = await app.loginPassword('admin', 'admin');
		assert.equal(byIncorrectPassword, null);
		byCorrectPassword = await app.loginPassword('new-admin', 'admin')
		assert.equal(byCorrectPassword.id, adminUser.id);

		await app.updateUser(byCorrectPassword.id, {password: 'new-pass'});

		byIncorrectPassword = await app.loginPassword('new-admin', 'admin');
		assert.equal(byIncorrectPassword, null);
		byCorrectPassword = await app.loginPassword('new-admin', 'new-pass')
		assert.equal(byCorrectPassword.id, adminUser.id);
	});

	it('should correctly set permissions', async () => {
		const permissionsTestUser = await app.registerUser({
			email: 'user-permissions@user.com',
			name: 'user-permissions',
			permissions: [CorePermissionName.UserSaveData, CorePermissionName.UserApiKeyManagement]
		});

		let permissions = await app.ms.database.getCorePermissions(permissionsTestUser.id);

		assert.equal(permissions.length, 2);
		assert.equal(permissions.filter(p => p.name === CorePermissionName.UserSaveData).length, 1);
		assert.equal(permissions.filter(p => p.name === CorePermissionName.UserApiKeyManagement).length, 1);

		await app.ms.database.setCorePermissions(permissionsTestUser.id, [CorePermissionName.UserSaveData, CorePermissionName.UserFileCatalogManagement, CorePermissionName.UserGroupManagement]);

		permissions = await app.ms.database.getCorePermissions(permissionsTestUser.id);

		assert.equal(permissions.length, 3);
		assert.equal(permissions.filter(p => p.name === CorePermissionName.UserSaveData).length, 1);
		assert.equal(permissions.filter(p => p.name === CorePermissionName.UserApiKeyManagement).length, 0);
		assert.equal(permissions.filter(p => p.name === CorePermissionName.UserFileCatalogManagement).length, 1);
		assert.equal(permissions.filter(p => p.name === CorePermissionName.UserGroupManagement).length, 1);
	});

	it('should correctly save data with only save permission', async () => {
		try {
			await app.registerUser({
				email: 'user-save-data@user.com',
				name: 'user -save-data',
				permissions: [CorePermissionName.UserSaveData]
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(_.includes(e.toString(), "forbidden_symbols_in_name"), true);
		}
		try {
			await app.registerUser({
				email: 'user-save- data@user.com',
				name: 'user -save-data',
				permissions: [CorePermissionName.UserSaveData]
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(_.includes(e.toString(), "email_invalid"), true);
		}
		const saveDataTestUser = await app.registerUser({
			email: 'user-save-data@user.com',
			name: 'user-save-data',
			permissions: [CorePermissionName.UserSaveData]
		});

		log('saveDataTestUser');
		const textContent = await app.ms.content.saveData(saveDataTestUser.id, 'test', 'text.txt', { waitForPin: true });
		log('textContent');

		const contentObj = await app.ms.storage.getObject(textContent.manifestStorageId);

		assert.equal(ipfsHelper.isIpfsHash(contentObj.storageId), true);
		assert.equal(contentObj.mimeType, 'text/plain');

		await app.ms.content.saveData(saveDataTestUser.id, 'test', 'text.txt', { waitForPin: true });
		log('saveData');

		const ipld = await app.ms.storage.saveObject(contentObj, { waitForPin: true });
		assert.equal(ipld, textContent.manifestStorageId);
	});

	it('should correctly save data structures', async () => {
		const testObject = {foo: 'bar'};
		const ipld1 = await app.ms.storage.saveObject(testObject, { waitForPin: true });
		const ipld2 = await app.saveDataStructure(testObject);
		assert.equal(ipld1, ipld2);
		console.log('ipld1', ipld1);

		const object1 = await app.ms.storage.getObject(ipld1);
		const object2 = await app.getDataStructure(ipld2);
		assert.deepEqual(object1, object2);

		const newTestObject = {foo: 'bar', foo2: 'bar2'};
		const newTesObjectId = await app.ms.storage.saveObject(newTestObject, { waitForPin: true });
		let newTestObjectDbContent = await app.ms.database.getObjectByStorageId(newTesObjectId);
		assert.equal(newTestObjectDbContent, null);

		await app.getDataStructure(newTesObjectId);
		await new Promise((resolve) => {
			setTimeout(resolve, 200)
		});
		newTestObjectDbContent = await app.ms.database.getObjectByStorageId(newTesObjectId);
		assert.deepEqual(JSON.parse(newTestObjectDbContent.data), newTestObject);
	});

	it('should correctly save image', async () => {
		console.log('should correctly save image:start', admin.id)
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		console.log('testGroup.id', testGroup.id)
		app.ms.storage.isStreamAddSupport = () => {
			return false;
		};

		const pngImagePath = await resourcesHelper.prepare('input-image.png');
		const imageContent = await app.ms.content.saveData(testUser.id, fs.createReadStream(pngImagePath), 'input-image.png', {
			groupId: testGroup.id,
			waitForPin: true
		});

		const properties = JSON.parse(imageContent.propertiesJson);
		assert.equal(properties.width > 0, true);

		const contentObj = await app.ms.storage.getObject(imageContent.manifestStorageId);

		assert.equal(ipfsHelper.isIpfsHash(contentObj.storageId), true);
		assert.equal(contentObj.mimeType, 'image/png');
		assert.equal(contentObj.properties.width > 0, true);

		console.log('contentObj.preview.medium.mimeType', contentObj.preview.medium.mimeType);
		assert.equal(_.startsWith(contentObj.preview.medium.mimeType, 'image'), true);
		assert.equal(ipfsHelper.isIpfsHash(contentObj.preview.medium.storageId), true);
	});

	it('should correctly save video', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const inputVideo = await resourcesHelper.prepare('not-streamable-input-video.mp4');
		const videoContent = await app.ms.content.saveData(testUser.id, fs.createReadStream(inputVideo), 'input-video.mp4', {
			groupId: testGroup.id
		});

		const contentObj = await app.ms.storage.getObject(videoContent.manifestStorageId);

		assert.equal(ipfsHelper.isIpfsHash(contentObj.storageId), true);
		assert.equal(contentObj.mimeType, 'video/mp4');
		assert.equal(contentObj.properties.width > 0, true);

		console.log('contentObj.preview.medium.mimeType', contentObj.preview.medium.mimeType)
		assert.equal(_.startsWith(contentObj.preview.medium.mimeType, 'image'), true);
		assert.equal(ipfsHelper.isIpfsHash(contentObj.preview.medium.storageId), true);
	});

	it('should correctly save mov video', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const inputVideoPath = await resourcesHelper.prepare('input-video.mov');
		const videoContent = await app.ms.content.saveData(testUser.id, fs.createReadStream(inputVideoPath), 'input-video.mov', {
			groupId: testGroup.id
		});

		const contentObj = await app.ms.storage.getObject(videoContent.manifestStorageId);

		assert.equal(ipfsHelper.isIpfsHash(contentObj.storageId), true);
		assert.equal(contentObj.mimeType, 'video/mp4');

		console.log('contentObj.preview.medium.mimeType', contentObj.preview.medium.mimeType)
		assert.equal(_.startsWith(contentObj.preview.medium.mimeType, 'image'), true);
		assert.equal(ipfsHelper.isIpfsHash(contentObj.preview.medium.storageId), true);
	});

	it("should upload archive and unzip correctly", async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];

		const archivePath = await resourcesHelper.prepare('test-archive.zip');
		const archiveContent = await app.ms.content.saveData(testUser.id, fs.createReadStream(archivePath), 'archive.zip', {
			driver: 'archive'
		});

		const contentObj = await app.ms.storage.getObject(archiveContent.manifestStorageId);
		assert.equal(contentObj.mimeType, 'directory');
		assert.equal(contentObj.extension, 'none');
		assert.equal(contentObj.size > 0, true);

		let gotTextContent = await app.ms.storage.getFileDataText(archiveContent.storageId + '/test.txt');
		assert.equal(gotTextContent, 'Test\n');
	});
});
