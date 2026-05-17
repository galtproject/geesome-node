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
		const before = await app.ms.database.getStorageSpaceOverview();
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
		await app.ms.group.createPost(firstUser.id, {
			contents: [{id: sharedContent.id, view: ContentView.Attachment}],
			groupId: group.id,
			status: PostStatus.Published
		});

		const after = await app.ms.database.getStorageSpaceOverview();
		const sharedSize = Number(sharedContent.size);
		const duplicateSize = Number(duplicateContent.size);
		const uniqueSize = Number(uniqueContent.size);

		assert.equal(after.logicalContentBytes - before.logicalContentBytes, sharedSize + duplicateSize + uniqueSize);
		assert.equal(after.physicalContentBytes - before.physicalContentBytes, sharedSize + uniqueSize);
		assert.equal(after.duplicateStorageIdsCount - before.duplicateStorageIdsCount, 1);
		assert.equal(after.duplicateContentRowsCount - before.duplicateContentRowsCount, 1);
		assert.equal(after.groupPostsLogicalBytes - before.groupPostsLogicalBytes, sharedSize);
		assert.equal(after.fileCatalogLogicalBytes > before.fileCatalogLogicalBytes, true);

		const typeBreakdown = await app.ms.database.getStorageSpaceTypeBreakdown({limit: 10});
		const textType = typeBreakdown.find(row => row.mimeType === 'text/plain');
		assert.equal(!!textType, true);
		assert.equal(textType?.logicalBytes, sharedSize + duplicateSize + uniqueSize);
		assert.equal(textType?.physicalBytes, sharedSize + uniqueSize);
		assert.equal(textType?.storageObjectsCount, 2);

		const topContents = await app.ms.database.getStorageSpaceTopContents({limit: 5});
		assert.equal(topContents.some(row => row.id === uniqueContent.id), true);
		assert.equal(topContents.every(row => Number.isFinite(row.size)), true);

		const topCatalogItems = await app.ms.database.getStorageSpaceTopFileCatalogItems({limit: 5});
		assert.equal(topCatalogItems.some(row => row.contentId === sharedContent.id), true);
		assert.equal(topCatalogItems.every(row => row.type === 'file'), true);

		const topGroups = await app.ms.database.getStorageSpaceTopGroups({limit: 5});
		const usageGroup = topGroups.find(row => row.id === group.id);
		assert.equal(!!usageGroup, true);
		assert.equal(usageGroup?.size, sharedSize);
	});
});
