import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import createModels from '../app/modules/localClient/models.js';
import {getModule, normalizeRequest} from '../app/modules/localClient/index.js';
import registerApi from '../app/modules/localClient/api.js';
import databaseConfig from '../app/modules/database/config.js';
import {CorePermissionName} from '../app/modules/database/interface.js';
import {PostStatus} from '../app/modules/group/interface.js';

describe('local publication queue', function () {
	this.timeout(30000);
	const schema = `local_publication_test_${randomUUID().replaceAll('-', '')}`;
	let sequelize: Sequelize, models, module, source, editable, content, sourceReads, sourceHook;
	const account = {network: 'threads', localAccountId: 'threads_1'};
	const request = (overrides = {}) => ({requestKey: randomUUID(), postId: 1, ...account, scheduledAt: '2020-01-01T00:00:00Z', ...overrides});
	const claim = (userId = 1) => module.claimJob(userId, {accounts: [account]});
	before(async () => {
		sequelize = new Sequelize({...databaseConfig, database: process.env.DATABASE_NAME || 'geesome_test', logging: false, pool: {max: 1, min: 0, acquire: 3000}, define: {schema}} as any);
		await sequelize.createSchema(schema, {});
		models = await createModels(sequelize);
	});
	after(async () => {
		if (sequelize) {
			await sequelize.dropSchema(schema, {cascade: true});
			await sequelize.close();
		}
	});
	beforeEach(async () => {
		await models.PublicationJob.destroy({where: {}, truncate: true});
		sourceReads = 0;
		sourceHook = null;
		editable = true;
		source = {id: 1, groupId: 2, status: PostStatus.Published, group: {isPublic: true}};
		content = [{type: 'text', text: 'Frozen text'}];
		module = getModule({config: {apiConfig: {publicUrl: 'https://node.example'}}, ms: {group: {
			getPost: async () => {sourceReads++; await sequelize.query('SELECT 1'); await sourceHook?.(); return source;},
			canEditPostInGroup: async () => editable,
			getPostContentData: async () => content
		}}} as any, models);
	});
	it('freezes source and deduplicates replay without re-reading edited source', async () => {
		const input = request();
		const original = await module.createJob(1, input);
		content = [{type: 'text', text: 'Edited'}];
		source = null;
		const replay = await module.createJob(1, input);
		assert.equal(replay.id, original.id);
		assert.equal(replay.payload.text, 'Frozen text');
		assert.equal(sourceReads, 1);
		assert.equal(replay.userId, undefined);
		assert.equal(replay.requestHash, undefined);
		await assert.rejects(module.createJob(1, {...input, localAccountId: 'changed'}), {status: 409});
	});
	it('deduplicates concurrent create and scopes the key to its owner', async () => {
		const input = request();
		const jobs = await Promise.all(Array.from({length: 5}, () => module.createJob(1, input)));
		assert.equal(new Set(jobs.map(job => job.id)).size, 1);
		assert.notEqual((await module.createJob(2, input)).id, jobs[0].id);
	});
	it('atomically claims one due job only once across concurrent clients', async () => {
		await module.createJob(1, request());
		const results = await Promise.all(Array.from({length: 8}, () => claim()));
		const jobs = results.filter(Boolean);
		assert.equal(jobs.length, 1);
		assert.equal(jobs[0].status, 'processing');
		assert.equal(jobs[0].claimToken.length, 64);
		assert.equal(await claim(), null);
	});
	it('explicit claim ignores schedule only for the selected owned queued account job', async () => {
		const future = await module.createJob(1, request({scheduledAt: '2099-01-01T00:00:00Z'}));
		const due = await module.createJob(1, request());
		assert.equal(await module.claimJob(2, {accounts: [account], jobId: future.id}), null);
		assert.equal(await module.claimJob(1, {accounts: [{...account, localAccountId: 'other'}], jobId: future.id}), null);
		const results = await Promise.all(Array.from({length: 4}, () => module.claimJob(1, {accounts: [account], jobId: future.id})));
		assert.equal(results.filter(Boolean).length, 1);
		assert.equal(results.find(Boolean).id, future.id);
		assert.equal(await module.claimJob(1, {accounts: [account], jobId: future.id}), null);
		assert.equal((await claim()).id, due.id);
		await assert.rejects(module.claimJob(1, {accounts: [account], jobId: 0}), {status: 400});
	});
	it('skips a due row locked by an independent database connection', async () => {
		const first = await module.createJob(1, request());
		const second = await module.createJob(1, request({scheduledAt: '2021-01-01T00:00:00Z'}));
		const other = new Sequelize({...databaseConfig, database: process.env.DATABASE_NAME || 'geesome_test', logging: false, pool: {max: 1, min: 0}} as any);
		let transaction;
		try {
			transaction = await other.transaction();
			await other.query(`SELECT id FROM "${schema}"."publicationJobs" WHERE id = :id FOR UPDATE`, {
				replacements: {id: first.id}, transaction
			});
			// Without SKIP LOCKED the claim must fail promptly, not hang the suite.
			await sequelize.query("SET lock_timeout = '1s'");
			assert.equal((await claim()).id, second.id);
			assert.equal((await models.PublicationJob.findByPk(first.id)).get('status'), 'queued');
		} finally {
			await transaction?.rollback();
			await other.close();
			await sequelize.query('SET lock_timeout = DEFAULT');
		}
		assert.equal((await claim()).id, first.id);
	});
	it('filters future, foreign and unconfigured account jobs; orders due jobs', async () => {
		await module.createJob(2, request());
		await module.createJob(1, request({scheduledAt: '2099-01-01T00:00:00Z'}));
		await module.createJob(1, request({localAccountId: 'other'}));
		const last = await module.createJob(1, request({scheduledAt: '2021-01-01T00:00:00Z'}));
		const first = await module.createJob(1, request());
		assert.equal((await claim()).id, first.id);
		assert.equal((await claim()).id, last.id);
		assert.equal(await claim(), null);
	});
	it('fails sources that become private/deleted/not editable before claim', async () => {
		for (const mutate of [() => {source.group.isPublic = false;}, () => {source.isDeleted = true;}, () => {editable = false;}]) {
			source = {id: 1, groupId: 2, status: PostStatus.Published, group: {isPublic: true}};
			editable = true;
			const job = await module.createJob(1, request());
			mutate();
			assert.equal(await claim(), null);
			assert.equal((await models.PublicationJob.findByPk(job.id)).get('status'), 'failed');
		}
	});
	it('does not auto-requeue a processing job after worker restart or a long delay', async () => {
		await module.createJob(1, request());
		const job = await claim();
		await models.PublicationJob.update({processingAt: new Date('2000-01-01')}, {where: {id: job.id}});
		assert.equal(await claim(), null);
		assert.equal((await module.listJobs(1))[0].status, 'processing');
	});
	it('leaves transient source-check failures processing without requeue', async () => {
		await module.createJob(1, request());
		sourceHook = async () => {throw new Error('temporary_database_failure');};
		await assert.rejects(claim(), /temporary_database_failure/);
		sourceHook = null;
		assert.equal((await module.listJobs(1))[0].status, 'processing');
		assert.equal(await claim(), null);
	});
	it('does not overwrite a manual terminal result when source validation fails', async () => {
		const job = await module.createJob(1, request());
		sourceHook = async () => {
			const processing = (await module.listJobs(1))[0];
			await module.reportResult(1, job.id, {claimToken: processing.claimToken, status: 'posted', remoteId: 'confirmed'});
			source.group.isPublic = false;
		};
		assert.equal(await claim(), null);
		assert.equal((await module.listJobs(1))[0].status, 'posted');
	});
	it('reports idempotently and rejects foreign/stale/conflicting results', async () => {
		await module.createJob(1, request());
		const job = await claim();
		const result = {claimToken: job.claimToken, status: 'posted', remoteId: 'remote1', remoteUrl: 'https://www.threads.net/post/1'};
		await assert.rejects(module.reportResult(2, job.id, result), {status: 404});
		await assert.rejects(module.reportResult(1, job.id, {...result, claimToken: 'bad'}), {status: 409});
		assert.equal((await module.reportResult(1, job.id, result)).status, 'posted');
		assert.equal((await module.reportResult(1, job.id, result)).status, 'posted');
		await assert.rejects(module.reportResult(1, job.id, {...result, remoteId: 'different'}), {status: 409});
	});
	it('allows explicit manual resolution of needs_review but never reclaims it', async () => {
		await module.createJob(1, request());
		const job = await claim();
		await module.reportResult(1, job.id, {claimToken: job.claimToken, status: 'needs_review', error: 'Provider timeout'});
		assert.equal(await claim(), null);
		const listed = (await module.listJobs(1))[0];
		assert.equal(listed.claimToken, job.claimToken);
		assert.equal((await module.reportResult(1, job.id, {claimToken: listed.claimToken, status: 'posted', remoteId: 'confirmed'})).status, 'posted');
	});
	it('cancels only queued jobs and retains the original request identity', async () => {
		const input = request();
		const job = await module.createJob(1, input);
		await assert.rejects(module.cancelJob(2, job.id), {status: 404});
		assert.equal((await module.cancelJob(1, job.id)).status, 'cancelled');
		assert.equal((await module.cancelJob(1, job.id)).status, 'cancelled');
		assert.equal((await module.createJob(1, input)).status, 'cancelled');
		await module.createJob(1, request());
		const processing = await claim();
		await assert.rejects(module.cancelJob(1, processing.id), {status: 409});
	});
	it('validates public source policy and never silently drops unsupported attachments', async () => {
		for (const invalid of [{isRemote: true}, {source: 'telegram'}, {isEncrypted: true}, {status: PostStatus.Draft}]) {
			source = {id: 1, groupId: 2, status: PostStatus.Published, group: {isPublic: true}, ...invalid};
			await assert.rejects(module.createJob(1, request()), {status: 403});
		}
		source = {id: 1, groupId: 2, status: PostStatus.Published, group: {isPublic: true}};
		content = [{type: 'image', storageId: 'bafyvalid', mimeType: 'image/jpeg', isPrivate: true}];
		await assert.rejects(module.createJob(1, request()), {status: 400});
		content = [{type: 'file', storageId: 'bafyvalid'}];
		await assert.rejects(module.createJob(1, request()), {status: 400});
		content = [{type: 'image', storageId: 'bafyvalid', mimeType: 'image/jpeg', name: 'image'}];
		assert.deepEqual((await module.createJob(1, request())).payload.attachments, [{storageId: 'bafyvalid', size: 0, url: 'https://node.example/ipfs/bafyvalid', mimeType: 'image/jpeg', name: 'image'}]);
	});
	it('adds compose metadata to an existing unreleased job table without dropping jobs', async () => {
		const job = await module.createJob(1, request());
		const table = models.PublicationJob.getTableName();
		for (const column of ['composeIndex', 'composeHash', 'composeKey']) {
			await sequelize.getQueryInterface().removeColumn(table, column);
		}
		await createModels(sequelize);
		const preserved = await models.PublicationJob.findByPk(job.id);
		assert.equal(preserved.get('status'), 'queued');
		assert.equal(preserved.get('composeKey'), null);
	});
	it('projects HTML to text and validates model indexes', async () => {
		content = [{type: 'text', mimeType: 'text/html', text: '<p>Hello <strong>world</strong></p>'}];
		assert.equal((await module.createJob(1, request())).payload.text, 'Hello world');
		const indexes = await sequelize.getQueryInterface().showIndex(models.PublicationJob.getTableName());
		const unique = (indexes as any[]).find(index => index.name === 'publication_jobs_owner_request_unique');
		assert.equal(unique.unique, true);
		assert.deepEqual(unique.fields.map(field => field.attribute), ['userId', 'requestKey']);
	});
	it('bounds lists and rejects unsafe input/secret fields/remote URLs', async () => {
		assert.equal(normalizeRequest(request({postId: '1', target: {kind: 'image'}})).postId, 1);
		assert.throws(() => normalizeRequest(request({target: {kind: 'invalid'}})), {status: 400});
		assert.throws(() => normalizeRequest(request({accessToken: 'secret'})), {status: 400});
		assert.throws(() => normalizeRequest(request({target: {accessToken: 'secret'}})), {status: 400});
		assert.throws(() => normalizeRequest(request({scheduledAt: 'tomorrow'})), {status: 400});
		await assert.rejects(module.listJobs(1, {limit: 1000}), {status: 400});
		await assert.rejects(module.claimJob(1, {accounts: [{...account, userId: 2}]}), {status: 400});
		await module.createJob(1, request());
		const job = await claim();
		for (const remoteUrl of ['javascript:alert(1)', 'https://user:secret@example.com/post', 'https://example.com/post?access_token=secret']) {
			await assert.rejects(module.reportResult(1, job.id, {claimToken: job.claimToken, status: 'posted', remoteId: '1', remoteUrl}), {status: 400});
		}
	});
});

describe('local publication API authorization', () => {
	it('requires publishing scope and user group permission on all operations', async () => {
		const routes = new Map(), calls = [];
		const module = Object.fromEntries(['createJob','listJobs','claimJob','reportResult','cancelJob','compose','getOutbox'].map(name => [name, async (...args) => {calls.push(args); return null;} ]));
		let permission = true;
		registerApi({ms: {api: {
			onAuthorizedPost: (path, handler) => routes.set(`POST ${path}`, handler),
			onAuthorizedGet: (path, handler) => routes.set(`GET ${path}`, handler)
		}}, checkUserCan: async (userId, name) => {assert.equal(name, CorePermissionName.UserGroupManagement); if (!permission) {throw new Error('not_permitted');}}} as any, module as any);
		assert.equal(routes.size, 7);
		for (const handler of routes.values()) {
			const req = {user: {id: 7}, apiKey: {scopes: ['assets:write']}, body: {}, query: {}, params: {jobId: 1}};
			await assert.rejects(handler(req, {send() {}}), {code: 'insufficient_scope'});
			req.apiKey.scopes = ['publishing:local', 'assets:write'];
			permission = false;
			await assert.rejects(handler(req, {send() {}}), /not_permitted/);
			permission = true;
			await handler(req, {send() {}});
			assert.equal(calls.at(-1)[0], 7);
		}
	});
});
