/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../app/interface";
import {ContentView, CorePermissionName} from "../app/modules/database/interface";
import {PostStatus} from "../app/modules/group/interface";

const commonHelpers = require("geesome-libs/src/common");
const assert = require('assert');
const _ = require('lodash');

describe("group", function () {
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

	it('isReplyForbidden should work properly', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const postContent = await app.ms.content.saveData(testUser.id, 'Hello world', null, {
			mimeType: 'text/markdown'
		});

		const testPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: postContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});

		const newUser = await app.registerUser({
			email: 'new@user.com',
			name: 'new',
			password: 'new',
			permissions: [CorePermissionName.UserAll]
		});

		try {
			await app.ms.group.createGroup(newUser.id, {name: '', title: 'Test2'});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(_.includes(e.toString(), "incorrect_name"), true);
		}
		try {
			await app.ms.group.createGroup(newUser.id, {title: 'Test2'});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(_.includes(e.toString(), "incorrect_name"), true);
		}
		const group2 = await app.ms.group.createGroup(newUser.id, {name: 'test2', title: 'Test2'});

		await app.ms.group.createPost(newUser.id, {
			contents: [{id: postContent.id, view: ContentView.Contents}],
			replyToId: testPost.id,
			groupId: group2.id,
			status: PostStatus.Published
		});

		await app.ms.group.updateGroup(testUser.id, testGroup.id, {isReplyForbidden: true});

		try {
			await app.ms.group.createPost(newUser.id, {
				contents: [{id: postContent.id, view: ContentView.Contents}],
				replyToId: testPost.id,
				groupId: group2.id,
				status: PostStatus.Published
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(_.includes(e.toString(), "not_permitted"), true);
		}

		await app.ms.group.updatePost(testUser.id, testPost.id, {isReplyForbidden: false});

		await app.ms.group.createPost(newUser.id, {
			contents: [{id: postContent.id, view: ContentView.Contents}],
			replyToId: testPost.id,
			groupId: group2.id,
			status: PostStatus.Published
		});

		await app.ms.group.updateGroup(testUser.id, testGroup.id, {isReplyForbidden: false});

		await app.ms.group.createPost(newUser.id, {
			contents: [{id: postContent.id, view: ContentView.Contents}],
			replyToId: testPost.id,
			groupId: group2.id,
			status: PostStatus.Published
		});

		await app.ms.group.updatePost(testUser.id, testPost.id, {isReplyForbidden: true});

		try {
			await app.ms.group.createPost(newUser.id, {
				contents: [{id: postContent.id, view: ContentView.Contents}],
				replyToId: testPost.id,
				groupId: group2.id,
				status: PostStatus.Published
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(_.includes(e.toString(), "not_permitted"), true);
		}
	});

	it('groups administration', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const newUser = await app.registerUser({
			email: 'new@user.com',
			name: 'new',
			password: 'new',
			permissions: [CorePermissionName.UserAll]
		});
		const newUser2 = await app.registerUser({
			email: 'new2@user.com',
			name: 'new2',
			password: 'new2',
			permissions: [CorePermissionName.UserAll]
		});

		assert.equal(await app.ms.group.isAdminInGroup(testUser.id, testGroup.id), true);
		assert.equal(await app.ms.group.isAdminInGroup(newUser.id, testGroup.id), false);
		assert.equal(await app.ms.group.isAdminInGroup(newUser2.id, testGroup.id), false);

		await app.ms.group.setAdminsOfGroup(testUser.id, testGroup.id, [newUser.id, newUser2.id]);

		assert.equal(await app.ms.group.isAdminInGroup(testUser.id, testGroup.id), false);
		assert.equal(await app.ms.group.isAdminInGroup(newUser.id, testGroup.id), true);
		assert.equal(await app.ms.group.isAdminInGroup(newUser2.id, testGroup.id), true);

		await app.ms.group.setMembersOfGroup(newUser.id, testGroup.id, [testUser.id]);

		assert.equal(await app.ms.group.isMemberInGroup(testUser.id, testGroup.id), true);

		const groupAccount = await app.ms.accountStorage.getLocalAccountByName(testGroup.name);
		assert.equal(groupAccount.staticId, testGroup.manifestStaticStorageId);

		try {
			await app.ms.group.updateGroup(testUser.id, testGroup.id, {
				name: testGroup.name + '_deleted_' + commonHelpers.makeCode(16),
				isDeleted: true
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(_.includes(e.toString(), "not_permitted"), true);
		}

		await app.ms.group.updateGroup(newUser.id, testGroup.id, {
			name: testGroup.name + '_deleted_' + commonHelpers.makeCode(16),
			isDeleted: true
		});

		const deletedGroupAccount = await app.ms.accountStorage.getLocalAccountByName(testGroup.name);
		assert.equal(deletedGroupAccount, null);

		const newGroup = await app.ms.group.createGroup(testUser.id, {
			name: testGroup.name,
			title: 'Test 2'
		});

		const newGroupAccount = await app.ms.accountStorage.getLocalAccountByName(testGroup.name);
		assert.equal(newGroupAccount.staticId, newGroup.manifestStaticStorageId);
		assert.notEqual(newGroupAccount.staticId, testGroup.manifestStaticStorageId);

		try {
			await app.ms.group.createGroup(testUser.id, {
				name: testGroup.name,
				title: 'Test 3'
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(_.includes(e.toString(), "Validation error"), true);
		}

		const test3Group = await app.ms.group.createGroup(testUser.id, {
			name: testGroup.name + '1',
			title: 'Test 3'
		});
		try {
			await app.ms.group.updateGroup(testUser.id, test3Group.id, {
				name: testGroup.name,
				isDeleted: true
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(_.includes(e.toString(), "SequelizeUniqueConstraintError"), true);
		}
		const test3GroupAfterUpdate = await app.ms.group.getGroup(test3Group.id);
		assert.equal(test3GroupAfterUpdate.name, testGroup.name + '1');
	});

	it('groupRead', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const post1Content = await app.ms.content.saveData(testUser.id, 'Hello world1', null, {
			mimeType: 'text/markdown'
		});
		const postData = {
			contents: [{manifestStorageId: post1Content.manifestStorageId, view: ContentView.Attachment}],
			groupId: testGroup.id,
			status: PostStatus.Published
		};
		let post = await app.ms.group.createPost(testUser.id, postData);

		assert.equal((await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id)).count, 1);

		await app.ms.group.addOrUpdateGroupRead(testUser.id, {
			groupId: testGroup.id,
			readAt: post.publishedAt
		});

		// app.ms.storage.getFileData(post.group.directoryStorageId + '/')

		assert.equal((await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id)).count, 0);

		await app.ms.group.createPost(testUser.id, postData);

		assert.equal((await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id)).count, 1);

		post = await app.ms.group.createPost(testUser.id, postData);

		assert.equal((await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id)).count, 2);

		await app.ms.group.addOrUpdateGroupRead(testUser.id, {
			groupId: testGroup.id,
			readAt: post.publishedAt
		});

		assert.equal((await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id)).count, 0);
	});

	it('getGroupPostPath', async () => {
		assert.equal(app.ms.group.getGroupPostPath(1), '0/0/1');
		assert.equal(app.ms.group.getGroupPostPath(12), '0/0/12');
		assert.equal(app.ms.group.getGroupPostPath(123), '0/1/123');
		assert.equal(app.ms.group.getGroupPostPath(1234), '0/12/1234');
		assert.equal(app.ms.group.getGroupPostPath(12345), '1/23/12345');
		assert.equal(app.ms.group.getGroupPostPath(123456), '12/34/123456');
		assert.equal(app.ms.group.getGroupPostPath(1234567), '123/45/1234567');
	});
});
