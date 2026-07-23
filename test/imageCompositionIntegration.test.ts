import assert from 'node:assert';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {ContentDependencyRole, ContentView, CorePermissionName} from '../app/modules/database/interface.js';
import {ImageCompositionApiError} from '../app/modules/imageComposition/helpers.js';
import {FileCatalogItemType} from '../app/modules/fileCatalog/interface.js';
import {IGeesomeApp} from '../app/interface.js';

describe('image composition content persistence', function () {
	this.timeout(90_000);

	let app: IGeesomeApp;
	let owner;
	let outsider;
	let contentOnlyUser;
	let originalContent;
	let originalPng: Buffer;
	let catalogFolder;

	before(async () => {
		originalPng = await sharp({
			create: {width: 160, height: 100, channels: 4, background: {r: 245, g: 245, b: 245, alpha: 1}},
		}).png().toBuffer();
	});

	beforeEach(async () => {
		const appConfig: any = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7782});
		await app.flushDatabase();
		await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
		owner = await app.registerUser({
			email: 'composition-owner@example.com', name: 'composition-owner', password: 'owner',
			permissions: [CorePermissionName.UserAll],
		});
		outsider = await app.registerUser({
			email: 'composition-outsider@example.com', name: 'composition-outsider', password: 'outsider',
			permissions: [CorePermissionName.UserAll],
		});
		contentOnlyUser = await app.registerUser({
			email: 'composition-content-only@example.com', name: 'composition-content-only', password: 'content-only',
			permissions: [CorePermissionName.UserSaveData],
		});
		originalContent = await app.ms.content.saveData(owner.id, originalPng, 'original.png', {
			mimeType: 'image/png', view: ContentView.Media, driver: {raw: true}, skipFileCatalog: true,
		});
		catalogFolder = await app.ms.fileCatalog.createUserFolder(owner.id, null, 'Compositions');
	});

	it('does not require file-catalog permission for standalone composition Content', async () => {
		const limitedOriginal = await app.ms.content.saveData(contentOnlyUser.id, originalPng, 'limited-original.png', {
			mimeType: 'image/png', view: ContentView.Media, driver: {raw: true}, skipFileCatalog: true,
		});
		const created = await app.ms.imageComposition.createImageCompositionContent(contentOnlyUser.id, createInput({
			originalContentManifestId: limitedOriginal.manifestStorageId,
		}));
		assert.equal(created.fileCatalogItemId, undefined);
		assert.equal(created.original.contentManifestId, limitedOriginal.manifestStorageId);
	});

	it('rejects an invalid optional folder before creating composition state', async () => {
		const input = createInput({folderId: Number.MAX_SAFE_INTEGER});
		await assert.rejects(
			() => app.ms.imageComposition.createImageCompositionContent(owner.id, input),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_invalid'
				&& error.details?.field === 'folderId',
		);
		assert.equal(await app.ms.database.models.ImageCompositionIdentity.count({
			where: {userId: owner.id, compositionId: input.compositionId},
		}), 0);
		assert.equal(await app.ms.database.models.ImageCompositionOperation.count({
			where: {actorUserId: owner.id, targetKey: input.compositionId},
		}), 0);
	});

	afterEach(async () => app.stop());

	function createInput(overrides: any = {}) {
		return {
			idempotencyKey: `create-${randomUUID()}`,
			compositionId: `composition-${randomUUID()}`,
			originalContentManifestId: originalContent.manifestStorageId,
			stickers: [{
				id: 'bubble-1',
				svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="5">Hello</text></svg>',
				editorData: {kind: 'text-bubble', text: 'Hello'},
				x: 0.1, y: 0.2, width: 0.3, height: 0.2, rotationDeg: 0, zIndex: 1,
			}],
			...overrides,
		};
	}

	function catalogInput(overrides: any = {}) {
		return createInput({folderId: catalogFolder.id, ...overrides});
	}

	it('stores baked Content without a catalog item by default and replays idempotently', async () => {
		const input = createInput();
		const created = await app.ms.imageComposition.createImageCompositionContent(owner.id, input);
		const replayed = await app.ms.imageComposition.createImageCompositionContent(owner.id, input);
		assert.deepEqual(replayed, created);
		assert.equal(created.fileCatalogItemId, undefined);
		assert.equal((created as any).postId, undefined);

		const composite = await app.ms.database.getContentByManifestAndUserId(created.composite.contentManifestId, owner.id);
		assert.equal((await app.ms.fileCatalog.getFileCatalogItemsByContent(
			owner.id, composite.id, FileCatalogItemType.File,
		)).length, 0);
		const properties = JSON.parse(composite.propertiesJson);
		assert.equal(properties.imageComposition.originalContentManifestId, originalContent.manifestStorageId);
		assert.equal(properties.imageComposition.output.width, 160);
		assert(composite.mediumPreviewStorageId);

		const dependencies = await app.ms.database.getContentDependencies(composite.id);
		assert.equal(dependencies.filter(edge => edge.role === ContentDependencyRole.ImageCompositionOriginal).length, 1);
		assert.equal(dependencies.filter(edge => edge.role === ContentDependencyRole.ImageCompositionSticker).length, 1);
		const stickerCatalogItems = await app.ms.fileCatalog.getFileCatalogItemsByContent(
			owner.id,
			(await app.ms.database.getContentByManifestId(created.stickers[0].contentManifestId)).id,
			FileCatalogItemType.File,
		);
		assert.equal(stickerCatalogItems.length, 0, 'generated SVG dependencies stay out of the file catalog');
	});

	it('revises standalone immutable Content without requiring a catalog item', async () => {
		const created = await app.ms.imageComposition.createImageCompositionContent(owner.id, createInput({stickers: []}));
		const oldContent = await app.ms.database.getContentByManifestId(created.composite.contentManifestId);
		const FileCatalogItem = app.ms.database.models.FileCatalogItem;
		const originalFindOne = FileCatalogItem.findOne;
		let catalogPlacementQueries = 0;
		FileCatalogItem.findOne = function (...args) {
			catalogPlacementQueries += 1;
			return originalFindOne.apply(this, args);
		};
		let revised;
		try {
			revised = await app.ms.imageComposition.createImageCompositionContentRevision(
				owner.id,
				created.composite.contentManifestId,
				{idempotencyKey: `revision-${randomUUID()}`, expectedRevision: 1, stickers: []},
			);
		} finally {
			FileCatalogItem.findOne = originalFindOne;
		}
		assert.equal(revised.revision, 2);
		assert.equal(revised.fileCatalogItemId, undefined);
		assert.equal(catalogPlacementQueries, 0);
		assert.notEqual(revised.composite.contentManifestId, created.composite.contentManifestId);
		assert(await app.ms.database.models.Content.findByPk(oldContent.id), 'old immutable revision remains stored');
		await assert.rejects(
			() => app.ms.imageComposition.getImageCompositionContent(owner.id, created.composite.contentManifestId),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_revision_conflict',
		);
	});

	it('returns the current Content revision when matching create is retried after editing', async () => {
		const input = createInput();
		const created = await app.ms.imageComposition.createImageCompositionContent(owner.id, input);
		const revised = await app.ms.imageComposition.createImageCompositionContentRevision(
			owner.id,
			created.composite.contentManifestId,
			{
				idempotencyKey: `revision-${randomUUID()}`,
				expectedRevision: 1,
				stickers: [{...input.stickers[0], text: 'Edited'}],
			},
		);
		const retriedCreate = await app.ms.imageComposition.createImageCompositionContent(owner.id, {
			...input,
			idempotencyKey: `create-again-${randomUUID()}`,
		});
		assert.equal(retriedCreate.fileCatalogItemId, undefined);
		assert.equal(retriedCreate.revision, 2);
		assert.equal(retriedCreate.composite.contentManifestId, revised.composite.contentManifestId);
	});

	it('does not expose an existing catalog placement when create omits folderId', async () => {
		const input = catalogInput();
		const placed = await app.ms.imageComposition.createImageCompositionContent(owner.id, input);
		assert(Number.isSafeInteger(placed.fileCatalogItemId));

		const standaloneResponse = await app.ms.imageComposition.createImageCompositionContent(owner.id, {
			...input,
			idempotencyKey: `without-folder-${randomUUID()}`,
			folderId: undefined,
		});
		assert.equal(standaloneResponse.fileCatalogItemId, undefined);
		assert.equal(standaloneResponse.composite.contentManifestId, placed.composite.contentManifestId);
		assert(await app.ms.fileCatalog.getFileCatalogItem(placed.fileCatalogItemId));
	});

	it('lists only matching owner catalog items with pagination before projection', async () => {
		await app.ms.imageComposition.createImageCompositionContent(owner.id, catalogInput());
		await app.ms.imageComposition.createImageCompositionContent(owner.id, catalogInput());
		await app.ms.imageComposition.createImageCompositionContent(owner.id, catalogInput());
		const first = await app.ms.imageComposition.getImageCompositionCatalogItems(owner.id, {limit: 2, offset: 0});
		const second = await app.ms.imageComposition.getImageCompositionCatalogItems(owner.id, {limit: 2, offset: 2});
		assert.equal(first.total, 3);
		assert.equal(first.list.length, 2);
		assert.equal(second.list.length, 1);
		assert(first.list.every(item => item.fileCatalogItemId && item.composite?.contentManifestId));
		assert.equal((await app.ms.imageComposition.getImageCompositionCatalogItems(outsider.id, {})).total, 0);
	});

	it('reconciles an entirely absent dependency graph from verified local manifests', async () => {
		const created = await app.ms.imageComposition.createImageCompositionContent(owner.id, catalogInput());
		const composite = await app.ms.database.getContentByManifestId(created.composite.contentManifestId);
		await app.ms.database.models.ContentDependency.destroy({where: {parentContentId: composite.id}});
		const beforeRepair = await app.ms.imageComposition.getImageCompositionCatalogItems(owner.id, {});
		assert.equal(beforeRepair.list[0].recipeStatus, 'missing-dependencies');
		assert.equal(beforeRepair.list[0].editable, false);
		const detail = await app.ms.imageComposition.getImageCompositionContent(owner.id, created.composite.contentManifestId);
		assert.equal(detail.original.contentManifestId, originalContent.manifestStorageId);
		assert.equal((await app.ms.database.getContentDependencies(composite.id)).length, 2);
	});

	it('returns the active manifest with stale revision conflicts', async () => {
		const created = await app.ms.imageComposition.createImageCompositionContent(owner.id, createInput({stickers: []}));
		const revised = await app.ms.imageComposition.createImageCompositionContentRevision(
			owner.id,
			created.composite.contentManifestId,
			{idempotencyKey: `revision-${randomUUID()}`, expectedRevision: 1, stickers: []},
		);
		await assert.rejects(
			() => app.ms.imageComposition.createImageCompositionContentRevision(
				owner.id,
				created.composite.contentManifestId,
				{idempotencyKey: `stale-${randomUUID()}`, expectedRevision: 1, stickers: []},
			),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_revision_conflict'
				&& error.details?.currentRevision === 2
				&& error.details?.currentContentManifestId === revised.composite.contentManifestId,
		);
	});

	it('keeps detail owner-only even when the original Content is public', async () => {
		const created = await app.ms.imageComposition.createImageCompositionContent(owner.id, createInput());
		await assert.rejects(
			() => app.ms.imageComposition.getImageCompositionContent(outsider.id, created.composite.contentManifestId),
			(error: ImageCompositionApiError) => error.errorCode === 'composition_not_found',
		);
	});

	it('creates distinct Content entities for distinct recipes even when bytes deduplicate', async () => {
		const first = await app.ms.imageComposition.createImageCompositionContent(owner.id, createInput({stickers: []}));
		const second = await app.ms.imageComposition.createImageCompositionContent(owner.id, createInput({stickers: []}));
		const firstContent = await app.ms.database.getContentByManifestId(first.composite.contentManifestId);
		const secondContent = await app.ms.database.getContentByManifestId(second.composite.contentManifestId);
		assert.notEqual(firstContent.id, secondContent.id);
		assert.equal(firstContent.storageId, secondContent.storageId);
	});

	it('converges concurrent matching standalone roots without creating catalog items', async () => {
		const input = createInput();
		const results = await Promise.all([
			app.ms.imageComposition.createImageCompositionContent(owner.id, input),
			app.ms.imageComposition.createImageCompositionContent(owner.id, {...input, idempotencyKey: `other-${randomUUID()}`}),
		]);
		assert.equal(results[0].composite.contentManifestId, results[1].composite.contentManifestId);
		assert.equal(results[0].fileCatalogItemId, undefined);
		assert.equal(results[1].fileCatalogItemId, undefined);
		const detail = await app.ms.imageComposition.getImageCompositionContent(
			owner.id,
			results[0].composite.contentManifestId,
		);
		assert.equal(detail.fileCatalogItemId, undefined);
		const content = await app.ms.database.getContentByManifestAndUserId(results[0].composite.contentManifestId, owner.id);
		assert.equal((await app.ms.fileCatalog.getFileCatalogItemsByContent(
			owner.id,
			content.id,
			FileCatalogItemType.File,
		)).length, 0);
	});

	it('lets only one concurrent catalog CAS revision win', async () => {
		const created = await app.ms.imageComposition.createImageCompositionContent(owner.id, catalogInput());
		const updates = await Promise.allSettled(['A', 'B'].map(text => {
			return app.ms.imageComposition.createImageCompositionContentRevision(owner.id, created.composite.contentManifestId, {
				idempotencyKey: `update-${text}-${randomUUID()}`,
				expectedRevision: 1,
				stickers: [{
					...created.stickers[0],
					svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="5">Winner ${text}</text></svg>`,
					editorData: {...created.stickers[0].editorData, text: `Winner ${text}`},
				}],
			});
		}));
		assert.equal(updates.filter(result => result.status === 'fulfilled').length, 1);
		const rejected = updates.find(result => result.status === 'rejected') as PromiseRejectedResult;
		assert.equal(rejected.reason.errorCode, 'composition_revision_conflict');
		const winner = updates.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<any>;
		const item = await app.ms.fileCatalog.getFileCatalogItem(created.fileCatalogItemId);
		assert.equal(item.content.manifestStorageId, winner.value.composite.contentManifestId);
	});

	it('continues as standalone Content after its optional catalog placement is hidden', async () => {
		const created = await app.ms.imageComposition.createImageCompositionContent(owner.id, catalogInput({stickers: []}));
		await app.ms.fileCatalog.updateFileCatalogList(owner.id, [created.fileCatalogItemId], {isDeleted: true});
		const revised = await app.ms.imageComposition.createImageCompositionContentRevision(
			owner.id,
			created.composite.contentManifestId,
			{idempotencyKey: `hidden-${randomUUID()}`, expectedRevision: 1, stickers: []},
		);
		assert.equal(revised.revision, 2);
		assert.equal(revised.fileCatalogItemId, undefined);
		const identity = await app.ms.database.models.ImageCompositionIdentity.findOne({
			where: {userId: owner.id, compositionId: revised.compositionId},
		});
		assert.equal(identity.fileCatalogItemId, null);
	});

	it('blocks deleting original and SVG children while referenced', async () => {
		const created = await app.ms.imageComposition.createImageCompositionContent(owner.id, createInput());
		const original = await app.ms.database.getContentByManifestId(created.original.contentManifestId);
		const stickerContent = await app.ms.database.getContentByManifestId(created.stickers[0].contentManifestId);
		assert.equal((await app.ms.database.getContentDeleteSafety(original)).contentRefs.contentDependencies, 1);
		assert.equal((await app.ms.database.getContentDeleteSafety(stickerContent)).contentRefs.contentDependencies, 1);
	});
});
