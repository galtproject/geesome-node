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
	CorePermissionName, IUser,
} from "../app/modules/database/interface";
import IGeesomeStaticSiteGeneratorModule from "../app/modules/staticSiteGenerator/interface";
import {IGroup, PostStatus} from "../app/modules/group/interface";

const {getTitleAndDescription} = require('../app/modules/staticSiteGenerator/helpers');

const assert = require('assert');
const resourcesHelper = require('./helpers/resources');
const fs = require('fs');

describe("staticSiteGenerator", function () {
	const databaseConfig = {
		name: 'geesome_test', options: {
			logging: () => {
			}, storage: 'database-test.sqlite'
		}
	};

	this.timeout(60000);

	let app: IGeesomeApp, staticSiteGenerator: IGeesomeStaticSiteGeneratorModule, testUser: IUser, testGroup: IGroup;

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
			testUser = await app.registerUser({
				email: 'user@user.com',
				name: 'user',
				password: 'user',
				permissions: [CorePermissionName.UserAll]
			});
			testGroup = await app.ms.group.createGroup(testUser.id, {
				name: 'test',
				title: 'Test'
			});
			staticSiteGenerator = app.ms['staticSiteGenerator'];
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it('title and description should working properly', async () => {
		const text = 'Кто плюсист?<br><a href="https://en.wikipedia.org/wiki/C%2B%2B20">https://en.wikipedia.org/wiki/C%2B%2B20</a><br><br><i>Language<br>concepts[6], with terse syntax.[7]<br>modules[8]<br><br>Library<br>ranges (The One Ranges Proposal)[35]</i>';
		const {title, description} = getTitleAndDescription([{view: 'contents', text}], {
			titleLength: 66,
			descriptionLength: 156
		})
		assert.equal(title, 'Кто плюсист? https://en.wikipedia.org/wiki/C%2B%2B20');
		assert.equal(description, '<i>Language<br/>concepts[6], with terse syntax.[7]<br/>modules[8]<br/>Library<br/>ranges (The One Ranges Proposal)[35]</i>');
	});

	it('zero title and description should working properly', async () => {
		const text = 'Кто плюсист?<br><a href="https://en.wikipedia.org/wiki/C%2B%2B20">https://en.wikipedia.org/wiki/C%2B%2B20</a><br><br><i>Language<br>concepts[6], with terse syntax.[7]<br>modules[8]<br><br>Library<br>ranges (The One Ranges Proposal)[35]</i>';
		const {title, description} = getTitleAndDescription([{view: 'contents', text}], {
			titleLength: 0,
			descriptionLength: 156
		})
		assert.equal(title, '');
		assert.equal(description, 'Кто плюсист?<br/><a href="https://en.wikipedia.org/wiki/C%2B%2B20">https://en.wikipedia.org/wiki/C%2B%2B20</a><br/><i>Language<br/>concepts[6], with terse syntax.[7]...</i>');
	});

	it('should generate site correctly', async () => {
		const posts = [];
		for(let i = 0; i < 30; i++) {
			const post1Content = await app.ms.content.saveData(testUser.id, 'Hello world' + i, null, { mimeType: 'text/markdown' });

			const pngImagePath = await resourcesHelper.prepare('input-image.png');
			const imageContent = await app.ms.content.saveData(testUser.id, fs.createReadStream(pngImagePath), 'input-image.png', {
				groupId: testGroup.id,
				waitForPin: true
			});
			const postData = {
				contents: [{manifestStorageId: post1Content.manifestStorageId, view: ContentView.Contents},{manifestStorageId: imageContent.manifestStorageId, view: ContentView.Media}],
				groupId: testGroup.id,
				status: PostStatus.Published
			};
			posts.push(await app.ms.group.createPost(testUser.id, postData));
		}

		const directoryStorageId = await staticSiteGenerator.generate(testUser.id, 'group', testGroup.id, {
			lang: 'en',
			dateFormat: 'DD.MM.YYYY hh:mm:ss',
			baseStorageUri: 'http://localhost:2052/ipfs/',
			post: {
				titleLength: 0,
				descriptionLength: 400,
			},
			postList: {
				postsPerPage: 5,
			},
			site: {
				title: 'MySite',
				name: 'my_site',
				description: 'My About',
				username: 'myusername',
				base: '/'
			}
		});

		const indexHtmlContent = await app.ms.storage.getFileData(`${directoryStorageId}/index.html`).then(b => b.toString('utf8'));
		assert.match(indexHtmlContent, /Powered by.+https:\/\/github.com\/galtproject\/geesome-node/);
		assert.match(indexHtmlContent, /post-intro.+Hello world25/);
		assert.match(indexHtmlContent, /MySite/);
		assert.match(indexHtmlContent, /My About/);
		assert.match(indexHtmlContent, /Posts: 30/);
		assert.equal(indexHtmlContent.includes('<link rel="stylesheet" href="./style.css">'), true);
		assert.equal(indexHtmlContent.includes('<a href="./post/26/"'), true);
		const page3HtmlContent = await app.ms.storage.getFileData(`${directoryStorageId}/page/5/index.html`).then(b => b.toString('utf8'));
		assert.match(page3HtmlContent, /Powered by.+https:\/\/github.com\/galtproject\/geesome-node/);
		assert.match(page3HtmlContent, /post-intro.+Hello world24/);
		assert.equal(page3HtmlContent.includes('<link rel="stylesheet" href="../../style.css">'), true);
		assert.equal(page3HtmlContent.includes('<a href="../../page/5/"'), true);
		assert.equal(page3HtmlContent.includes('<a href="../../post/24/"'), true);
		const postHtmlContent = await app.ms.storage.getFileData(`${directoryStorageId}/post/${posts[0].id}/index.html`).then(b => b.toString('utf8'));
		assert.match(postHtmlContent, /Powered by.+https:\/\/github.com\/galtproject\/geesome-node/);
		assert.match(postHtmlContent, /post-page-content.+Hello world0/);
		assert.equal(postHtmlContent.includes('<link rel="stylesheet" href="../../style.css">'), true);
		console.log('postHtmlContent', postHtmlContent);
	});
});