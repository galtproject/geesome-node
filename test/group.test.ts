/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from 'assert';
import commonHelper from "geesome-libs/src/common.js";
import trieHelper from "geesome-libs/src/base36Trie.js";
import {ContentView, CorePermissionName} from "../app/modules/database/interface.js";
import {PostStatus} from "../app/modules/group/interface.js";
import {IGeesomeApp} from "../app/interface.js";

describe("group", function () {
	this.timeout(60000);

	let admin, app: IGeesomeApp;
	beforeEach(async () => {
		const appConfig: any = (await import('../app/config.js')).default;
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
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it('requires actor-scoped content rows for post attachments', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const ownerContent = await app.ms.content.saveData(testUser.id, 'private attachment', null, {
			mimeType: 'text/markdown'
		});
		const newUser = await app.registerUser({
			email: 'new@user.com',
			name: 'new',
			password: 'new',
			permissions: [CorePermissionName.UserAll]
		});
		const newGroup = await app.ms.group.createGroup(newUser.id, {name: 'new-group', title: 'New group'});

		await assert.rejects(
			() => app.ms.group.createPost(newUser.id, {
				contents: [{id: ownerContent.id, view: ContentView.Attachment}],
				groupId: newGroup.id,
				status: PostStatus.Published
			}),
			(error: Error) => error.message === 'content_not_permitted'
		);

		const post = await app.ms.group.createPost(newUser.id, {
			contents: [{manifestStorageId: ownerContent.manifestStorageId, view: ContentView.Attachment}],
			groupId: newGroup.id,
			status: PostStatus.Published
		});
		const gotPost = await app.ms.group.getPostPure(post.id);
		assert.equal(gotPost.contents.length, 1);
		assert.equal(gotPost.contents[0].userId, newUser.id);
		assert.equal(gotPost.contents[0].storageId, ownerContent.storageId);
		assert.notEqual(gotPost.contents[0].id, ownerContent.id);
	});

	it('imports remote group media into actor-scoped content rows', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const ownerAvatar = await app.ms.content.saveData(testUser.id, 'private avatar', null, {
			mimeType: 'text/markdown'
		});
		const avatarObject = await app.ms.entityJsonManifest.manifestIdToDbObject(ownerAvatar.manifestStorageId, 'content');
		const newUser = await app.registerUser({
			email: 'remote-media@user.com',
			name: 'remote-media',
			password: 'remote-media',
			permissions: [CorePermissionName.UserAll]
		});

		const importedGroup = await app.ms.group.createGroupByObject(newUser.id, {
			name: 'remote-media-group',
			title: 'Remote media group',
			isRemote: true,
			avatarImage: avatarObject
		});
		const gotGroup = await app.ms.group.getGroup(importedGroup.id);

		assert.equal(gotGroup.avatarImage.userId, newUser.id);
		assert.equal(gotGroup.avatarImage.storageId, ownerAvatar.storageId);
		assert.notEqual(gotGroup.avatarImage.id, ownerAvatar.id);
		assert.equal(gotGroup.coverImageId, null);
	});

	it('allocates group local ids with a row lock under concurrency', async () => {
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const expectedLocalIds = Array.from({length: 8}, (_, index) => index + 1);

		const localIds = await Promise.all(expectedLocalIds.map(() => {
			return app.ms.group.getPostLocalId({groupId: testGroup.id} as any);
		}));
		localIds.sort((a, b) => a - b);

		assert.deepEqual(localIds, expectedLocalIds);
		assert.equal((await app.ms.group.getGroup(testGroup.id)).publishedPostsCount, expectedLocalIds.length);
	});

	it('deletes published replies with counters in one DB transaction', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const parentContent = await app.ms.content.saveData(testUser.id, 'parent post', null, {
			mimeType: 'text/markdown'
		});
		const replyContent = await app.ms.content.saveData(testUser.id, 'reply post', null, {
			mimeType: 'text/markdown'
		});

		const parentPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: parentContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const replyPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: replyContent.id, view: ContentView.Contents}],
			replyToId: parentPost.id,
			groupId: testGroup.id,
			status: PostStatus.Published
		});

		const groupBeforeDelete = await app.ms.group.getGroup(testGroup.id);
		assert.equal(groupBeforeDelete.availablePostsCount, 2);
		assert.equal(Number(groupBeforeDelete.size), Number(parentContent.size) + Number(replyContent.size));
		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repliesCount, 1);

		await app.ms.group.deletePosts(testUser.id, [replyPost.id]);

		const groupAfterDelete = await app.ms.group.getGroup(testGroup.id);
		assert.equal(groupAfterDelete.availablePostsCount, 1);
		assert.equal(Number(groupAfterDelete.size), Number(parentContent.size));
		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repliesCount, 0);
		assert.equal((await app.ms.group.getPostPure(replyPost.id)).isDeleted, true);
	});

	it('reconciles reply counters when published replies become drafts', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const parentContent = await app.ms.content.saveData(testUser.id, 'status parent post', null, {
			mimeType: 'text/markdown'
		});
		const replyContent = await app.ms.content.saveData(testUser.id, 'status reply post', null, {
			mimeType: 'text/markdown'
		});

		const parentPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: parentContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const replyPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: replyContent.id, view: ContentView.Contents}],
			replyToId: parentPost.id,
			groupId: testGroup.id,
			status: PostStatus.Published
		});

		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repliesCount, 1);

		await app.ms.group.updatePost(testUser.id, replyPost.id, {status: PostStatus.Draft});

		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repliesCount, 0);
	});

	it('removes deleted posts from regenerated group manifest trie', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const firstContent = await app.ms.content.saveData(testUser.id, 'first manifest post', null, {
			mimeType: 'text/markdown'
		});
		const secondContent = await app.ms.content.saveData(testUser.id, 'second manifest post', null, {
			mimeType: 'text/markdown'
		});

		const firstPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: firstContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const secondPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: secondContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});

		const groupBeforeDelete = await app.ms.group.getGroup(testGroup.id);
		const manifestBeforeDelete = await app.ms.storage.getObject(groupBeforeDelete.manifestStorageId);
		assert.equal(trieHelper.getNode(manifestBeforeDelete.posts, firstPost.localId), firstPost.manifestStorageId);
		assert.equal(trieHelper.getNode(manifestBeforeDelete.posts, secondPost.localId), secondPost.manifestStorageId);

		await app.ms.group.deletePosts(testUser.id, [firstPost.id]);

		const groupAfterDelete = await app.ms.group.getGroup(testGroup.id);
		const manifestAfterDelete = await app.ms.storage.getObject(groupAfterDelete.manifestStorageId);
		assert.equal(trieHelper.getNode(manifestAfterDelete.posts, firstPost.localId), undefined);
		assert.equal(trieHelper.getNode(manifestAfterDelete.posts, secondPost.localId), secondPost.manifestStorageId);
	});

	it('removes unpublished posts from regenerated group manifest trie', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const firstContent = await app.ms.content.saveData(testUser.id, 'first status manifest post', null, {
			mimeType: 'text/markdown'
		});
		const secondContent = await app.ms.content.saveData(testUser.id, 'second status manifest post', null, {
			mimeType: 'text/markdown'
		});

		const firstPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: firstContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const secondPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: secondContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});

		const groupBeforeUnpublish = await app.ms.group.getGroup(testGroup.id);
		const manifestBeforeUnpublish = await app.ms.storage.getObject(groupBeforeUnpublish.manifestStorageId);
		assert.equal(trieHelper.getNode(manifestBeforeUnpublish.posts, firstPost.localId), firstPost.manifestStorageId);
		assert.equal(trieHelper.getNode(manifestBeforeUnpublish.posts, secondPost.localId), secondPost.manifestStorageId);
		assert.equal(groupBeforeUnpublish.availablePostsCount, 2);

		await app.ms.group.updatePost(testUser.id, firstPost.id, {status: PostStatus.Draft});

		const groupAfterUnpublish = await app.ms.group.getGroup(testGroup.id);
		const manifestAfterUnpublish = await app.ms.storage.getObject(groupAfterUnpublish.manifestStorageId);
		assert.equal(trieHelper.getNode(manifestAfterUnpublish.posts, firstPost.localId), undefined);
		assert.equal(trieHelper.getNode(manifestAfterUnpublish.posts, secondPost.localId), secondPost.manifestStorageId);
		assert.equal(groupAfterUnpublish.availablePostsCount, 1);
		assert.equal(Number(groupAfterUnpublish.size), Number(secondContent.size));
	});

	it('scans changed group manifest refs in cursor batches', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const posts = [];
		for (const index of [0, 1, 2, 3]) {
			const content = await app.ms.content.saveData(testUser.id, `batched manifest post ${index}`, null, {
				mimeType: 'text/markdown'
			});
			posts.push(await app.ms.group.createPost(testUser.id, {
				contents: [{id: content.id, view: ContentView.Contents}],
				groupId: testGroup.id,
				status: PostStatus.Published
			}));
		}

		const groupBeforeDelete = await app.ms.group.getGroup(testGroup.id);
		await app.ms.group.updatePosts([posts[1].id, posts[3].id], {isDeleted: true});

		const manifest = await app.ms.entityJsonManifest.generateManifest('group', groupBeforeDelete, {
			postRefsBatchSize: 1
		});
		assert.equal(trieHelper.getNode(manifest.posts, posts[0].localId), posts[0].manifestStorageId);
		assert.equal(trieHelper.getNode(manifest.posts, posts[1].localId), undefined);
		assert.equal(trieHelper.getNode(manifest.posts, posts[2].localId), posts[2].manifestStorageId);
		assert.equal(trieHelper.getNode(manifest.posts, posts[3].localId), undefined);
	});

	it('hydrates timeline pages after id-only page selection', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const sourceContent = await app.ms.content.saveData(testUser.id, 'source post', null, {
			mimeType: 'text/markdown'
		});
		const sourcePost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: sourceContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			publishedAt: new Date('2026-01-01T00:00:00.000Z'),
			status: PostStatus.Published
		});

		const middleContent = await app.ms.content.saveData(testUser.id, 'middle post', null, {
			mimeType: 'text/markdown'
		});
		const middlePost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: middleContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			publishedAt: new Date('2026-01-02T00:00:00.000Z'),
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
			publishedAt: new Date('2026-01-03T00:00:00.000Z'),
			repostOfId: sourcePost.id,
			status: PostStatus.Published
		});

		const offsetPage = await app.ms.group.getGroupPosts(testGroup.id, {}, {limit: 2});
		assert.equal(offsetPage.total, 3);
		assert.equal(offsetPage.nextCursor, null);
		assert.deepEqual(offsetPage.list.map(post => post.id), [newestPost.id, middlePost.id]);
		assert.deepEqual(offsetPage.list[0].contents.map(content => content.id), [newestAttachment.id, newestBody.id]);
		assert.deepEqual(offsetPage.list[0].contents.map(content => content.postsContents.view), [ContentView.Attachment, ContentView.Contents]);
		assert.equal(offsetPage.list[0].repostOf.id, sourcePost.id);
		assert.deepEqual(offsetPage.list[0].repostOf.contents.map(content => content.id), [sourceContent.id]);

		const firstCursorPage = await app.ms.group.getGroupPosts(testGroup.id, {
			cursorPublishedAt: new Date('2999-01-01T00:00:00.000Z'),
			cursorId: '999999999'
		}, {limit: 2});
		assert.equal(firstCursorPage.total, null);
		assert.deepEqual(firstCursorPage.list.map(post => post.id), [newestPost.id, middlePost.id]);
		assert(firstCursorPage.nextCursor);

		const secondCursorPage = await app.ms.group.getGroupPosts(testGroup.id, {
			cursorPublishedAt: firstCursorPage.nextCursor.publishedAt,
			cursorId: firstCursorPage.nextCursor.id
		}, {limit: 2});
		assert.equal(secondCursorPage.total, null);
		assert.equal(secondCursorPage.nextCursor, null);
		assert.deepEqual(secondCursorPage.list.map(post => post.id), [sourcePost.id]);

		const allPosts = await app.ms.group.getAllPosts({groupId: testGroup.id}, {
			limit: 3,
			sortBy: 'publishedAt',
			sortDir: 'desc'
		});
		assert.deepEqual(allPosts.map(post => post.id), [newestPost.id, middlePost.id, sourcePost.id]);
		assert.deepEqual(allPosts[0].contents.map(content => content.id), [newestAttachment.id, newestBody.id]);
	});

	it('returns lightweight group post refs without hydrating contents', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const content = await app.ms.content.saveData(testUser.id, 'lightweight ref body', null, {
			mimeType: 'text/markdown'
		});
		const post = await app.ms.group.createPost(testUser.id, {
			contents: [{id: content.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			publishedAt: new Date('2026-01-04T00:00:00.000Z'),
			status: PostStatus.Published
		});

		const refs = await app.ms.group.getGroupPostRefs(testGroup.id, {}, {
			limit: 1,
			sortBy: 'publishedAt'
		});
		const refJson = refs[0].toJSON();

		assert.equal(refs.length, 1);
		assert.equal(refJson.id, post.id);
		assert.equal(refJson.localId, post.localId);
		assert.deepEqual(Object.keys(refJson).sort(), ['id', 'localId', 'publishedAt'].sort());
	});

	it('iterates lightweight group post refs in cursor batches', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const createdPosts = [];
		for (const publishedAt of [
			'2026-01-04T00:00:00.000Z',
			'2026-01-01T00:00:00.000Z',
			'2026-01-03T00:00:00.000Z',
			'2026-01-05T00:00:00.000Z',
			'2026-01-02T00:00:00.000Z'
		]) {
			createdPosts.push(await app.ms.group.createPost(testUser.id, {
				groupId: testGroup.id,
				publishedAt: new Date(publishedAt),
				status: PostStatus.Published
			}));
		}

		const batchSizes = [];
		const seenPostIds = [];
		await app.ms.group.forEachGroupPostRefBatch(testGroup.id, {
			batchLimit: 2,
			listParams: {
				sortBy: 'publishedAt',
				sortDir: 'ASC'
			},
			attributes: ['id', 'publishedAt'],
			cursor: {
				cursorValueFilter: 'testCursorPublishedAt',
				cursorIdFilter: 'testCursorId',
				direction: 'after',
				orderDir: 'ASC'
			}
		}, async ({postRefs}) => {
			batchSizes.push(postRefs.length);
			postRefs.forEach(postRef => {
				const refJson = postRef.toJSON();
				assert.deepEqual(Object.keys(refJson).sort(), ['id', 'publishedAt'].sort());
				seenPostIds.push(postRef.id);
			});
		});
		const expectedPostIds = createdPosts
			.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime() || a.id - b.id)
			.map(post => post.id);

		assert.deepEqual(batchSizes, [2, 2, 1]);
		assert.deepEqual(seenPostIds, expectedPostIds);
	});

	it('reverses social import local ids from cursor-batched refs', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const socNetImport = (app.ms as any).socNetImport;
		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			accountId: 1,
			socNet: 'test',
			groupId: testGroup.id,
			channelId: 'reverse-local-ids',
			title: 'Reverse Local IDs'
		});

		for (const [index, publishedAt] of [
			'2026-01-05T00:00:00.000Z',
			'2026-01-04T00:00:00.000Z',
			'2026-01-03T00:00:00.000Z',
			'2026-01-02T00:00:00.000Z',
			'2026-01-01T00:00:00.000Z'
		].entries()) {
			const post = await app.ms.group.createPost(testUser.id, {
				groupId: testGroup.id,
				publishedAt: new Date(publishedAt),
				status: PostStatus.Published
			});
			await socNetImport.storeMessage(null, {
				userId: testUser.id,
				dbChannelId: channel.id,
				msgId: String(index + 1),
				postId: post.id,
				timestamp: Math.floor(new Date(publishedAt).getTime() / 1000),
				isNeedToReverse: true
			});
		}

		await socNetImport.reversePostsLocalIds(testUser.id, channel.id);

		const postRefs = await app.ms.group.getGroupPostRefs(testGroup.id, {}, {
			sortBy: 'publishedAt',
			sortDir: 'ASC',
			limit: 10
		}, {
			attributes: ['id', 'localId', 'publishedAt']
		});

		assert.deepEqual(postRefs.map(post => post.localId), [1, 2, 3, 4, 5]);
		assert.equal(await socNetImport.getDbChannelStartReverseMessage(channel.id), null);
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
			assert.equal(e.toString().includes("incorrect_name"), true);
		}
		try {
			await app.ms.group.createGroup(newUser.id, {title: 'Test2'});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("incorrect_name"), true);
		}
		const group2 = await app.ms.group.createGroup(newUser.id, {name: 'test2', title: 'Test2'});
		const newUserContentRef = {manifestStorageId: postContent.manifestStorageId, view: ContentView.Contents};

		await app.ms.group.createPost(newUser.id, {
			contents: [newUserContentRef],
			replyToId: testPost.id,
			groupId: group2.id,
			status: PostStatus.Published
		});

		await app.ms.group.updateGroup(testUser.id, testGroup.id, {isReplyForbidden: true});

		try {
			await app.ms.group.createPost(newUser.id, {
				contents: [newUserContentRef],
				replyToId: testPost.id,
				groupId: group2.id,
				status: PostStatus.Published
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}

		await app.ms.group.updatePost(testUser.id, testPost.id, {isReplyForbidden: false});

		await app.ms.group.createPost(newUser.id, {
			contents: [newUserContentRef],
			replyToId: testPost.id,
			groupId: group2.id,
			status: PostStatus.Published
		});

		await app.ms.group.updateGroup(testUser.id, testGroup.id, {isReplyForbidden: false});

		await app.ms.group.createPost(newUser.id, {
			contents: [newUserContentRef],
			replyToId: testPost.id,
			groupId: group2.id,
			status: PostStatus.Published
		});

		await app.ms.group.updatePost(testUser.id, testPost.id, {isReplyForbidden: true});

		try {
			await app.ms.group.createPost(newUser.id, {
				contents: [newUserContentRef],
				replyToId: testPost.id,
				groupId: group2.id,
				status: PostStatus.Published
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
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
				name: testGroup.name + '_deleted_' + commonHelper.makeCode(16),
				isDeleted: true
			});
			assert.equal(true, false);
		} catch (e) {
			assert.equal(e.toString().includes("not_permitted"), true);
		}

		await app.ms.group.updateGroup(newUser.id, testGroup.id, {
			name: testGroup.name + '_deleted_' + commonHelper.makeCode(16),
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
			assert.equal(e.toString().includes("Validation error"), true);
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
			assert.equal(e.toString().includes("SequelizeUniqueConstraintError"), true);
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

	it('uses readPostId for unread posts with the same publishedAt timestamp', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const publishedAt = new Date('2026-05-09T12:00:00.000Z');
		const content = await app.ms.content.saveData(testUser.id, 'same timestamp unread cursor', null, {
			mimeType: 'text/markdown'
		});
		const postData = {
			contents: [{manifestStorageId: content.manifestStorageId, view: ContentView.Attachment}],
			groupId: testGroup.id,
			publishedAt,
			status: PostStatus.Published
		};

		const olderSameTimePost = await app.ms.group.createPost(testUser.id, postData);
		const newerSameTimePost = await app.ms.group.createPost(testUser.id, postData);

		await app.ms.group.addOrUpdateGroupRead(testUser.id, {
			groupId: testGroup.id,
			readAt: publishedAt,
			readPostId: olderSameTimePost.id
		});
		const unreadAfterOlderCursor = await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id);

		assert.equal(unreadAfterOlderCursor.count, 1);
		assert.equal(unreadAfterOlderCursor.readPostId, olderSameTimePost.id);

		await app.ms.group.addOrUpdateGroupRead(testUser.id, {
			groupId: testGroup.id,
			readAt: publishedAt,
			readPostId: newerSameTimePost.id
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
