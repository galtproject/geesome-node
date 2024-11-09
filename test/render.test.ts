/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import fs from "fs";
import assert from "assert";
import {ContentView, CorePermissionName} from "../app/modules/database/interface.js";
import {IUserOperationQueue} from "../app/modules/asyncOperation/interface.js";
import {PostStatus} from "../app/modules/group/interface.js";
import resourcesHelper from './helpers/resources.js';
import {IGeesomeApp} from "../app/interface.js";

describe("renders", function () {
	this.timeout(60000);

	let admin, app: IGeesomeApp;

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';

		try {
			app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7771});
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
		const staticSiteGenerator = await (await import('../app/modules/staticSiteGenerator/index.js')).default(app);

		await addTextPostToGroup(testGroup, 'Test 1 post');
		const staticSiteContent = await generateStaticSiteAndGetContent(testGroup, 'Test 1 group', 'About test group');
		assert.equal(staticSiteContent.includes("Test 1 post"), true);
		assert.equal(staticSiteContent.includes("Test 1 group"), true);

		const testGroup2 = await app.ms.group.createGroup(testUser.id, {
			name: 'test-2',
			title: 'Test 2'
		});
		await addTextPostToGroup(testGroup2, 'Test 2 post');
		const staticSiteContent2 = await generateStaticSiteAndGetContent(testGroup2, 'Test 2 group', 'About test 2 group');
		assert.equal(staticSiteContent2.includes("Test 2 post"), true);
		assert.equal(staticSiteContent2.includes("Test 2 group"), true);

		console.log('generateStaticSiteAndGetContent end')
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

			let userOperationQueue: IUserOperationQueue = await staticSiteGenerator.addRenderToQueueAndProcess(testUser.id, apiKey, {entityType: 'group', entityId: group.id}, {
				site: {title, description},
				post: defaultOptions.post,
				postList: defaultOptions.postList,
			});

			do {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				userOperationQueue = await app.ms.asyncOperation.getUserOperationQueue(testUser.id, userOperationQueue.id);
			} while (userOperationQueue.isWaiting)

			console.log('staticSiteGenerator.getStaticSiteInfo');
			const staticSiteInfo = await staticSiteGenerator.getStaticSiteInfo(testUser.id, 'group', group.id);
			console.log('staticSiteInfo', staticSiteInfo);
			return app.ms.storage.getFileDataText(staticSiteInfo.storageId + '/index.html');
		}
	});

	it('rss', async () => {
		app.ms.storage.isStreamAddSupport = () => {
			return false;
		};

		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		let testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const rssRender = await (await import('../app/modules/rss/index.js')).default(app);

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
		assert.equal(resultXml.includes("Test 1 group"), true);
		assert.equal(resultXml.includes("Test 1 post"), true);
		assert.equal(resultXml.includes(imageContent.storageId), true);
	});
});
