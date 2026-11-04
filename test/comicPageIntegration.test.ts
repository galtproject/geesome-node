import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {ContentView, CorePermissionName, ContentDependencyRole} from '../app/modules/database/interface.js';

// Uses the real node, PostgreSQL and Kubo; run against a disposable test database.
describe('comic-page native Content and Media integration', function () {
	this.timeout(90_000);
	let app;
	let owner;
	let source;
	let folder;
	let input;
	before(async () => {
		app = await (await import('../app/index.js')).default({skipFrontendStorage: true, port: 7792});
		await app.flushDatabase();
		await app.setup({email: 'admin@example.com', name: 'admin', password: 'admin'});
		owner = await app.registerUser({email: 'comic-owner@example.com', name: 'owner', password: 'owner', permissions: [CorePermissionName.UserAll]});
		const png = await sharp({create: {width: 160, height: 200, channels: 4, background: '#fff'}}).png().toBuffer();
		source = await app.ms.content.saveData(owner.id, png, 'source.png', {mimeType: 'image/png', driver: {raw: true}, skipFileCatalog: true});
		folder = await app.ms.fileCatalog.createUserFolder(owner.id, null, 'Comic Media');
		input = {idempotencyKey: randomUUID(), comicId: randomUUID(), pageId: 'page1', pageRevision: 1, folderId: folder.id,
			pngBase64: png.toString('base64'), bubbles: [{id: 'bubble1', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><ellipse cx="50" cy="25" rx="48" ry="23" fill="white"/><text x="50" y="25" text-anchor="middle">Hello</text></svg>'}]};
		input.recipe = {type: 'comic-page', version: 1, comicId: input.comicId, pageId: input.pageId, pageNumber: 1, pageRevision: 1,
			previousVersionRef: null, canvas: {width: 160, height: 200, background: '#fff'}, sourceAssets: [{sourceId: 'original', originalManifestId: source.manifestStorageId, storageId: source.storageId, width: 160, height: 200, setProvenance: JSON.stringify({constructor: {sequencePosition: 1, sceneImageIndex: 1}})}],
			panels: [{panelId: 'panel1', sourceId: 'original', frame: {x: 0, y: 0, width: 1, height: 1}, crop: {x: 0, y: 0, width: 1, height: 1}}],
			bubbles: [{bubbleId: 'bubble1', panelId: 'panel1', kind: 'speech', text: 'Hello', rect: {x: .1, y: .1, width: .5, height: .2}}]};
	});
	after(async () => {
		if (app) {
			await app.stop();
		}
	});
	it('persists portable recipe, real previews, protected dependencies and immutable page revisions', async () => {
		const first = await app.ms.comicPage.create(owner.id, input);
		assert.ok(first.fileCatalogItemId);
		assert.ok(first.previewStorageId);
		const stored = await app.ms.database.getContentByManifestAndUserId(first.contentManifestId, owner.id);
		assert.equal(stored.view, ContentView.Media);
		assert.deepEqual(JSON.parse(stored.propertiesJson).comicPage, input.recipe);
		const manifest = await app.ms.storage.getObject(first.contentManifestId);
		assert.deepEqual(manifest.properties.comicPage, input.recipe);
		const deps = await app.ms.database.models.ContentDependency.findAll({where: {parentContentId: stored.id}});
		assert.deepEqual(deps.map(d => d.role).sort(), [ContentDependencyRole.ComicPageBubble, ContentDependencyRole.ComicPageSource].sort());
		assert.deepEqual(await app.ms.comicPage.create(owner.id, input), first);
		const next = {...input, idempotencyKey: randomUUID(), pageRevision: 2, previousVersionRef: first.contentManifestId,
			recipe: {...input.recipe, pageRevision: 2, previousVersionRef: first.contentManifestId}};
		const second = await app.ms.comicPage.create(owner.id, next);
		assert.notEqual(first.contentManifestId, second.contentManifestId);
		assert.notEqual(first.fileCatalogItemId, second.fileCatalogItemId);
		assert.equal(await app.ms.database.models.FileCatalogItem.count({where: {userId: owner.id, parentItemId: folder.id, type: 'file'}}), 2);
		assert.equal((await app.ms.comicPage.detail(owner.id, first.contentManifestId)).pageRevision, 1);
		const refs = await app.ms.database.countContentReferences(stored.id);
		assert.equal(refs.comicPageOperations, 1);
	});
});
