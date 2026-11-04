import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {DataTypes, Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import defineOperation from '../app/modules/comicPage/model.js';
import {getModule} from '../app/modules/comicPage/index.js';
import {normalize, validatePng} from '../app/modules/comicPage/validation.js';
import registerApi from '../app/modules/comicPage/api.js';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="white"/><text x="10" y="30">Hello</text></svg>';

function recipe(source: string, changes = {}) {
	return {type: 'comic-page', version: 1, comicId: 'comic', pageId: 'page1', pageNumber: 1, pageRevision: 1,
		previousVersionRef: null, sourceAssets: [{sourceId: 'source', originalManifestId: source, storageId: 'source-bytes', width: 160, height: 200, setProvenance: JSON.stringify({constructor: {sequencePosition: 1, sceneImageIndex: 1}})}],
		canvas: {width: 160, height: 200, background: '#fff'}, panels: [{panelId: 'panel', sourceId: 'source',
			frame: {x: 0, y: 0, width: 1, height: 1}, crop: {x: 0, y: 0, width: 1, height: 1}}],
		bubbles: [{bubbleId: 'bubble', panelId: 'panel', kind: 'caption', text: 'Hello', rect: {x: .1, y: .1, width: .4, height: .2}}], ...changes};
}

describe('native comic-page validation and API', () => {
	it('rejects scripts and foreign source references before persistence', () => {
		const base = {idempotencyKey: 'key', comicId: 'comic', pageId: 'page1', pageRevision: 1, folderId: 1,
			recipe: recipe('source'), pngBase64: '', bubbles: [{id: 'bubble', svg}]};
		assert.equal(normalize(base).bubbles.length, 1);
		assert.throws(() => normalize({...base, recipe: recipe('source', {legacyProvenance: {constructor: {sequencePosition: 1}}})}), /metadata_key_unsupported/);
		assert.throws(() => normalize({...base, bubbles: [{id: 'bubble', svg: '<svg><script>x</script></svg>'}]}));
		assert.throws(() => normalize({...base, recipe: recipe('source', {panels: [{panelId: 'p', sourceId: 'missing'}]})}));
		assert.throws(() => normalize({...base, recipe: recipe('source', {canvas: {width: 100000, height: 100000}})}));
		assert.throws(() => normalize({...base, recipe: recipe('source', {unused: Infinity})}));
	});
	it('decodes exact bounded PNG dimensions and rejects corrupted bytes', async () => {
		const bytes = await sharp({create: {width: 160, height: 200, channels: 4, background: '#fff'}}).png().toBuffer();
		assert.deepEqual(await validatePng(bytes.toString('base64'), {width: 160, height: 200}), bytes);
		await assert.rejects(() => validatePng(bytes.toString('base64'), {width: 160, height: 201}));
		await assert.rejects(() => validatePng(Buffer.from('fake').toString('base64'), {width: 160, height: 200}));
	});
	it('registers authenticated read-only capability and reconciliation routes before detail', async () => {
		const routes = [];
		const api = {onAuthorizedGet: (path, handler, options) => routes.push({path, handler, options}), onAuthorizedPost: (path, handler) => routes.push({path, handler})};
		registerApi({ms: {api}, checkUserCan: async () => {}} as any, {} as any);
		assert.deepEqual(routes.map(r => r.path), ['user/comic-pages/capabilities', 'user/comic-pages', 'user/comic-pages/operations/:key', 'user/comic-pages/:manifest']);
		assert.equal(routes[2].path.includes('/operations/'), true);
		let capability;
		await routes[0].handler({user: {id: 1}}, {send: data => { capability = data; }});
		assert.equal(capability.version, 1);
	});
});

describe('native comic-page durable operations (PostgreSQL)', function () {
	this.timeout(30_000);
	let db;
	let models;
	let module;
	let input;
	let dependencyCalls;
	let failAfterSave = false;
	let saveCount;
	const schema = `comic_test_${randomUUID().replaceAll('-', '')}`;
	before(async () => {
		db = new Sequelize({...config as any, logging: false, define: {schema}});
		await db.createSchema(schema, {});
		models = {};
		models.Content = db.define('comicTestContent', {userId: DataTypes.INTEGER, name: DataTypes.STRING, mimeType: DataTypes.STRING,
			storageId: DataTypes.STRING, manifestStorageId: DataTypes.STRING, mediumPreviewStorageId: DataTypes.STRING, propertiesJson: DataTypes.TEXT,
			size: DataTypes.INTEGER, isPublic: DataTypes.BOOLEAN, isDeleted: {type: DataTypes.BOOLEAN, defaultValue: false}});
		models.FileCatalogItem = db.define('comicTestCatalog', {userId: DataTypes.INTEGER, parentItemId: DataTypes.INTEGER, contentId: DataTypes.INTEGER,
			name: DataTypes.STRING, type: DataTypes.STRING, view: DataTypes.STRING, size: DataTypes.INTEGER, position: DataTypes.INTEGER,
			isDeleted: {type: DataTypes.BOOLEAN, defaultValue: false}});
		await models.Content.sync();
		await models.FileCatalogItem.sync();
		await defineOperation(db, models);
	});
	beforeEach(async () => {
		await models.ComicPageOperation.destroy({where: {}});
		await models.FileCatalogItem.destroy({where: {}});
		await models.Content.destroy({where: {}});
		dependencyCalls = [];
		saveCount = 0;
		failAfterSave = false;
		const source = await models.Content.create({userId: 1, name: 'source', mimeType: 'image/png', manifestStorageId: 'source', storageId: 'source-bytes', propertiesJson: JSON.stringify({width: 160, height: 200})});
		const folder = await models.FileCatalogItem.create({userId: 1, name: 'Media', type: 'folder', size: 0});
		const png = await sharp({create: {width: 160, height: 200, channels: 4, background: '#fff'}}).png().toBuffer();
		input = {idempotencyKey: randomUUID(), comicId: 'comic', pageId: 'page1', pageRevision: 1, folderId: folder.id,
			recipe: recipe(source.manifestStorageId), pngBase64: png.toString('base64'), bubbles: [{id: 'bubble', svg}]};
		const database = {sequelize: db, models,
			getContentByManifestAndUserId: (manifestStorageId, userId) => models.Content.findOne({where: {manifestStorageId, userId}}),
			getContentByManifestId: manifestStorageId => models.Content.findOne({where: {manifestStorageId}}),
			syncContentDependencies: async (parentContentId, deps) => { dependencyCalls.push({parentContentId, deps}); },
		};
		const app = {checkUserCan: async () => {}, ms: {database, content: {saveData: async (userId, bytes, name, opts) => {
			const old = !opts.forceNewContentEntity && await models.Content.findOne({where: {userId, name}});
			if (old) {
				return old;
			}
			saveCount++;
			const id = randomUUID();
			const result = await models.Content.create({userId, name, mimeType: opts.mimeType, storageId: `bytes-${id}`,
				manifestStorageId: `manifest-${id}`, mediumPreviewStorageId: opts.requirePreview ? `preview-${id}` : null,
				size: bytes.length, propertiesJson: JSON.stringify(opts.properties || {})});
			if (opts.requirePreview && failAfterSave) {
				failAfterSave = false;
				throw new Error('lost response after durable content save');
			}
			return result;
		}}}};
		module = getModule(app as any, models);
	});
	after(async () => {
		await db.dropSchema(schema, {cascade: true});
		await db.close();
	});
	it('stores native recipe and bubble/source references; replay is exactly the original receipt', async () => {
		const receipt = await module.create(1, input);
		assert.equal(receipt.recipe.type, 'comic-page');
		assert.ok(receipt.previewStorageId);
		assert.equal(receipt.bubbles[0].id, 'bubble');
		assert.equal(dependencyCalls[0].deps.length, 2);
		assert.deepEqual(await module.create(1, input), receipt);
		assert.equal(await models.FileCatalogItem.count({where: {type: 'file'}}), 1);
		assert.equal(saveCount, 2);
		assert.deepEqual(await module.detail(1, receipt.contentManifestId), receipt);
		assert.deepEqual(await module.operation(1, input.idempotencyKey), {status: 'succeeded', canResume: false, receipt});
	});
	it('recovers content created before the upload response/checkpoint was lost without duplicating Media', async () => {
		failAfterSave = true;
		await assert.rejects(() => module.create(1, input), /lost response/);
		assert.equal((await module.operation(1, input.idempotencyKey)).status, 'failed');
		const receipt = await module.create(1, input);
		assert.equal(saveCount, 2);
		assert.equal(await models.FileCatalogItem.count({where: {type: 'file'}}), 1);
		assert.equal((await module.operation(1, input.idempotencyKey)).receipt.contentManifestId, receipt.contentManifestId);
	});
	it('reclaims an expired process claim using only durable recovery state', async () => {
		failAfterSave = true;
		await assert.rejects(() => module.create(1, input), /lost response/);
		await models.ComicPageOperation.update({status: 'pending', claimToken: 'departed-process', claimExpiresAt: new Date(0)}, {where: {userId: 1, idempotencyKey: input.idempotencyKey}});
		assert.equal((await module.operation(1, input.idempotencyKey)).canResume, true);
		const receipt = await module.create(1, input);
		assert.equal((await module.operation(1, input.idempotencyKey)).receipt.contentManifestId, receipt.contentManifestId);
		assert.equal(saveCount, 2);
	});
	it('concurrent requests produce one receipt and one immutable catalog entry', async () => {
		const results = await Promise.allSettled(Array.from({length: 8}, () => module.create(1, input)));
		assert.equal(results.filter(r => r.status === 'fulfilled').length >= 1, true);
		assert.equal(await models.FileCatalogItem.count({where: {type: 'file'}}), 1);
		assert.equal((await module.operation(1, input.idempotencyKey)).status, 'succeeded');
	});
	it('conflicts on changed payload or another key targeting the same saved page revision', async () => {
		await module.create(1, input);
		await assert.rejects(() => module.create(1, {...input, recipe: {...input.recipe, arbitrary: 'changed'}}), /idempotency_conflict/);
		await assert.rejects(() => module.create(1, {...input, idempotencyKey: randomUUID()}), /idempotency_conflict/);
	});
	it('saves successor as a new Media entry and preserves old metadata', async () => {
		const first = await module.create(1, input);
		const next = {...input, idempotencyKey: randomUUID(), pageRevision: 2, previousVersionRef: first.contentManifestId,
			recipe: {...input.recipe, pageRevision: 2, previousVersionRef: first.contentManifestId}};
		const second = await module.create(1, next);
		assert.notEqual(first.fileCatalogItemId, second.fileCatalogItemId);
		assert.equal(await models.FileCatalogItem.count({where: {type: 'file'}}), 2);
		assert.equal((await module.detail(1, first.contentManifestId)).pageRevision, 1);
	});
	it('rejects a source snapshot whose native bytes or dimensions do not match', async () => {
		const sourceAssets = input.recipe.sourceAssets;
		await assert.rejects(() => module.create(1, {...input, recipe: {...input.recipe, sourceAssets: [{...sourceAssets[0], storageId: 'other-bytes'}]}}), /source_mismatch/);
		await assert.rejects(() => module.create(1, {...input, recipe: {...input.recipe, sourceAssets: [{...sourceAssets[0], width: 159}]}}), /source_mismatch/);
		assert.equal(await models.ComicPageOperation.count(), 0);
	});
	it('keeps reconciliation/detail actor-scoped and rejects private sources and folders', async () => {
		const receipt = await module.create(1, input);
		await assert.rejects(() => module.operation(2, input.idempotencyKey), /not_found/);
		await assert.rejects(() => module.detail(2, receipt.contentManifestId), /not_found/);
		await assert.rejects(() => module.create(2, input), /folder_not_permitted/);
		await models.Content.update({userId: 2}, {where: {manifestStorageId: 'source'}});
		await assert.rejects(() => module.create(1, {...input, idempotencyKey: randomUUID()}), /source_not_permitted/);
	});
});
