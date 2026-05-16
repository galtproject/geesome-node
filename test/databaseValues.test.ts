/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from "assert";
import {
	ContentMimeType,
	ContentStorageType,
	IGeesomeDatabaseModule
} from "../app/modules/database/interface.js";

describe("databaseValues", function () {
	let database: IGeesomeDatabaseModule;

	before(async () => {
		database = await (await import('../app/modules/database/index.js')).default({config: {}} as any);
		await database.flushDatabase();
	});

	it("should set and get values correctly", async () => {
		assert.strictEqual(await database.getValue('test1'), null);

		await database.setValue('test1', 'test1Value');

		assert.strictEqual(await database.getValue('test1'), 'test1Value');

		await database.setValue('test1', 'test1ValueNew');

		assert.strictEqual(await database.getValue('test1'), 'test1ValueNew');

		assert.strictEqual(await database.getValue('test2'), null);

		await database.setValue('test2', 'test2Value');
		assert.strictEqual(await database.getValue('test2'), 'test2Value');

		assert.strictEqual(await database.getValue('test1'), 'test1ValueNew');

		await database.clearValue('test1');

		assert.strictEqual(await database.getValue('test1'), null);
		assert.strictEqual(await database.getValue('test2'), 'test2Value');

		await database.clearValue('test2');

		assert.strictEqual(await database.getValue('test2'), null);

		await database.setValue('1 — копия.jpeg', '1 — копия.jpeg');
	});

	it("should key object cache entries by resolveProp", async () => {
		const storageId = 'object-cache-resolve-prop-test';

		await database.addObject({storageId, resolveProp: false, data: 'root'});
		await database.addObject({storageId, resolveProp: true, data: 'resolved'});

		const rootObject = await database.getObjectByStorageId(storageId, false);
		const resolvedObject = await database.getObjectByStorageId(storageId, true);

		assert.strictEqual(rootObject.data, 'root');
		assert.strictEqual(resolvedObject.data, 'resolved');
		await assert.rejects(
			database.addObject({storageId, resolveProp: true, data: 'duplicate'}),
			/unique|duplicate/i
		);
	});

	it("should resolve shared content lookups deterministically while preserving actor-owned rows", async () => {
		const firstUser = await database.addUser({
			name: 'shared-content-lookup-user-1',
			email: 'shared-content-lookup-user-1@example.com',
			passwordHash: 'hash'
		});
		const secondUser = await database.addUser({
			name: 'shared-content-lookup-user-2',
			email: 'shared-content-lookup-user-2@example.com',
			passwordHash: 'hash'
		});
		const storageId = 'shared-content-lookup-storage';
		const manifestStorageId = 'shared-content-lookup-manifest';

		const firstContent = await database.addContent({
			userId: firstUser.id,
			storageType: ContentStorageType.IPFS,
			mimeType: ContentMimeType.Text,
			storageId,
			manifestStorageId,
			size: 11,
			name: 'first shared row'
		});
		const secondContent = await database.addContent({
			userId: secondUser.id,
			storageType: ContentStorageType.IPFS,
			mimeType: ContentMimeType.Text,
			storageId,
			manifestStorageId,
			size: 11,
			name: 'second shared row'
		});

		assert.strictEqual((await database.getSharedContentByStorageId(storageId)).id, firstContent.id);
		assert.strictEqual((await database.getContentByStorageId(storageId)).id, firstContent.id);
		assert.strictEqual((await database.getSharedContentByManifestId(manifestStorageId)).id, firstContent.id);
		assert.strictEqual((await database.getContentByManifestId(manifestStorageId)).id, firstContent.id);
		assert.strictEqual(
			(await database.getContentByManifestAndUserId(manifestStorageId, secondUser.id)).id,
			secondContent.id
		);

		const storageObject = await database.getStorageObjectByStorageId(storageId);
		assert.strictEqual(storageObject.storageId, storageId);
		assert.strictEqual(storageObject.mimeType, ContentMimeType.Text);
		assert.strictEqual(Number(storageObject.size), 11);
		assert.strictEqual((await database.getSharedStorageMetadataByStorageId(storageId)).storageId, storageId);
		assert.strictEqual(
			await (database as any).models.StorageObject.count({where: {storageId}}),
			1
		);

		await database.updateContent(firstContent.id, {
			mediumPreviewStorageId: 'shared-content-preview-storage',
			mediumPreviewSize: 7,
			previewMimeType: ContentMimeType.ImagePng,
			previewExtension: 'png'
		});

		const updatedStorageObject = await database.getStorageObjectByStorageId(storageId);
		assert.strictEqual(updatedStorageObject.mediumPreviewStorageId, 'shared-content-preview-storage');
		assert.strictEqual(Number(updatedStorageObject.mediumPreviewSize), 7);
		assert.strictEqual(updatedStorageObject.previewMimeType, ContentMimeType.ImagePng);
		assert.strictEqual(
			(await database.getSharedStorageMetadataByStorageId('shared-content-preview-storage', {includePreviews: true})).storageId,
			storageId
		);
	});
});
