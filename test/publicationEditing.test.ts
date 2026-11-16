import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {DataTypes, Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import createModels from '../app/modules/socNetPublishing/models.js';
import {getOutboxMethods} from '../app/modules/socNetPublishing/outbox.js';
import {normalizeRequest} from '../app/modules/socNetPublishing/index.js';
import registerApi from '../app/modules/socNetPublishing/api.js';
import {GroupType} from '../app/modules/group/interface.js';

describe('queued publication editing', function () {
	this.timeout(30000);
	const schema = `edit_${randomUUID().replaceAll('-', '')}`;
	let db, models, service, source, sourceHook, imageBytes;
	const contents = new Map();
	const problem = (status, code) => Object.assign(new Error(code), {status, code});
	before(async () => {
		db = new Sequelize({...config, database: process.env.DATABASE_NAME || 'geesome_test', define: {schema}, logging: false} as any);
		await db.createSchema(schema, {});
		models = await createModels(db);
		const Asset = db.define('asset', {userId: DataTypes.INTEGER, storageId: DataTypes.STRING, contentId: DataTypes.INTEGER, sha256: DataTypes.STRING, bytes: DataTypes.INTEGER, mimeType: DataTypes.STRING, pinStatus: DataTypes.STRING});
		const Key = db.define('assetIdempotencyKey', {userId: DataTypes.INTEGER, namespace: DataTypes.STRING, key: DataTypes.STRING, requestHash: DataTypes.STRING, assetId: DataTypes.INTEGER, status: DataTypes.STRING, errorCode: DataTypes.STRING});
		await Asset.sync();await Key.sync();
		imageBytes = await sharp({create: {width: 16, height: 16, channels: 3, background: '#6688aa'}}).png().toBuffer();
		const app: any = {config: {apiConfig: {publicUrl: 'https://node.example'}}, ms: {
			database: {sequelize: db, getContent: async id => [...contents.values()].find((item: any) => item.id === id), getContentByStorageAndUserId: async id => contents.get(id)},
			storage: {getFileStream: async () => Readable.from([imageBytes])},
			content: {saveData: async (userId, bytes, name, options) => {
				const content = {id: contents.size + 1, userId, storageId: `Prepared${contents.size}`, mimeType: options.mimeType, name, size: bytes.length};
				contents.set(content.storageId, content);return content;
			}},
			group: {getPost: async () => {await sourceHook?.();return source;}}
		}};
		service = getOutboxMethods(app, models.PublicationJob, {normalizeRequest, problem, boundedInteger: Number, jobViews: async rows => rows.map(row => row.toJSON())});
	});
	after(async () => {await db?.dropSchema(schema, {cascade: true});await db?.close();});
	beforeEach(async () => {
		await models.PublicationJob.destroy({where: {}});
		sourceHook = null;
		source = {id: 1, userId: 1, groupId: 2, group: {creatorId: 1, type: GroupType.Channel, isPublic: false, isOpen: false}};
		contents.set('OwnedImage', {id: 999, userId: 1, storageId: 'OwnedImage', mimeType: 'image/png', size: imageBytes.length});
		contents.set('ForeignImage', {id: 998, userId: 2, storageId: 'ForeignImage', mimeType: 'image/png', size: imageBytes.length});
	});
	const job = (extra = {}) => models.PublicationJob.create({userId: 1, postId: 1, requestKey: randomUUID(), requestHash: 'original-receipt', intentVersion: 6, contentType: 'nsfw', localAccountId: 'profile',
		network: 'twitter', target: {}, payload: {text: 'Original', attachments: []}, scheduledAt: new Date('2099-01-01'), status: 'queued', ...extra});
	const input = row => ({expected: {payload: row.payload, target: row.target}, text: 'Edited', imageStorageIds: [], tags: []});
	it('edits only selected content, preserving sibling, route, schedule and immutable receipt', async () => {
		const first = await job(), sibling = await job();
		const result = await service.editJob(1, first.id, input(first));
		assert.equal(result.payload.text, 'Edited');assert.equal((await sibling.reload()).payload.text, 'Original');
		for (const key of ['postId', 'network', 'localAccountId', 'scheduledAt', 'requestKey', 'requestHash', 'contentType']) {
			assert.deepEqual(result[key], first[key]);
		}
		await assert.rejects(service.editJob(1, first.id, input(first)), {code: 'local_publication_edit_conflict'});
	});
	it('rejects foreign, legacy, terminal and concurrently claimed jobs', async () => {
		const row = await job();
		await assert.rejects(service.editJob(2, row.id, input(row)), {status: 404});
		for (const status of ['processing', 'posted', 'failed', 'cancelled', 'needs_review']) {
			await row.update({status});await assert.rejects(service.editJob(1, row.id, input(row)), {status: 409});
		}
		await row.update({status: 'queued', intentVersion: 5});await assert.rejects(service.editJob(1, row.id, input(row)), {status: 409});
		await row.update({intentVersion: 6});
		sourceHook = () => row.update({status: 'processing', claimToken: 'claimed'});
		await assert.rejects(service.editJob(1, row.id, input(row)), {status: 409});
		assert.equal((await row.reload()).payload.text, 'Original');
	});
	it('checks private source ownership and provider limits without updating the job', async () => {
		const row = await job();source.group.isPublic = true;
		await assert.rejects(service.editJob(1, row.id, input(row)), {status: 403});source.group.isPublic = false;
		await assert.rejects(service.editJob(1, row.id, {...input(row), text: 'x'.repeat(281)}), {code: 'local_publication_text_too_long'});
		await assert.rejects(service.editJob(1, row.id, {...input(row), imageStorageIds: ['ForeignImage']}), {status: 403});
		await assert.rejects(service.editJob(1, row.id, {...input(row), scheduledAt: '2099-02-01'}), {status: 400});
		assert.equal((await row.reload()).payload.text, 'Original');
	});
	it('prepares owned added/replaced images and supports removing them', async () => {
		const row = await job();
		const added = await service.editJob(1, row.id, {...input(row), imageStorageIds: ['OwnedImage']});
		assert.equal(added.payload.attachments[0].mimeType, 'image/jpeg');
		assert.equal(added.payload.mediaPreparation.sourceAttachments[0].storageId, 'OwnedImage');
		await row.reload();
		const removed = await service.editJob(1, row.id, input(row));assert.deepEqual(removed.payload.attachments, []);
	});
	it('changes native tags without changing provider routing and validates DeviantArt tags', async () => {
		const row = await job({network: 'deviantart', destinationId: 3, executionMode: 'server', target: {title: 'Title', tags: ['old'], isAiGenerated: true, noAi: true}, payload: {text: 'Original', attachments: [{storageId: 'OwnedImage'}]}});
		const body = {...input(row), imageStorageIds: ['OwnedImage'], tags: ['new_tag']};
		assert.deepEqual((await service.editJob(1, row.id, body)).target.tags, ['new_tag']);
		await row.reload();await assert.rejects(service.editJob(1, row.id, {...body, expected: input(row).expected, tags: ['invalid-tag']}), {status: 400});
	});
	it('protects canonical and legacy edit routes with scope and group permission checks', async () => {
		const routes = new Map();let allowed = false, called = false;
		registerApi({ms: {api: {onGet() {}, onAuthorizedGet() {}, onAuthorizedPost: (path, handler) => routes.set(path, handler)}}, checkUserCan: async () => {if (!allowed) {throw Error('denied');}}} as any,
			{editJob: async () => {called = true;return {};}} as any);
		for (const prefix of ['social', 'local']) {
			const handler = routes.get(`user/${prefix}-publications/:jobId/edit`), req = {user: {id: 1}, apiKey: {scopes: []}, params: {jobId: 1}, body: {}};
			await assert.rejects(handler(req, {send() {}}), {code: 'insufficient_scope'});
			req.apiKey.scopes = ['publishing:local', 'assets:write'];allowed = false;await assert.rejects(handler(req, {send() {}}), /denied/);
			allowed = true;await handler(req, {send() {}});assert.equal(called, true);
		}
	});
});
