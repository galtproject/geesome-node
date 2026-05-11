/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from 'assert';
import trieHelper from "geesome-libs/src/base36Trie.js";
import {ContentView, CorePermissionName, GroupPermissionName,} from "../app/modules/database/interface.js";
import IGeesomeGroupCategoryModule from "../app/modules/groupCategory/interface.js";
import {PostStatus} from "../app/modules/group/interface.js";
import {IGeesomeApp} from "../app/interface.js";

describe("groupCategory", function () {
	this.timeout(60000);

	let admin, app: IGeesomeApp, groupCategory: IGeesomeGroupCategoryModule;

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
				title: 'Test'
			});
			groupCategory = app.ms['groupCategory'];
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it('hydrates category feed pages after id-only page selection', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test')).list[0];
		const category = await groupCategory.createCategory(testUser.id, {name: 'feed-category'});
		await groupCategory.addGroupToCategory(testUser.id, testGroup.id, category.id);

		const outsideGroup = await app.ms.group.createGroup(testUser.id, {
			name: 'outside-category',
			title: 'Outside Category'
		});
		const outsideContent = await app.ms.content.saveData(testUser.id, 'outside', null, {
			mimeType: 'text/markdown'
		});
		await app.ms.group.createPost(testUser.id, {
			contents: [{id: outsideContent.id, view: ContentView.Contents}],
			groupId: outsideGroup.id,
			publishedAt: new Date('2026-02-04T00:00:00.000Z'),
			status: PostStatus.Published
		});

		const olderContent = await app.ms.content.saveData(testUser.id, 'older', null, {
			mimeType: 'text/markdown'
		});
		const olderPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: olderContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			publishedAt: new Date('2026-02-01T00:00:00.000Z'),
			status: PostStatus.Published
		});

		const middleContent = await app.ms.content.saveData(testUser.id, 'middle', null, {
			mimeType: 'text/markdown'
		});
		const middlePost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: middleContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			publishedAt: new Date('2026-02-02T00:00:00.000Z'),
			status: PostStatus.Published
		});

		const newestAttachment = await app.ms.content.saveData(testUser.id, 'newest attachment', null, {
			mimeType: 'text/markdown'
		});
		const newestBody = await app.ms.content.saveData(testUser.id, 'newest body', null, {
			mimeType: 'text/markdown'
		});
		const newestPost = await app.ms.group.createPost(testUser.id, {
			contents: [
				{id: newestAttachment.id, view: ContentView.Attachment},
				{id: newestBody.id, view: ContentView.Contents}
			],
			groupId: testGroup.id,
			publishedAt: new Date('2026-02-03T00:00:00.000Z'),
			status: PostStatus.Published
		});

		const page = await groupCategory.getCategoryPosts(category.id, {}, {limit: 2});
		assert.equal(page.total, 3);
		assert.deepEqual(page.list.map(post => post.id), [newestPost.id, middlePost.id]);
		assert.deepEqual(page.list[0].contents.map(content => content.id), [newestAttachment.id, newestBody.id]);
		assert.deepEqual(page.list[0].contents.map(content => content.postsContents.view), [ContentView.Attachment, ContentView.Contents]);
		assert.equal(page.list[0].group.id, testGroup.id);

		const secondPage = await groupCategory.getCategoryPosts(category.id, {}, {limit: 2, offset: 2});
		assert.deepEqual(secondPage.list.map(post => post.id), [olderPost.id]);

		const noTotalPage = await groupCategory.getCategoryPosts(category.id, {}, {limit: 2, includeTotal: false});
		assert.equal(noTotalPage.total, null);
		assert.deepEqual(noTotalPage.list.map(post => post.id), [newestPost.id, middlePost.id]);

		const firstCursorPage = await groupCategory.getCategoryPosts(category.id, {
			cursorPublishedAt: new Date('2999-01-01T00:00:00.000Z'),
			cursorId: '999999999'
		}, {limit: 2});
		assert.equal(firstCursorPage.total, null);
		assert.deepEqual(firstCursorPage.list.map(post => post.id), [newestPost.id, middlePost.id]);
		assert(firstCursorPage.nextCursor);

		const secondCursorPage = await groupCategory.getCategoryPosts(category.id, {
			cursorPublishedAt: firstCursorPage.nextCursor.publishedAt,
			cursorId: firstCursorPage.nextCursor.id
		}, {limit: 2});
		assert.equal(secondCursorPage.total, null);
		assert.equal(secondCursorPage.nextCursor, null);
		assert.deepEqual(secondCursorPage.list.map(post => post.id), [olderPost.id]);
	});

	it('categories should work properly', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test')).list[0];
		const categoryName = 'my-category';
		const category = await groupCategory.createCategory(testUser.id, {name: categoryName});

		const newUser = await app.registerUser({
			email: 'new@user.com',
			name: 'new',
			password: 'new',
			permissions: [CorePermissionName.UserAll]
		});
		try {
			await groupCategory.addGroupToCategory(newUser.id, testGroup.id, category.id);
			assert(false);
		} catch (e) {
			assert(true);
		}
		await groupCategory.addGroupToCategory(testUser.id, testGroup.id, category.id);

		const foundCategory = await groupCategory.getCategoryByParams({name: categoryName});
		assert.equal(foundCategory.id, category.id);

		const categoryGroups = await groupCategory.getCategoryGroups(testUser.id, category.id).then(r => r.list);
		console.log('categoryGroups', categoryGroups);
		assert.equal(categoryGroups.length, 1);
		assert.equal(categoryGroups[0].id, testGroup.id);

		const categoryGroupsCount = await groupCategory.getCategoryGroupsCount(category.id);
		console.log('categoryGroupsCount', categoryGroupsCount);
		assert.equal(categoryGroupsCount, 1);

		const postContent = await app.ms.content.saveData(newUser.id, 'Hello world', null, {
			mimeType: 'text/markdown'
		});

		try {
			await app.ms.group.createPost(newUser.id, {
				contents: [{id: postContent.id}],
				groupId: testGroup.id,
				status: PostStatus.Published,
				name: 'my-post'
			});
			assert(false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}
		try {
			await app.ms.group.addMemberToGroup(newUser.id, testGroup.id, newUser.id);
			assert(false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}
		try {
			await groupCategory.addMemberToCategory(newUser.id, category.id, newUser.id);
			assert(false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}
		try {
			await app.ms.group.updateGroup(newUser.id, testGroup.id, {title: 'new title'});
			assert(false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}

		assert.equal(await app.ms.group.isMemberInGroup(newUser.id, testGroup.id), false);
		assert.equal(await groupCategory.isMemberInCategory(newUser.id, category.id), false);

		await app.ms.group.addMemberToGroup(testUser.id, testGroup.id, newUser.id, [GroupPermissionName.EditGeneralData]);
		await groupCategory.addMemberToCategory(testUser.id, category.id, newUser.id);

		assert.equal(await app.ms.group.isMemberInGroup(newUser.id, testGroup.id), true);
		assert.equal(await groupCategory.isMemberInCategory(newUser.id, category.id), true);

		console.log('createPost 1');
		let post = await app.ms.group.createPost(newUser.id, {
			contents: [{id: postContent.id}],
			groupId: testGroup.id,
			status: PostStatus.Published,
			name: 'my-post'
		});

		console.log('resolveStaticId');
		const manifestId = await app.ms.staticId.resolveStaticId(testGroup.staticStorageId);
		console.log('testGroup.staticStorageId', testGroup.staticStorageId, 'manifestId', manifestId);
		const groupManifest = await app.ms.storage.getObject(manifestId);
		console.log('groupManifest', groupManifest);

		const postNumberPath = trieHelper.getTreePostCidPath(manifestId, 1);
		const postManifest = await app.ms.storage.getObject(postNumberPath);
		assert.equal(postManifest.contents[0].storageId, postContent.manifestStorageId);
		const postManifestStorageId = await app.ms.storage.getObject(postNumberPath, false);
		assert.equal(postManifestStorageId, post.manifestStorageId);

		let foundPost = await app.ms.group.getPostByParams({
			name: 'my-post',
			groupId: testGroup.id
		});

		assert.equal(post.id, foundPost.id);

		const postContent2 = await app.ms.content.saveData(newUser.id, 'Hello world2', null, {
			mimeType: 'text/markdown'
		});

		await app.ms.group.updatePost(newUser.id, post.id, {
			contents: [{id: postContent.id}, {id: postContent2.id}]
		});

		foundPost = await app.ms.group.getPostByParams({
			name: 'my-post',
			groupId: testGroup.id
		});
		assert.equal(foundPost.contents.length, 2);
		assert.equal(foundPost.contents[0].id, postContent.id);
		assert.equal(foundPost.contents[1].id, postContent2.id);

		const newUser2 = await app.registerUser({
			email: 'new@user2.com',
			name: 'new2',
			password: 'new2',
			permissions: [CorePermissionName.UserAll]
		});

		try {
			await app.ms.group.addMemberToGroup(newUser.id, testGroup.id, newUser2.id);
			assert(false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}

		await app.ms.group.updateGroup(newUser.id, testGroup.id, {title: 'new title', name: 'newGroupName'});

		let group = await app.ms.group.getLocalGroup(newUser.id, testGroup.id);
		assert.equal(group.title, 'new title');
		assert.equal(group.name, testGroup.name);

		await app.ms.group.addMemberToGroup(testUser.id, testGroup.id, newUser2.id);

		try {
			await app.ms.group.updateGroup(newUser2.id, testGroup.id, {title: 'new title 2'});
			assert(false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}

		group = await app.ms.group.getLocalGroup(newUser.id, testGroup.id);
		assert.equal(group.title, 'new title');

		let groupPosts = await app.ms.group.getGroupPosts(testGroup.id).then(r => r.list);
		assert.equal(groupPosts.length, 1);
		assert.equal(groupPosts[0].id, post.id);

		let categoryPosts = await groupCategory.getCategoryPosts(category.id).then(r => r.list)
		assert.equal(categoryPosts.length, 1);
		assert.equal(categoryPosts[0].id, post.id);

		const group2 = await app.ms.group.createGroup(testUser.id, {
			name: 'test2',
			title: 'Test2'
		});

		try {
			await app.ms.group.updatePost(newUser.id, post.id, {
				contents: [{id: postContent.id}, {id: postContent2.id}],
				groupId: group2.id
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("group_move_not_supported"), true);
		}

		try {
			await app.ms.group.createGroup(testUser.id, {
				name: 'test2',
				title: 'Test2222'
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("Validation error"), true);
		}

		const foundGroup2 = await app.ms.group.getGroupByParams({
			name: 'test2'
		});

		assert.equal(group2.id, foundGroup2.id);

		const post2Content1 = await app.ms.content.saveData(testUser.id, 'Hello world2', null, {
			mimeType: 'text/markdown'
		});
		const post2Content2 = await app.ms.content.saveData(testUser.id, 'Hello world3', null, {
			mimeType: 'text/markdown'
		});

		console.log('createPost 2');
		const post2 = await app.ms.group.createPost(testUser.id, {
			contents: [
				{id: post2Content1.id,view: ContentView.Contents},
				{manifestStorageId: post2Content2.manifestStorageId, view: ContentView.Attachment}
			],
			replyToId: post.id,
			groupId: group2.id,
			status: PostStatus.Published
		});

		assert.equal(post2.contents.length, 2);
		assert.equal(await app.ms.storage.getFileData(post2.contents[0].storageId), 'Hello world2');
		console.log('post2.contents[0].postsContents', post2.contents[0].postsContents);
		assert.equal(post2.contents[0].postsContents.view, ContentView.Contents);
		assert.equal(await app.ms.storage.getFileData(post2.contents[1].storageId), 'Hello world3');
		console.log('post2.contents[1].postsContents', post2.contents[1].postsContents);
		assert.equal(post2.contents[1].postsContents.view, ContentView.Attachment);

		post = await app.ms.group.getPost(testUser.id, post.id);
		assert.equal(post.repliesCount, 1);

		groupPosts = await app.ms.group.getGroupPosts(testGroup.id).then(r => r.list);
		assert.equal(groupPosts.length, 1);
		assert.equal(groupPosts[0].id, post.id);

		categoryPosts = await groupCategory.getCategoryPosts(category.id).then(r => r.list);
		assert.equal(categoryPosts.length, 1);
		assert.equal(categoryPosts[0].id, post.id);

		await groupCategory.addGroupToCategory(testUser.id, group2.id, category.id);

		groupPosts = await app.ms.group.getGroupPosts(testGroup.id).then(r => r.list);
		assert.equal(groupPosts.length, 1);

		categoryPosts = await groupCategory.getCategoryPosts(category.id).then(r => r.list);
		assert.equal(categoryPosts.length, 2);

		categoryPosts = await groupCategory.getCategoryPosts(category.id, {replyToId: null}).then(r => r.list);
		assert.equal(categoryPosts.length, 1);

		await app.ms.group.removeMemberFromGroup(testUser.id, testGroup.id, newUser.id);

		try {
			await app.ms.group.updateGroup(newUser.id, testGroup.id, {title: 'new title 2'});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}
	});

	it('sections should work properly', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const categoryName = 'my-category';
		const category = await groupCategory.createCategory(testUser.id, {name: categoryName});

		const newUser = await app.registerUser({
			email: 'new@user.com',
			name: 'new',
			password: 'new',
			permissions: [CorePermissionName.UserAll]
		});

		let groupSection1 = await groupCategory.createGroupSection(testUser.id, {
			name: 'test',
			title: 'Test2'
		});

		console.log('app.ms.group.updateGroupSection(testUser.id, groupSection1.id');
		groupSection1 = await groupCategory.updateGroupSection(testUser.id, groupSection1.id, {
			title: 'Test2 changed'
		});

		assert.equal(groupSection1.title, 'Test2 changed');

		try {
			await groupCategory.updateGroupSection(newUser.id, groupSection1.id, {title: 'Test2 changed 2'});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}

		console.log('app.ms.group.updateGroupSection(testUser.id, groupSection1.id');
		groupSection1 = await groupCategory.updateGroupSection(testUser.id, groupSection1.id, {
			title: 'Test2 changed',
			categoryId: category.id
		});
		assert.equal(groupSection1.categoryId, category.id);

		try {
			await groupCategory.updateGroupSection(newUser.id, groupSection1.id, {title: 'Test2 changed 2'});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}

		console.log('app.addAdminToCategory(testUser.id, category.id, newUser.id)');
		await groupCategory.addAdminToCategory(testUser.id, category.id, newUser.id);

		console.log('app.ms.group.updateGroupSection(newUser.id, groupSection1.id');
		groupSection1 = await groupCategory.updateGroupSection(newUser.id, groupSection1.id, {title: 'Test2 changed 2'});

		assert.equal(groupSection1.title, 'Test2 changed 2');

		console.log('groupCategory.setSectionOfGroup(testUser.id, testGroup.id, groupSection1.id)');
		await groupCategory.setSectionOfGroup(testUser.id, testGroup.id, groupSection1.id);

		console.log('app.ms.group.createGroupSection(testUser.id');
		await groupCategory.createGroupSection(testUser.id, {
			name: 'test',
			title: 'Test3'
		});

		const sectionsData = await groupCategory.getGroupSectionItems({categoryId: category.id});
		assert.equal(sectionsData.total, 1);
	});

	it('membershipOfCategory', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const category = await groupCategory.createCategory(testUser.id, {name: 'category'});
		await groupCategory.addGroupToCategory(testUser.id, testGroup.id, category.id);

		const newMember = await app.registerUser({
			email: 'new1@user.com',
			name: 'new1',
			password: 'new1',
			permissions: [CorePermissionName.UserAll]
		});

		const post1Content = await app.ms.content.saveData(testUser.id, 'Hello world1', null, {
			mimeType: 'text/markdown'
		});

		const postData = {
			contents: [{manifestStorageId: post1Content.manifestStorageId, view: ContentView.Attachment}],
			groupId: testGroup.id,
			status: PostStatus.Published
		};
		try {
			await app.ms.group.createPost(newMember.id, postData);
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}

		await groupCategory.addMemberToCategory(testUser.id, category.id, newMember.id);

		try {
			await app.ms.group.createPost(newMember.id, postData);
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}

		await groupCategory.addGroupToCategoryMembership(testUser.id, testGroup.id, category.id);

		const post = await app.ms.group.createPost(newMember.id, postData);
		assert.equal(post.groupId, testGroup.id);
	});
});
