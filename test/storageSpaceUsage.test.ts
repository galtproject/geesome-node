/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from "assert";
import {ContentView, CorePermissionName} from "../app/modules/database/interface.js";
import {IGeesomeApp} from "../app/interface.js";
import {PostStatus} from "../app/modules/group/interface.js";

describe("storage space usage", function () {
	this.timeout(60000);

	let app: IGeesomeApp;

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';

		try {
			app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7771});
			await app.flushDatabase();
			await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it("separates logical content bytes from deduplicated physical bytes", async () => {
		const before = await app.ms.storageSpace.getStorageSpaceOverview();
		const firstUser = await app.registerUser({
			email: 'user@user.com',
			name: 'user',
			password: 'user',
			permissions: [CorePermissionName.UserAll]
		});
		const secondUser = await app.registerUser({
			email: 'other@user.com',
			name: 'other',
			password: 'other',
			permissions: [CorePermissionName.UserAll]
		});
		const group = await app.ms.group.createGroup(firstUser.id, {
			name: 'usage',
			title: 'Usage'
		});

		const sharedContent = await app.ms.content.saveData(firstUser.id, 'shared-space-body', 'shared.txt', {
			mimeType: 'text/plain'
		});
		const duplicateContent = await app.ms.content.saveData(secondUser.id, 'shared-space-body', 'shared-copy.txt', {
			mimeType: 'text/plain'
		});
		const uniqueContent = await app.ms.content.saveData(firstUser.id, 'unique-space-body-extra', 'unique.txt', {
			mimeType: 'text/plain'
		});

		assert.equal(sharedContent.storageId, duplicateContent.storageId);
		await app.ms['fileCatalog'].saveContentByPath(firstUser.id, '/usage/shared.txt', sharedContent.id);
		await app.ms['fileCatalog'].saveContentByPath(firstUser.id, '/usage/deep/unique.txt', uniqueContent.id);
		const sharedPost = await app.ms.group.createPost(firstUser.id, {
			contents: [{id: sharedContent.id, view: ContentView.Attachment}],
			groupId: group.id,
			status: PostStatus.Published
		});
		const generatedStorageId = 'generated-space-output';
		const generatedSize = 33;
		await app.ms.database.models.StorageObject.create({
			storageId: generatedStorageId,
			storageType: 'ipfs',
			mimeType: 'text/html',
			extension: 'html',
			size: generatedSize,
		});
		await app.ms.database.sequelize.models.staticSite.create({
			name: 'usage-generated-site',
			title: 'Usage generated site',
			userId: firstUser.id,
			entityType: 'group',
			entityId: group.id.toString(),
			storageId: generatedStorageId,
			lastEntityManifestStorageId: group.manifestStorageId,
		});

		const after = await app.ms.storageSpace.getStorageSpaceOverview();
		const sharedSize = Number(sharedContent.size);
		const duplicateSize = Number(duplicateContent.size);
		const uniqueSize = Number(uniqueContent.size);

		assert.equal(after.logicalContentBytes - before.logicalContentBytes, sharedSize + duplicateSize + uniqueSize);
		assert.equal(after.physicalContentBytes - before.physicalContentBytes, sharedSize + uniqueSize);
		assert.equal(after.duplicateStorageIdsCount - before.duplicateStorageIdsCount, 1);
		assert.equal(after.duplicateContentRowsCount - before.duplicateContentRowsCount, 1);
		assert.equal(after.groupPostsLogicalBytes - before.groupPostsLogicalBytes, sharedSize);
		assert.equal(after.fileCatalogLogicalBytes > before.fileCatalogLogicalBytes, true);
		assert.equal(after.generatedOutputKnownPhysicalBytes - before.generatedOutputKnownPhysicalBytes, generatedSize);
		assert.equal(after.generatedOutputKnownStorageObjectsCount - before.generatedOutputKnownStorageObjectsCount, 1);
		assert.equal(after.generatedOutputUniqueStorageIdsCount > before.generatedOutputUniqueStorageIdsCount, true);

		const typeBreakdown = await app.ms.storageSpace.getStorageSpaceTypeBreakdown({limit: 10});
		const textType = typeBreakdown.find(row => row.mimeType === 'text/plain');
		assert.equal(!!textType, true);
		assert.equal(textType?.logicalBytes, sharedSize + duplicateSize + uniqueSize);
		assert.equal(textType?.physicalBytes, sharedSize + uniqueSize);
		assert.equal(textType?.storageObjectsCount, 2);

		const topContents = await app.ms.storageSpace.getStorageSpaceTopContents({limit: 5});
		assert.equal(topContents.some(row => row.id === uniqueContent.id), true);
		assert.equal(topContents.every(row => Number.isFinite(row.size)), true);

		const topCatalogItems = await app.ms.storageSpace.getStorageSpaceTopFileCatalogItems({limit: 5});
		assert.equal(topCatalogItems.some(row => row.contentId === sharedContent.id), true);
		assert.equal(topCatalogItems.every(row => row.type === 'file'), true);

		const rootFolders = await app.ms.storageSpace.getStorageSpaceFileCatalogFolders({limit: 5});
		const usageFolder = rootFolders.find(row => row.name === 'usage');
		assert.equal(!!usageFolder, true);
		assert.equal(usageFolder?.logicalBytes, sharedSize + uniqueSize);
		assert.equal(usageFolder?.physicalBytes, sharedSize + uniqueSize);
		assert.equal(usageFolder?.filesCount, 2);
		assert.equal(usageFolder?.directFilesCount, 1);
		assert.equal(usageFolder?.childFoldersCount, 1);

		const childFolders = await app.ms.storageSpace.getStorageSpaceFileCatalogFolders({limit: 5, parentItemId: usageFolder.id});
		const deepFolder = childFolders.find(row => row.name === 'deep');
		assert.equal(!!deepFolder, true);
		assert.equal(deepFolder?.parentItemId, usageFolder?.id);
		assert.equal(deepFolder?.logicalBytes, uniqueSize);
		assert.equal(deepFolder?.physicalBytes, uniqueSize);
		assert.equal(deepFolder?.filesCount, 1);

		const topGroups = await app.ms.storageSpace.getStorageSpaceTopGroups({limit: 5});
		const usageGroup = topGroups.find(row => row.id === group.id);
		assert.equal(!!usageGroup, true);
		assert.equal(usageGroup?.size, sharedSize);

		const groupPosts = await app.ms.storageSpace.getStorageSpaceGroupPosts({limit: 5, groupId: group.id});
		const usagePost = groupPosts.find(row => row.id === sharedPost.id);
		assert.equal(!!usagePost, true);
		assert.equal(usagePost?.groupId, group.id);
		assert.equal(usagePost?.logicalBytes, sharedSize);
		assert.equal(usagePost?.attachmentLogicalBytes, sharedSize);
		assert.equal(usagePost?.physicalBytes, sharedSize);
		assert.equal(usagePost?.attachmentsCount, 1);
		assert.equal(usagePost?.storageObjectsCount, 1);

		const generatedOutputs = await app.ms.storageSpace.getStorageSpaceGeneratedOutputs({limit: 20});
		const staticSiteOutput = generatedOutputs.find(row => row.source === 'staticSite.storageId');
		assert.equal(!!staticSiteOutput, true);
		assert.equal(staticSiteOutput?.knownPhysicalBytes, generatedSize);
		assert.equal(staticSiteOutput?.knownStorageObjectsCount, 1);
		assert.equal(staticSiteOutput?.unknownStorageIdsCount, 0);

		assert.equal(await app.ms.storageSpace.getLatestStorageSpaceSnapshot(), null);
		const snapshot = await app.ms.storageSpace.refreshStorageSpaceSnapshot(firstUser.id, {limit: 2, offset: 99});
		assert.equal(snapshot.userId, firstUser.id);
		assert.equal(snapshot.listLimit, 2);
		assert.equal(snapshot.data.overview.logicalContentBytes, after.logicalContentBytes);
		assert.equal(snapshot.data.typeBreakdown.length <= 2, true);
		assert.equal(snapshot.data.topContents.length <= 2, true);
		assert.equal(snapshot.data.topFileCatalogItems.length <= 2, true);
		assert.equal(snapshot.data.fileCatalogFolders.length <= 2, true);
		assert.equal(snapshot.data.topGroups.length <= 2, true);
		assert.equal(snapshot.data.groupPosts.length <= 2, true);
		assert.equal(snapshot.data.generatedOutputs.length <= 2, true);

		const progressEvents = [];
		const progressSnapshotData = await app.ms.storageSpace.getStorageSpaceSnapshotData({limit: 1, offset: 99}, {
			onProgress: (progress) => progressEvents.push(progress)
		});
		assert.deepEqual(progressEvents.map(event => event.stage), [
			'overview',
			'type-breakdown',
			'top-contents',
			'top-file-catalog-items',
			'file-catalog-folders',
			'top-groups',
			'group-posts',
			'generated-outputs',
		]);
		assert.equal(progressEvents[0].percent > 1, true);
		assert.equal(progressEvents[progressEvents.length - 1].percent, 95);
		assert.equal(progressSnapshotData.topContents.length <= 1, true);

		const latestSnapshot = await app.ms.storageSpace.getLatestStorageSpaceSnapshot();
		assert.equal(latestSnapshot.id, snapshot.id);
		assert.deepEqual(latestSnapshot.data.overview, snapshot.data.overview);

		const queuedRefresh = await app.ms.storageSpace.queueStorageSpaceSnapshotRefresh(firstUser.id, null, {limit: 1, offset: 99}, {process: false});
		assert.equal(queuedRefresh.module, "storage-space-snapshot");
		assert.equal(queuedRefresh.isWaiting, true);

		assert.deepEqual(await app.ms.storageSpace.processStorageSpaceSnapshotRefreshQueue({limit: 1}), {processed: 1});
		const processedQueue = await app.ms.asyncOperation.getUserOperationQueue(firstUser.id, queuedRefresh.id);
		assert.equal(processedQueue.isWaiting, false);
		assert.equal(processedQueue.asyncOperation.inProcess, false);
		assert.equal(processedQueue.asyncOperation.percent, 100);

		const queuedRefreshOutput = JSON.parse(processedQueue.asyncOperation.output);
		const queuedSnapshot = await app.ms.storageSpace.getLatestStorageSpaceSnapshot();
		assert.equal(queuedRefreshOutput.snapshotId, queuedSnapshot.id);
		assert.equal(queuedSnapshot.listLimit, 1);
		assert.equal(queuedSnapshot.data.topContents.length <= 1, true);
	});
});
