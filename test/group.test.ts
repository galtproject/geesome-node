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
import {PostEventAction, PostEventType, PostStatus} from "../app/modules/group/interface.js";
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

	it('imports remote post manifests through canonical post state', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const sourceGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const sourceDate = new Date('2026-05-12T08:30:00.000Z');
		const textContent = await app.ms.content.saveData(testUser.id, 'remote post text', 'remote-post-text.md', {
			mimeType: 'text/markdown'
		});
		const attachmentContent = await app.ms.content.saveData(testUser.id, 'remote post attachment', 'remote-post-attachment.md', {
			mimeType: 'text/markdown'
		});
		const sourcePost = await app.ms.group.createPost(testUser.id, {
			contents: [
				{id: textContent.id, view: ContentView.Contents},
				{id: attachmentContent.id, view: ContentView.Attachment}
			],
			groupId: sourceGroup.id,
			source: 'remote-source',
			sourceChannelId: 'remote-channel',
			sourcePostId: 'remote-post',
			sourceDate,
			status: PostStatus.Published
		});
		const importer = await app.registerUser({
			email: 'remote-post@user.com',
			name: 'remote-post',
			password: 'remote-post',
			permissions: [CorePermissionName.UserAll]
		});
		const targetGroup = await app.ms.group.createGroup(importer.id, {
			name: 'remote-post-import',
			title: 'Remote post import'
		});

		const importedPost = await (app.ms as any).remoteGroup.createPostByRemoteStorageId(
			importer.id,
			sourcePost.manifestStorageId,
			targetGroup.id,
			sourcePost.publishedAt
		);
		const gotPost = await app.ms.group.getPostPure(importedPost.id);
		const gotGroup = await app.ms.group.getGroup(targetGroup.id);
		const groupManifest = await app.ms.storage.getObject(gotGroup.manifestStorageId);
		const models = (app.ms.database as any).models;
		const postEvents = await models.PostEvent.findAll({
			where: {postId: importedPost.id},
			order: [['createdAt', 'ASC'], ['id', 'ASC']]
		});

		assert.equal(gotPost.userId, importer.id);
		assert.equal(gotPost.groupId, targetGroup.id);
		assert.equal(gotPost.manifestStorageId, sourcePost.manifestStorageId);
		assert.equal(gotPost.source, 'remote-source');
		assert.equal(gotPost.sourceChannelId, 'remote-channel');
		assert.equal(gotPost.sourcePostId, 'remote-post');
		assert.equal(new Date(gotPost.sourceDate).toISOString(), sourceDate.toISOString());
		assert.equal(gotPost.contents.length, 2);
		assert.equal(gotPost.contents[0].userId, importer.id);
		assert.equal(gotPost.contents[0].storageId, textContent.storageId);
		assert.notEqual(gotPost.contents[0].id, textContent.id);
		assert.equal(gotPost.contents[0].postsContents.view, ContentView.Contents);
		assert.equal(gotPost.contents[1].userId, importer.id);
		assert.equal(gotPost.contents[1].storageId, attachmentContent.storageId);
		assert.notEqual(gotPost.contents[1].id, attachmentContent.id);
		assert.equal(gotPost.contents[1].postsContents.view, ContentView.Attachment);
		assert.equal(Number(gotGroup.availablePostsCount), 1);
		assert.equal(Number(gotGroup.size), Number(textContent.size) + Number(attachmentContent.size));
		assert.equal(trieHelper.getNode(groupManifest.posts, gotPost.localId), gotPost.manifestStorageId);
		assert.deepEqual(postEvents.map(event => `${event.type}:${event.action}`), [
			`${PostEventType.PostLifecycle}:${PostEventAction.Created}`,
			`${PostEventType.SourceImport}:${PostEventAction.Created}`
		]);
	});

	it('reuses an active remote post when the same manifest import is retried', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const sourceGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const sourceContent = await app.ms.content.saveData(testUser.id, 'retryable remote post', 'retryable-remote-post.md', {
			mimeType: 'text/markdown'
		});
		const sourcePost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: sourceContent.id, view: ContentView.Contents}],
			groupId: sourceGroup.id,
			status: PostStatus.Published
		});
		const importer = await app.registerUser({
			email: 'remote-post-retry@user.com',
			name: 'remote-post-retry',
			password: 'remote-post-retry',
			permissions: [CorePermissionName.UserAll]
		});
		const targetGroup = await app.ms.group.createGroup(importer.id, {
			name: 'remote-post-retry-import',
			title: 'Remote post retry import'
		});
		const models = (app.ms.database as any).models;

		await app.ms.content.createContentByRemoteStorageId(importer.id, sourceContent.manifestStorageId);
		const importedPosts = await Promise.all([
			(app.ms as any).remoteGroup.createPostByRemoteStorageId(importer.id, sourcePost.manifestStorageId, targetGroup.id),
			(app.ms as any).remoteGroup.createPostByRemoteStorageId(importer.id, sourcePost.manifestStorageId, targetGroup.id)
		]);
		const gotGroup = await app.ms.group.getGroup(targetGroup.id);
		const postCount = await models.Post.count({
			where: {
				groupId: targetGroup.id,
				manifestStorageId: sourcePost.manifestStorageId,
				isDeleted: false
			}
		});
		const postEvents = await models.PostEvent.findAll({
			where: {postId: importedPosts[0].id},
			order: [['createdAt', 'ASC'], ['id', 'ASC']]
		});

		assert.equal(importedPosts[0].id, importedPosts[1].id);
		assert.equal(postCount, 1);
		assert.equal(Number(gotGroup.availablePostsCount), 1);
		assert.equal(Number(gotGroup.publishedPostsCount), 1);
		assert.equal(Number(gotGroup.size), Number(sourceContent.size));
		assert.deepEqual(postEvents.map(event => `${event.type}:${event.action}`), [
			`${PostEventType.PostLifecycle}:${PostEventAction.Created}`
		]);
	});

	it('imports remote group manifest post refs idempotently', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const sourceGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const firstContent = await app.ms.content.saveData(testUser.id, 'remote group first post', 'remote-group-first.md', {
			mimeType: 'text/markdown'
		});
		const secondContent = await app.ms.content.saveData(testUser.id, 'remote group second post', 'remote-group-second.md', {
			mimeType: 'text/markdown'
		});
		const firstSourcePost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: firstContent.id, view: ContentView.Contents}],
			groupId: sourceGroup.id,
			status: PostStatus.Published
		});
		const secondSourcePost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: secondContent.id, view: ContentView.Attachment}],
			groupId: sourceGroup.id,
			status: PostStatus.Published
		});
		const sourceGroupAfterPosts = await app.ms.group.getGroup(sourceGroup.id);
		const sourceGroupManifest = await app.ms.storage.getObject(sourceGroupAfterPosts.manifestStorageId);
		const remoteGroupManifest = {
			...sourceGroupManifest,
			name: 'remote-group-posts-import',
			title: 'Remote group posts import',
			staticId: 'remote-group-posts-import-static-id'
		};
		const remoteGroupManifestStorageId = await app.saveDataStructure(remoteGroupManifest, {waitForStorage: true});
		const importer = await app.registerUser({
			email: 'remote-group-posts@user.com',
			name: 'remote-group-posts',
			password: 'remote-group-posts',
			permissions: [CorePermissionName.UserAll]
		});
		const models = (app.ms.database as any).models;

		const importedGroup = await (app.ms as any).remoteGroup.createGroupByRemoteStorageId(importer.id, remoteGroupManifestStorageId);
		const importedGroupAgain = await (app.ms as any).remoteGroup.createGroupByRemoteStorageId(importer.id, remoteGroupManifestStorageId);
		const gotGroup = await app.ms.group.getGroup(importedGroup.id);
		const groupManifest = await app.ms.storage.getObject(gotGroup.manifestStorageId);
		const importedPosts = await models.Post.findAll({
			where: {
				groupId: importedGroup.id,
				isDeleted: false,
				status: PostStatus.Published
			},
			order: [['localId', 'ASC']]
		});
		const postEvents = await models.PostEvent.findAll({
			where: {
				postId: importedPosts.map(post => post.id)
			},
			order: [['postId', 'ASC'], ['id', 'ASC']]
		});

		assert.equal(importedGroup.id, importedGroupAgain.id);
		assert.deepEqual(importedPosts.map(post => post.localId), [firstSourcePost.localId, secondSourcePost.localId]);
		assert.deepEqual(importedPosts.map(post => post.manifestStorageId), [firstSourcePost.manifestStorageId, secondSourcePost.manifestStorageId]);
		assert.equal(Number(gotGroup.availablePostsCount), 2);
		assert.equal(Number(gotGroup.publishedPostsCount), secondSourcePost.localId);
		assert.equal(Number(gotGroup.size), Number(firstContent.size) + Number(secondContent.size));
		assert.equal(trieHelper.getNode(groupManifest.posts, firstSourcePost.localId), firstSourcePost.manifestStorageId);
		assert.equal(trieHelper.getNode(groupManifest.posts, secondSourcePost.localId), secondSourcePost.manifestStorageId);
		assert.deepEqual(postEvents.map(event => `${event.type}:${event.action}`), [
			`${PostEventType.PostLifecycle}:${PostEventAction.Created}`,
			`${PostEventType.PostLifecycle}:${PostEventAction.Created}`
		]);
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

	it('keeps group local ids unique when the counter is stale', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const models = (app.ms.database as any).models;
		await models.Post.create({
			groupId: testGroup.id,
			userId: testUser.id,
			status: PostStatus.Published,
			localId: 5,
			isDeleted: false,
			isRemote: false
		});
		await models.Group.update({publishedPostsCount: 1}, {where: {id: testGroup.id}});

		const nextLocalId = await app.ms.group.getPostLocalId({groupId: testGroup.id} as any);

		assert.equal(nextLocalId, 6);
		assert.equal((await app.ms.group.getGroup(testGroup.id)).publishedPostsCount, 6);
		await assert.rejects(
			() => models.Post.create({
				groupId: testGroup.id,
				userId: testUser.id,
				status: PostStatus.Published,
				localId: 5,
				isDeleted: false,
				isRemote: false
			}),
			(error: Error) => error.name === 'SequelizeUniqueConstraintError'
		);
	});

	it('returns static rebind candidates as a bounded oldest-first batch', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const models = (app.ms.database as any).models;
		const oldGroup = await app.ms.group.createGroup(testUser.id, {name: 'old-static', title: 'Old Static'});
		const middleGroup = await app.ms.group.createGroup(testUser.id, {name: 'middle-static', title: 'Middle Static'});
		const freshGroup = await app.ms.group.createGroup(testUser.id, {name: 'fresh-static', title: 'Fresh Static'});
		const deletedGroup = await app.ms.group.createGroup(testUser.id, {name: 'deleted-static', title: 'Deleted Static'});

		await models.Group.update({
			staticStorageUpdatedAt: commonHelper.moveDate(-10, 'minute')
		}, {where: {id: oldGroup.id}});
		await models.Group.update({
			staticStorageUpdatedAt: commonHelper.moveDate(-5, 'minute')
		}, {where: {id: middleGroup.id}});
		await models.Group.update({
			staticStorageUpdatedAt: commonHelper.moveDate(-10, 'second')
		}, {where: {id: freshGroup.id}});
		await models.Group.update({
			staticStorageUpdatedAt: commonHelper.moveDate(-20, 'minute'),
			isDeleted: true
		}, {where: {id: deletedGroup.id}});

		const outdatedGroups = await app.ms.group.getGroupWhereStaticOutdated(60, {limit: 2});

		assert.deepEqual(outdatedGroups.map(group => group.id), [oldGroup.id, middleGroup.id]);
	});

	it('reuses existing social import posts by source identity', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const models = (app.ms.database as any).models;
		const socNetImport = (app.ms as any).socNetImport;
		const firstContent = await app.ms.content.saveData(testUser.id, 'first imported body', null, {
			mimeType: 'text/markdown'
		});
		const secondContent = await app.ms.content.saveData(testUser.id, 'updated imported body', null, {
			mimeType: 'text/markdown'
		});
		const groupBeforeImport = await app.ms.group.getGroup(testGroup.id);
		const sourceIdentity = {
			groupId: testGroup.id,
			source: 'socNetImport:test',
			sourceChannelId: 'channel-1',
			sourcePostId: 'post-1'
		};
		const firstPost = await socNetImport.createPostOrUpdateSourceIdentity(testUser.id, {
			...sourceIdentity,
			contents: [{id: firstContent.id, view: ContentView.Contents}],
			propertiesJson: JSON.stringify({sourceLink: 'first'}),
			sourceDate: new Date('2026-01-01T00:00:00.000Z'),
			status: PostStatus.Published
		});
		const groupAfterFirstImport = await app.ms.group.getGroup(testGroup.id);
		const secondPost = await socNetImport.createPostOrUpdateSourceIdentity(testUser.id, {
			...sourceIdentity,
			contents: [{id: secondContent.id, view: ContentView.Contents}],
			propertiesJson: JSON.stringify({sourceLink: 'updated'}),
			sourceDate: new Date('2026-01-01T00:00:00.000Z'),
			status: PostStatus.Published
		});

		const gotPost = await app.ms.group.getPostPure(firstPost.id);
		const groupAfterSecondImport = await app.ms.group.getGroup(testGroup.id);
		const sourceRowsCount = await models.Post.count({where: sourceIdentity});

		assert.equal(secondPost.id, firstPost.id);
		assert.equal(sourceRowsCount, 1);
		assert.deepEqual(gotPost.contents.map(content => content.id), [secondContent.id]);
		assert.equal(JSON.parse(gotPost.propertiesJson).sourceLink, 'updated');
		assert.equal(groupAfterFirstImport.availablePostsCount, groupBeforeImport.availablePostsCount + 1);
		assert.equal(groupAfterSecondImport.availablePostsCount, groupAfterFirstImport.availablePostsCount);
		assert.equal(Number(groupAfterFirstImport.size), Number(groupBeforeImport.size) + Number(firstContent.size));
		assert.equal(Number(groupAfterSecondImport.size), Number(groupBeforeImport.size) + Number(secondContent.size));

		const otherGroup = await app.ms.group.createGroup(testUser.id, {
			name: 'same-source-other-group',
			title: 'Same source other group'
		});
		const otherPost = await socNetImport.createPostOrUpdateSourceIdentity(testUser.id, {
			...sourceIdentity,
			groupId: otherGroup.id,
			contents: [{id: firstContent.id, view: ContentView.Contents}],
			propertiesJson: JSON.stringify({sourceLink: 'other-group'}),
			sourceDate: new Date('2026-01-01T00:00:00.000Z'),
			status: PostStatus.Published
		});

		assert.notEqual(otherPost.id, firstPost.id);
	});

	it('reconciles relation counters when social import upserts move targets', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const socNetImport = (app.ms as any).socNetImport;
		const firstReplyParentContent = await app.ms.content.saveData(testUser.id, 'first reply parent', null, {
			mimeType: 'text/markdown'
		});
		const secondReplyParentContent = await app.ms.content.saveData(testUser.id, 'second reply parent', null, {
			mimeType: 'text/markdown'
		});
		const firstRepostParentContent = await app.ms.content.saveData(testUser.id, 'first repost parent', null, {
			mimeType: 'text/markdown'
		});
		const secondRepostParentContent = await app.ms.content.saveData(testUser.id, 'second repost parent', null, {
			mimeType: 'text/markdown'
		});
		const importContent = await app.ms.content.saveData(testUser.id, 'imported relation body', null, {
			mimeType: 'text/markdown'
		});
		const firstReplyParent = await app.ms.group.createPost(testUser.id, {
			contents: [{id: firstReplyParentContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const secondReplyParent = await app.ms.group.createPost(testUser.id, {
			contents: [{id: secondReplyParentContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const firstRepostParent = await app.ms.group.createPost(testUser.id, {
			contents: [{id: firstRepostParentContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const secondRepostParent = await app.ms.group.createPost(testUser.id, {
			contents: [{id: secondRepostParentContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const sourceIdentity = {
			groupId: testGroup.id,
			source: 'socNetImport:test',
			sourceChannelId: 'counter-channel',
			sourcePostId: 'counter-post'
		};
		const firstPost = await socNetImport.createPostOrUpdateSourceIdentity(testUser.id, {
			...sourceIdentity,
			contents: [{id: importContent.id, view: ContentView.Contents}],
			replyToId: firstReplyParent.id,
			repostOfId: firstRepostParent.id,
			propertiesJson: JSON.stringify({sourceLink: 'first-targets'}),
			sourceDate: new Date('2026-01-02T00:00:00.000Z'),
			status: PostStatus.Published
		});

		assert.equal((await app.ms.group.getPostPure(firstReplyParent.id)).repliesCount, 1);
		assert.equal((await app.ms.group.getPostPure(firstRepostParent.id)).repostsCount, 1);

		const secondPost = await socNetImport.createPostOrUpdateSourceIdentity(testUser.id, {
			...sourceIdentity,
			contents: [{id: importContent.id, view: ContentView.Contents}],
			replyToId: secondReplyParent.id,
			repostOfId: secondRepostParent.id,
			propertiesJson: JSON.stringify({sourceLink: 'second-targets'}),
			sourceDate: new Date('2026-01-02T00:00:00.000Z'),
			status: PostStatus.Published
		});

		assert.equal(secondPost.id, firstPost.id);
		assert.equal((await app.ms.group.getPostPure(firstReplyParent.id)).repliesCount, 0);
		assert.equal((await app.ms.group.getPostPure(secondReplyParent.id)).repliesCount, 1);
		assert.equal((await app.ms.group.getPostPure(firstRepostParent.id)).repostsCount, 0);
		assert.equal((await app.ms.group.getPostPure(secondRepostParent.id)).repostsCount, 1);
	});

	it('reconciles social import source identity when a post becomes draft', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const socNetImport = (app.ms as any).socNetImport;
		const parentContent = await app.ms.content.saveData(testUser.id, 'import lifecycle parent', null, {
			mimeType: 'text/markdown'
		});
		const importContent = await app.ms.content.saveData(testUser.id, 'import lifecycle body', null, {
			mimeType: 'text/markdown'
		});
		const parentPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: parentContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const sourceIdentity = {
			groupId: testGroup.id,
			source: 'socNetImport:test',
			sourceChannelId: 'lifecycle-channel',
			sourcePostId: 'lifecycle-post'
		};
		const importedPost = await socNetImport.createPostOrUpdateSourceIdentity(testUser.id, {
			...sourceIdentity,
			contents: [{id: importContent.id, view: ContentView.Contents}],
			replyToId: parentPost.id,
			repostOfId: parentPost.id,
			propertiesJson: JSON.stringify({sourceLink: 'published'}),
			sourceDate: new Date('2026-01-03T00:00:00.000Z'),
			status: PostStatus.Published
		});
		const groupAfterPublish = await app.ms.group.getGroup(testGroup.id);
		const manifestAfterPublish = await app.ms.storage.getObject(groupAfterPublish.manifestStorageId);
		assert.equal(trieHelper.getNode(manifestAfterPublish.posts, importedPost.localId), importedPost.manifestStorageId);
		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repliesCount, 1);
		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repostsCount, 1);
		assert.equal(groupAfterPublish.availablePostsCount, 2);
		assert.equal(Number(groupAfterPublish.size), Number(parentContent.size) + Number(importContent.size));

		const draftPost = await socNetImport.createPostOrUpdateSourceIdentity(testUser.id, {
			...sourceIdentity,
			contents: [{id: importContent.id, view: ContentView.Contents}],
			replyToId: parentPost.id,
			repostOfId: parentPost.id,
			propertiesJson: JSON.stringify({sourceLink: 'draft'}),
			sourceDate: new Date('2026-01-03T00:00:00.000Z'),
			status: PostStatus.Draft
		});

		const groupAfterDraft = await app.ms.group.getGroup(testGroup.id);
		const manifestAfterDraft = await app.ms.storage.getObject(groupAfterDraft.manifestStorageId);
		const gotDraftPost = await app.ms.group.getPostPure(importedPost.id);
		assert.equal(draftPost.id, importedPost.id);
		assert.equal(gotDraftPost.status, PostStatus.Draft);
		assert.equal(trieHelper.getNode(manifestAfterDraft.posts, importedPost.localId), undefined);
		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repliesCount, 0);
		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repostsCount, 0);
		assert.equal(groupAfterDraft.availablePostsCount, 1);
		assert.equal(Number(groupAfterDraft.size), Number(parentContent.size));
	});

	it('reconciles social import source identity when a post is deleted', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const models = (app.ms.database as any).models;
		const socNetImport = (app.ms as any).socNetImport;
		const parentContent = await app.ms.content.saveData(testUser.id, 'import delete parent', null, {
			mimeType: 'text/markdown'
		});
		const importContent = await app.ms.content.saveData(testUser.id, 'import delete body', null, {
			mimeType: 'text/markdown'
		});
		const parentPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: parentContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const sourceIdentity = {
			groupId: testGroup.id,
			source: 'socNetImport:test',
			sourceChannelId: 'delete-channel',
			sourcePostId: 'delete-post'
		};
		const importedPost = await socNetImport.createPostOrUpdateSourceIdentity(testUser.id, {
			...sourceIdentity,
			contents: [{id: importContent.id, view: ContentView.Contents}],
			replyToId: parentPost.id,
			repostOfId: parentPost.id,
			propertiesJson: JSON.stringify({sourceLink: 'published'}),
			sourceDate: new Date('2026-01-04T00:00:00.000Z'),
			status: PostStatus.Published
		});
		const groupAfterPublish = await app.ms.group.getGroup(testGroup.id);
		const manifestAfterPublish = await app.ms.storage.getObject(groupAfterPublish.manifestStorageId);
		assert.equal(trieHelper.getNode(manifestAfterPublish.posts, importedPost.localId), importedPost.manifestStorageId);
		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repliesCount, 1);
		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repostsCount, 1);
		assert.equal(groupAfterPublish.availablePostsCount, 2);
		assert.equal(Number(groupAfterPublish.size), Number(parentContent.size) + Number(importContent.size));

		const deletedPost = await socNetImport.createPostOrUpdateSourceIdentity(testUser.id, {
			...sourceIdentity,
			contents: [{id: importContent.id, view: ContentView.Contents}],
			replyToId: parentPost.id,
			repostOfId: parentPost.id,
			propertiesJson: JSON.stringify({sourceLink: 'deleted'}),
			sourceDate: new Date('2026-01-04T00:00:00.000Z'),
			isDeleted: true,
			status: PostStatus.Published
		});

		const groupAfterDelete = await app.ms.group.getGroup(testGroup.id);
		const manifestAfterDelete = await app.ms.storage.getObject(groupAfterDelete.manifestStorageId);
		const gotDeletedPost = await app.ms.group.getPostPure(importedPost.id);
		assert.equal(deletedPost.id, importedPost.id);
		assert.equal(gotDeletedPost.isDeleted, true);
		assert.equal(gotDeletedPost.status, PostStatus.Published);
		assert.equal(trieHelper.getNode(manifestAfterDelete.posts, importedPost.localId), undefined);
		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repliesCount, 0);
		assert.equal((await app.ms.group.getPostPure(parentPost.id)).repostsCount, 0);
		assert.equal(groupAfterDelete.availablePostsCount, 1);
		assert.equal(Number(groupAfterDelete.size), Number(parentContent.size));

		const importEvents = await models.PostEvent.findAll({
			where: {postId: importedPost.id, type: PostEventType.SourceImport},
			order: [['createdAt', 'ASC'], ['id', 'ASC']]
		});
		assert.equal(importEvents.length, 2);
		assert.equal(importEvents[0].action, PostEventAction.Created);
		assert.equal(importEvents[1].action, PostEventAction.Deleted);
		assert.equal(importEvents[1].source, sourceIdentity.source);
		assert.equal(importEvents[1].sourceChannelId, sourceIdentity.sourceChannelId);
		assert.equal(importEvents[1].sourcePostId, sourceIdentity.sourcePostId);
		assert.equal(importEvents[1].previousStatus, PostStatus.Published);
		assert.equal(importEvents[1].nextStatus, PostStatus.Published);
		assert.equal(importEvents[1].previousIsDeleted, false);
		assert.equal(importEvents[1].nextIsDeleted, true);
	});

	it('does not use the local id high-water mark as unread count when availability is zero', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const models = (app.ms.database as any).models;
		await models.Group.update({
			availablePostsCount: 0,
			publishedPostsCount: 5
		}, {where: {id: testGroup.id}});

		const unreadData = await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id);

		assert.equal(unreadData.count, 0);
	});

	it('repairs group size, availability, and local-id high-water counters', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const models = (app.ms.database as any).models;
		const activeContent = await app.ms.content.saveData(testUser.id, 'active counter post', null, {
			mimeType: 'text/markdown'
		});
		const draftContent = await app.ms.content.saveData(testUser.id, 'draft counter post', null, {
			mimeType: 'text/markdown'
		});
		const deletedContent = await app.ms.content.saveData(testUser.id, 'deleted counter post', null, {
			mimeType: 'text/markdown'
		});

		const activePost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: activeContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const draftPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: draftContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		const deletedPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: deletedContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Published
		});
		await app.ms.group.updatePost(testUser.id, draftPost.id, {status: PostStatus.Draft});
		await app.ms.group.deletePosts(testUser.id, [deletedPost.id]);
		await models.Group.update({
			size: 999999,
			availablePostsCount: 99,
			publishedPostsCount: 1
		}, {where: {id: testGroup.id}});

		await app.ms.group.reconcileGroupCounters(testGroup.id);

		const repairedGroup = await app.ms.group.getGroup(testGroup.id);
		const highWaterLocalId = Math.max(
			Number(activePost.localId),
			Number(draftPost.localId),
			Number(deletedPost.localId)
		);
		assert.equal(repairedGroup.availablePostsCount, 1);
		assert.equal(Number(repairedGroup.size), Number(activeContent.size));
		assert.equal(repairedGroup.publishedPostsCount, highWaterLocalId);
	});

	it('replaces post content at an existing position without duplicate join rows', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const firstContent = await app.ms.content.saveData(testUser.id, 'first attachment', null, {
			mimeType: 'text/markdown'
		});
		const secondContent = await app.ms.content.saveData(testUser.id, 'second attachment', null, {
			mimeType: 'text/markdown'
		});
		const replacementContent = await app.ms.content.saveData(testUser.id, 'replacement attachment', null, {
			mimeType: 'text/markdown'
		});
		const post = await app.ms.group.createPost(testUser.id, {
			contents: [
				{id: firstContent.id, view: ContentView.Contents},
				{id: secondContent.id, view: ContentView.Attachment}
			],
			groupId: testGroup.id,
			status: PostStatus.Draft
		});

		await app.ms.group.updatePost(testUser.id, post.id, {
			contents: [
				{id: replacementContent.id, view: ContentView.Contents},
				{id: secondContent.id, view: ContentView.Attachment}
			]
		});

		const gotPost = await app.ms.group.getPostPure(post.id);
		const joinRows = await (app.ms.database as any).models.PostsContents.findAll({
			where: {postId: post.id},
			order: [['position', 'ASC']]
		});

		assert.deepEqual(gotPost.contents.map(content => content.id), [replacementContent.id, secondContent.id]);
		assert.deepEqual(joinRows.map(row => row.position), [0, 1]);
		assert.equal(joinRows.length, 2);
	});

	it('records post lifecycle events for ordinary post writes', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const models = (app.ms.database as any).models;
		const postContent = await app.ms.content.saveData(testUser.id, 'lifecycle post body', null, {
			mimeType: 'text/markdown'
		});
		const post = await app.ms.group.createPost(testUser.id, {
			contents: [{id: postContent.id, view: ContentView.Contents}],
			groupId: testGroup.id,
			status: PostStatus.Draft
		});

		await app.ms.group.updatePost(testUser.id, post.id, {isReplyForbidden: true});
		await app.ms.group.deletePosts(testUser.id, [post.id]);

		const lifecycleEvents = await models.PostEvent.findAll({
			where: {postId: post.id, type: PostEventType.PostLifecycle},
			order: [['createdAt', 'ASC'], ['id', 'ASC']]
		});
		assert.equal(lifecycleEvents.length, 3);
		assert.deepEqual(lifecycleEvents.map(event => event.action), [
			PostEventAction.Created,
			PostEventAction.Updated,
			PostEventAction.Deleted
		]);
		assert.equal(lifecycleEvents[0].previousStatus, null);
		assert.equal(lifecycleEvents[0].nextStatus, PostStatus.Draft);
		assert.equal(lifecycleEvents[1].previousIsDeleted, false);
		assert.equal(lifecycleEvents[1].nextIsDeleted, false);
		assert.equal(lifecycleEvents[2].previousIsDeleted, false);
		assert.equal(lifecycleEvents[2].nextIsDeleted, true);
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

	it('repairs post reply and repost counters through one helper', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];
		const models = (app.ms.database as any).models;
		const parentContent = await app.ms.content.saveData(testUser.id, 'counter parent post', null, {
			mimeType: 'text/markdown'
		});
		const replyContent = await app.ms.content.saveData(testUser.id, 'counter reply post', null, {
			mimeType: 'text/markdown'
		});
		const repostContent = await app.ms.content.saveData(testUser.id, 'counter repost post', null, {
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
		const repostPost = await app.ms.group.createPost(testUser.id, {
			contents: [{id: repostContent.id, view: ContentView.Contents}],
			repostOfId: parentPost.id,
			groupId: testGroup.id,
			status: PostStatus.Published
		});

		let gotParent = await app.ms.group.getPostPure(parentPost.id);
		assert.equal(gotParent.repliesCount, 1);
		assert.equal(gotParent.repostsCount, 1);

		await models.Post.update({repliesCount: 7, repostsCount: 9}, {where: {id: parentPost.id}});
		await app.ms.group.reconcilePostRelationCounters([parentPost.id]);

		gotParent = await app.ms.group.getPostPure(parentPost.id);
		assert.equal(gotParent.repliesCount, 1);
		assert.equal(gotParent.repostsCount, 1);

		await app.ms.group.updatePost(testUser.id, replyPost.id, {status: PostStatus.Draft});
		gotParent = await app.ms.group.getPostPure(parentPost.id);
		assert.equal(gotParent.repliesCount, 0);
		assert.equal(gotParent.repostsCount, 1);

		await app.ms.group.deletePosts(testUser.id, [repostPost.id]);
		gotParent = await app.ms.group.getPostPure(parentPost.id);
		assert.equal(gotParent.repliesCount, 0);
		assert.equal(gotParent.repostsCount, 0);
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

		const noTotalOffsetPage = await app.ms.group.getGroupPosts(testGroup.id, {}, {limit: 2, includeTotal: false});
		assert.equal(noTotalOffsetPage.total, null);
		assert.deepEqual(noTotalOffsetPage.list.map(post => post.id), [newestPost.id, middlePost.id]);

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

		const firstAllCursorPage = await app.ms.group.getAllPosts({
			groupId: testGroup.id,
			cursorPublishedAt: new Date('2999-01-01T00:00:00.000Z'),
			cursorId: '999999999'
		}, {
			limit: 2,
			sortBy: 'publishedAt',
			sortDir: 'desc'
		});
		const secondAllCursorPage = await app.ms.group.getAllPosts({
			groupId: testGroup.id,
			cursorPublishedAt: firstAllCursorPage[1].publishedAt,
			cursorId: firstAllCursorPage[1].id
		}, {
			limit: 2,
			sortBy: 'publishedAt',
			sortDir: 'desc'
		});
		assert.deepEqual(firstAllCursorPage.map(post => post.id), [newestPost.id, middlePost.id]);
		assert.deepEqual(secondAllCursorPage.map(post => post.id), [sourcePost.id]);

		const allPostRefs = await app.ms.group.getAllPostRefs({groupId: testGroup.id}, {
			limit: 1,
			sortBy: 'publishedAt',
			sortDir: 'desc'
		}, {
			attributes: ['id', 'publishedAt']
		});
		assert.deepEqual(Object.keys(allPostRefs[0].toJSON()).sort(), ['id', 'publishedAt'].sort());

		const allPostBatchIds = [];
		const allPostBatchSizes = [];
		await app.ms.group.forEachAllPostRefBatch({
			filters: {groupId: testGroup.id},
			batchLimit: 2,
			listParams: {
				sortBy: 'publishedAt',
				sortDir: 'ASC'
			},
			attributes: ['id', 'publishedAt'],
			cursor: {
				cursorValueFilter: 'allCursorPublishedAt',
				cursorIdFilter: 'allCursorId',
				direction: 'after',
				orderDir: 'ASC'
			}
		}, async ({postRefs}) => {
			allPostBatchSizes.push(postRefs.length);
			postRefs.forEach(postRef => allPostBatchIds.push(postRef.id));
		});
		assert.deepEqual(allPostBatchSizes, [2, 1]);
		assert.deepEqual(allPostBatchIds, [sourcePost.id, middlePost.id, newestPost.id]);
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
