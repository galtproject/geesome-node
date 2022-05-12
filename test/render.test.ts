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
	ContentView,
	CorePermissionName,
} from "../app/modules/database/interface";
import {PostStatus} from "../app/modules/group/interface";
import {IUserOperationQueue} from "../app/modules/asyncOperation/interface";

const assert = require('assert');
const fs = require('fs');
const includes = require('lodash/includes');
const resourcesHelper = require('./helpers/resources');

describe("renders", function () {
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
				title: 'Test 1 group',
				isPublic: true,
			});
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it('static-site-generator', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		let testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const apiKey = await app.generateUserApiKey(testUser.id, {type: "test-static-generator"});
		const staticSiteGenerator = await require('../app/modules/staticSiteGenerator')(app);

		await addTextPostToGroup(testGroup, 'Test 1 post');
		const staticSiteContent = await generateStaticSiteAndGetContent(testGroup, 'Test 1 group', 'About test group');
		assert.equal(includes(staticSiteContent, "Test 1 post"), true);
		assert.equal(includes(staticSiteContent, "Test 1 group"), true);

		const testGroup2 = await app.ms.group.createGroup(testUser.id, {
			name: 'test-2',
			title: 'Test 2'
		});
		await addTextPostToGroup(testGroup2, 'Test 2 post');
		const staticSiteContent2 = await generateStaticSiteAndGetContent(testGroup2, 'Test 2 group', 'About test 2 group');
		assert.equal(includes(staticSiteContent2, "Test 2 post"), true);
		assert.equal(includes(staticSiteContent2, "Test 2 group"), true);

		async function addTextPostToGroup(group, text) {
			const post1Content = await app.ms.content.saveData(testUser.id, text, null, {
				mimeType: 'text/html'
			});

			await app.ms.group.createPost(testUser.id, {
				contents: [{manifestStorageId: post1Content.manifestStorageId, view: ContentView.Attachment}],
				groupId: group.id,
				status: PostStatus.Published
			});
		}

		async function generateStaticSiteAndGetContent(group, title, description) {
			const defaultOptions = await staticSiteGenerator.getDefaultOptionsByGroupId(testUser.id, group.id);

			let userOperationQueue: IUserOperationQueue = await staticSiteGenerator.addRenderToQueueAndProcess(testUser.id, apiKey, 'group', group.id, {
				site: {title, description},
				post: defaultOptions.post,
				postList: defaultOptions.postList,
			});

			while (userOperationQueue.isWaiting) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				userOperationQueue = await app.ms.asyncOperation.getUserOperationQueue(testUser.id, userOperationQueue.id);
			}

			group = await app.ms.group.getLocalGroup(testUser.id, group.id);
			const {staticSiteManifestStorageId} = JSON.parse(group.propertiesJson);
			const storageId = await app.ms.storage.getObjectProp(staticSiteManifestStorageId, 'storageId');
			return app.ms.storage.getFileDataText(storageId + '/index.html');
		}
	});

	it('rss', async () => {
		app.ms.storage.isStreamAddSupport = () => {
			return false;
		};

		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		let testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const rssRender = await require('../app/modules/rss')(app);

		const test1PostText = 'Test 1 post';
		const post1Content = await app.ms.content.saveData(testUser.id, test1PostText, null, {
			mimeType: 'text/html'
		});

		const pngImagePath = await resourcesHelper.prepare('input-image.png');
		const imageContent = await app.ms.content.saveData(testUser.id, fs.createReadStream(pngImagePath), 'input-image.png', {
			groupId: testGroup.id
		});

		await app.ms.group.createPost(testUser.id, {
			contents: [{
				manifestStorageId: post1Content.manifestStorageId,
				view: ContentView.Attachment
			}, {manifestStorageId: imageContent.manifestStorageId, view: ContentView.Attachment}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});

		const resultXml = await rssRender.groupRss(testGroup.id, 'http://localhost:1234');
		assert.equal(includes(resultXml, "Test 1 group"), true);
		assert.equal(includes(resultXml, "Test 1 post"), true);
		assert.equal(includes(resultXml, imageContent.storageId), true);
	});
});
