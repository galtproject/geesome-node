import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import createModels from '../app/modules/socNetPublishing/models.js';
import {getModule, normalizeRequest} from '../app/modules/socNetPublishing/index.js';
import {publicationClientId, getDestinationMethods} from '../app/modules/socNetPublishing/destinations.js';
import registerApi from '../app/modules/socNetPublishing/api.js';
import databaseConfig from '../app/modules/database/config.js';
import {CorePermissionName} from '../app/modules/database/interface.js';
import {GroupType, PostStatus} from '../app/modules/group/interface.js';
import {publicationIntentDigest} from '../app/modules/socNetPublishing/producer.js';

describe('local publication queue', function () {
	this.timeout(30000);
	const schema = `local_publication_test_${randomUUID().replaceAll('-', '')}`;
	let sequelize: Sequelize, models, module, source, editable, content, sourceReads, sourceHook;
	const account = {network: 'threads', localAccountId: 'threads_1'};
	const request = (overrides = {}) => ({contentType: 'nsfw', requestKey: randomUUID(), postId: 1, ...account, scheduledAt: '2020-01-01T00:00:00Z', ...overrides});
	const claim = (userId = 1) => module.claimJob(userId, {intentVersion: 6, accounts: [account]});
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
			getGroup: async id => ({id, creatorId: 1, type: GroupType.Channel, isPublic: false, isOpen: false}),
			getPost: async () => {sourceReads++; await sequelize.query('SELECT 1'); await sourceHook?.(); return source;},
			canEditPostInGroup: async () => editable,
			getPostContentData: async () => content
		}}} as any, models);
	});

	const destinationInput = (overrides = {}) => ({contentPolicy: 'nsfw', localKey: 'main', network: 'threads', label: 'Local profile', localAccountId: 'threads_1', target: {}, enabled: true, ...overrides});
	async function register(clientId = 'key:1', overrides = {}) {
		return (await module.registerDestinations(1, clientId, {destinations: [destinationInput(overrides)]})).destinations[0];
	}
	async function destinationJob(destination) {
		const legacy = await module.createJob(1, request());
		source.userId = 1;
		source.group = {creatorId: 1, isPublic: false, isOpen: false, type: GroupType.Channel};
		await models.PublicationJob.update({destinationId: destination.id, clientId: destination.clientId, executionMode: 'client'}, {where: {id: legacy.id}});
		return legacy;
	}
	it('uses one content policy rule for every network and explicit subreddit destinations', async () => {
		await models.PublicationDestination.destroy({where: {}});
		const {resolveDestination} = getDestinationMethods(models.PublicationDestination, {normalizeRequest, app: {}, loadServerAccount: async () => {}, boundedInteger: Number, problem: (status, code) => Object.assign(new Error(code), {status, code})});
		for (const [index, network, target] of [[1, 'reddit', {subreddit: 'Safe'}], [2, 'threads', {}], [3, 'instagram', {}], [4, 'rule34xxx', {}]]) {
			const row = await register(`key:${index}`, {network, contentPolicy: 'sfw', target});
			const authored = network === 'rule34xxx' ? {tags: 'safe', source: 'https://example.com'} : {};
			await assert.rejects(resolveDestination(1, {contentType: 'nsfw', destinationId: row.id, network, target: authored}), {code: 'publication_content_policy_forbidden'});
			assert.equal((await resolveDestination(1, {contentType: 'sfw', destinationId: row.id, network, target: authored})).contentType, 'sfw');
		}
	});
	it('requires an explicit v6 executor handshake before either claim route mutates a job', async () => {
		const job = await module.createJob(1, request());
		for (const intentVersion of [undefined, 5, '6']) {
			await assert.rejects(module.claimJob(1, {intentVersion, accounts: [account]}), {code: 'publication_upgrade_required'});
			await assert.rejects(module.claimDestinationJob(1, 'key:1', {intentVersion, destinationIds: []}), {code: 'publication_upgrade_required'});
		}
		assert.equal((await models.PublicationJob.findByPk(job.id)).status, 'queued');
		assert.equal((await claim()).id, job.id);
	});
	it('holds pre-upgrade queued intent while preserving reporting and cancellation', async () => {
		const input = request();const job = await module.createJob(1, input);
		await models.PublicationJob.update({intentVersion: null}, {where: {id: job.id}});
		assert.equal(await claim(), null);
		const listed = (await module.listJobs(1))[0];assert.equal(listed.upgradeRequired, true);assert.equal(listed.status, 'queued');
		await assert.rejects(module.createJob(1, input), {code: 'publication_upgrade_required'});
		assert.equal((await module.cancelJob(1, job.id)).status, 'cancelled');
		const processing = await module.createJob(1, request());const claimed = await claim();
		await models.PublicationJob.update({intentVersion: null}, {where: {id: processing.id}});
		const posted = await module.reportResult(1, processing.id, {claimToken: claimed.claimToken, status: 'posted', remoteId: 'historical'});
		assert.equal(posted.status, 'posted');assert.equal(posted.upgradeRequired, true);
	});
	it('requires an explicit destination policy instead of weakening existing SFW settings by omission', async () => {
		const localKey = 'explicit-policy';
		const row = await register('key:1', {localKey, contentPolicy: 'sfw'});
		await assert.rejects(register('key:1', {localKey, contentPolicy: undefined}), {code: 'publication_content_policy_invalid'});
		assert.equal((await models.PublicationDestination.findByPk(row.id)).contentPolicy, 'sfw');
	});
	it('registers destinations idempotently, bounds safe listings and scopes local keys by client and owner', async () => {
		await models.PublicationDestination.destroy({where: {}});
		const first = await register();
		const concurrent = await Promise.all(Array.from({length: 4}, () => register()));
		assert.deepEqual(concurrent.map(row => row.id), Array(4).fill(first.id));
		assert.notEqual((await register('key:2')).id, first.id);
		const foreign = await module.registerDestinations(2, 'key:3', {destinations: [destinationInput()]});
		assert.notEqual(foreign.destinations[0].id, first.id);
		const listed = await module.listDestinations(1, {limit: 1});
		assert.equal(listed.destinations.length, 1);
		assert.equal(listed.destinations[0].socNetAccountId, undefined);
		assert.equal(listed.destinations[0].userId, undefined);
		assert.equal((await module.listDestinations(2)).destinations.length, 1);
		await assert.rejects(module.listDestinations(1, {limit: 101}), {status: 400});
		await assert.rejects(register('key:1', {localAccountId: 'other'}), {status: 409});
		await assert.rejects(register('key:1', {cookie: 'secret'}), {status: 400});
		await assert.rejects(register('key:1', {target: {accessToken: 'secret'}}), {status: 400});
		assert.equal(publicationClientId({id: 12}), 'key:12');
		for (const key of [{}, {id: 1, type: 'password_auth'}, {id: 0}]) {
			assert.throws(() => publicationClientId(key), {status: 403});
		}
	});
	it('isolates destination claims from other clients and legacy claims and never changes a frozen route', async () => {
		await models.PublicationDestination.destroy({where: {}});
		const destination = await register();
		const job = await destinationJob(destination);
		assert.equal(await claim(), null);
		assert.equal(await module.claimDestinationJob(1, 'key:2', {intentVersion: 6, destinationIds: [destination.id]}), null);
		assert.equal(await module.claimDestinationJob(2, 'key:1', {intentVersion: 6, destinationIds: [destination.id]}), null);
		await register('key:1', {target: {}, label: 'Renamed'});
		assert.deepEqual((await module.listJobs(1, {destinationId: destination.id})).map(row => row.id), [job.id]);
		const results = await Promise.all(Array.from({length: 5}, () => module.claimDestinationJob(1, 'key:1', {intentVersion: 6, destinationIds: [destination.id]})));
		assert.equal(results.filter(Boolean).length, 1);
		const claimed = results.find(Boolean);
		assert.equal(claimed.clientId, 'key:1');
		assert.equal(claimed.localAccountId, account.localAccountId);
		await register('key:1', {enabled: false});
		const result = {claimToken: claimed.claimToken, status: 'posted', remoteId: '123'};
		await assert.rejects(module.reportResult(1, job.id, result, 'key:2'), {status: 403});
		assert.equal((await module.reportResult(1, job.id, result, 'key:1')).status, 'posted');
		assert.equal((await module.reportResult(1, job.id, result, 'key:1')).status, 'posted');
	});
	it('blocks disabled destination claims without consuming queued jobs and preserves legacy availability', async () => {
		await models.PublicationDestination.destroy({where: {}});
		const destination = await register();
		const bound = await destinationJob(destination);
		await register('key:1', {enabled: false});
		assert.equal(await module.claimDestinationJob(1, 'key:1', {intentVersion: 6, destinationIds: [destination.id], jobId: bound.id}), null);
		assert.equal((await models.PublicationJob.findByPk(bound.id)).status, 'queued');
		const legacy = await module.createJob(1, request());
		assert.equal((await claim()).id, legacy.id);
		await assert.rejects(module.claimDestinationJob(1, 'key:1', {intentVersion: 6, destinationIds: [destination.id], clientId: 'key:2'}), {status: 400});
	});

	it('rejects destination jobs whose private source group became public before claim', async () => {
		await models.PublicationDestination.destroy({where: {}});
		const destination = await register();
		const job = await destinationJob(destination);
		source.group.isPublic = true;
		assert.equal(await module.claimDestinationJob(1, 'key:1', {intentVersion: 6, destinationIds: [destination.id]}), null);
		assert.equal((await models.PublicationJob.findByPk(job.id)).status, 'failed');
	});


	it('blocks a destination job when its source was moved to a different private group', async () => {
		await models.PublicationDestination.destroy({where: {}});
		const destination = await register('key:1', {sourceGroupId: 2});
		const job = await destinationJob(destination);
		source.groupId = 3;
		assert.equal(await module.claimDestinationJob(1, 'key:1', {intentVersion: 6, destinationIds: [destination.id]}), null);
		assert.equal((await models.PublicationJob.findByPk(job.id)).status, 'failed');
	});
	it('lets the owner retire a lost client destination without exposing a cross-owner operation', async () => {
		await models.PublicationDestination.destroy({where: {}});
		const destination = await register();
		await assert.rejects(module.disableDestination(2, destination.id, {}), {status: 404});
		await assert.rejects(module.disableDestination(1, destination.id, {enabled: true}), {status: 400});
		assert.equal((await module.disableDestination(1, destination.id, {})).destination.enabled, false);
		assert.equal((await module.disableDestination(1, destination.id, {})).destination.id, destination.id);
	});
	it('binds v4 digest to destination, executor, original content and resolved target', () => {
		const payload = {text: 'Frozen', attachments: [{storageId: 'bafy1', mimeType: 'image/jpeg'}]};
		const digest = publicationIntentDigest({contentType: 'nsfw', destinationId: 1, clientId: 'key:1', network: 'telegram', localAccountId: 'local', target: {chatId: '123'}, executionMode: 'client'}, payload);
		assert.equal(digest, publicationIntentDigest({contentType: 'nsfw', destinationId: 1, clientId: 'key:1', network: 'telegram', localAccountId: 'local', target: {chatId: '123'}, executionMode: 'client'}, payload));
		assert.notEqual(digest, publicationIntentDigest({contentType: 'nsfw', destinationId: 2, clientId: 'key:1', network: 'telegram', localAccountId: 'local', target: {chatId: '123'}, executionMode: 'client'}, payload));
		assert.notEqual(digest, publicationIntentDigest({contentType: 'nsfw', destinationId: 1, clientId: 'key:2', network: 'telegram', localAccountId: 'local', target: {chatId: '123'}, executionMode: 'client'}, payload));
	});
	it('filters network queues before pagination and retains owner scoping', async () => {
		const older = await module.createJob(1, request());
		await module.createJob(1, request({network: 'twitter'}));
		await module.createJob(2, request());
		const newer = await module.createJob(1, request());
		assert.deepEqual((await module.listJobs(1, {network: 'threads', limit: 1})).map(job => job.id), [newer.id]);
		assert.deepEqual((await module.listJobs(1, {network: 'threads', limit: 1, offset: 1})).map(job => job.id), [older.id]);
		assert.deepEqual(await module.listJobs(1, {network: 'patreon'}), []);
		await assert.rejects(module.listJobs(1, {network: 'other'}), {status: 400});
	});
	it('rejects a Patreon legacy job without a preview and matching protected-text boundary', async () => {
		const input = request({network: 'patreon', target: {title: 'Set', audience: 'paid_members', teaserText: 'Frozen', campaignId: '123'}});
		await assert.rejects(module.createJob(1, input), {status: 400});
		assert.deepEqual(await module.listJobs(1, {network: 'patreon'}), []);
	});
	it('requires explicit Patreon member access and preserves unbound campaign routing', async () => {
		const target = {title: 'Set title', audience: 'paid_members', teaserText: 'Subscribe.', campaignId: '123'};
		const input = request({network: 'patreon', target});
		assert.deepEqual(normalizeRequest(input).target, target);
		const {campaignId, ...unbound} = target;
		assert.deepEqual(normalizeRequest({...input, localAccountId: undefined, target: unbound}, true).target, unbound);
		for (const invalid of [{...target, audience: 'public'}, {...target, campaignId: '0'}, {...target, cookie: 'secret'}, {...target, teaserText: ''}]) {
			assert.throws(() => normalizeRequest({...input, target: invalid}), {status: 400});
		}
		assert.throws(() => normalizeRequest({...input, target: unbound}), {status: 400});
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
		assert.equal(await module.claimJob(2, {intentVersion: 6, accounts: [account], jobId: future.id}), null);
		assert.equal(await module.claimJob(1, {intentVersion: 6, accounts: [{...account, localAccountId: 'other'}], jobId: future.id}), null);
		const results = await Promise.all(Array.from({length: 4}, () => module.claimJob(1, {intentVersion: 6, accounts: [account], jobId: future.id})));
		assert.equal(results.filter(Boolean).length, 1);
		assert.equal(results.find(Boolean).id, future.id);
		assert.equal(await module.claimJob(1, {intentVersion: 6, accounts: [account], jobId: future.id}), null);
		assert.equal((await claim()).id, due.id);
		await assert.rejects(module.claimJob(1, {intentVersion: 6, accounts: [account], jobId: 0}), {status: 400});
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
		for (const column of ['composeIndex', 'composeHash', 'composeKey', 'producer']) {
			await sequelize.getQueryInterface().removeColumn(table, column);
		}
		await createModels(sequelize);
		const preserved = await models.PublicationJob.findByPk(job.id);
		assert.equal(preserved.get('status'), 'queued');
		assert.equal(preserved.get('composeKey'), null);
		assert.equal(preserved.get('producer'), null);
	});
	it('projects HTML to text and validates model indexes', async () => {
		content = [{type: 'text', mimeType: 'text/html', text: '<p>Hello <strong>world</strong></p>'}];
		assert.equal((await module.createJob(1, request())).payload.text, 'Hello world');
		const indexes = await sequelize.getQueryInterface().showIndex(models.PublicationJob.getTableName());
		const unique = (indexes as any[]).find(index => index.name === 'publication_jobs_owner_request_unique');
		assert.equal(unique.unique, true);
		assert.deepEqual(unique.fields.map(field => field.attribute), ['userId', 'requestKey']);
	});
	it('filters requested job IDs by owner and status and bounds their list', async () => {
		const own = await module.createJob(1, request());
		const foreign = await module.createJob(2, request());
		const unrelated = await module.createJob(1, request());
		await models.PublicationJob.update({composeKey: 'girls.intent.1'}, {where: {id: [own.id, foreign.id]}});
		assert.deepEqual((await module.listJobs(1, {composeKey: 'girls.intent.1'})).map(job => job.id), [own.id]);
		assert.deepEqual(await module.listJobs(1, {composeKey: 'girls.intent.1', ids: String(unrelated.id)}), []);
		for (const composeKey of ['', 'x'.repeat(129), 'invalid key', ['girls.intent.1']]) {
			await assert.rejects(module.listJobs(1, {composeKey}), {status: 400});
		}
		assert.deepEqual((await module.listJobs(1, {ids: `${own.id},${foreign.id}`})).map(job => job.id), [own.id]);
		await module.cancelJob(1, own.id);
		assert.deepEqual(await module.listJobs(1, {ids: String(own.id), status: 'queued'}), []);
		assert.equal((await module.listJobs(1, {ids: String(own.id), status: 'cancelled'}))[0].id, own.id);
		for (const ids of ['', '0', '-1', '1,1', '1,,2', '1.0', '9007199254740992', ['1'], Array.from({length: 101}, (_, index) => index + 1).join(',')]) {
			await assert.rejects(module.listJobs(1, {ids}), {status: 400});
		}
	});
	it('validates Rule34 metadata without accepting credentials or extra settings', async () => {
		const target = {tags: 'artist_name original', source: 'https://example.com/gallery'};
		const input = request({network: 'rule34xxx', target});
		assert.deepEqual(normalizeRequest(input).target, target);
		assert.equal((await module.createJob(1, input)).network, 'rule34xxx');
		assert.equal((await module.createJob(1, request({network: 'twitter'}))).network, 'twitter');
		for (const invalid of [{}, {...target, cookie: 'secret'}, {...target, tags: 'a\nb'}, {...target, tags: 'x'.repeat(10001)}, {...target, source: 'https://user:secret@example.com/'}, {...target, source: 'https://example.com/?api_key=secret'}, {...target, source: 'javascript:alert(1)'}, {...target, rating: 'explicit'}]) {
			assert.throws(() => normalizeRequest({...input, target: invalid}), {status: 400});
		}
		assert.throws(() => normalizeRequest(request({network: 'twitter', target})), {status: 400});
		const claimed = await module.claimJob(1, {intentVersion: 6, accounts: [{network: 'rule34xxx', localAccountId: account.localAccountId}]});
		assert.equal(claimed.network, 'rule34xxx');
	});
	it('requires canonical contentType and rejects old classification fields', async () => {
		for (const contentType of ['sfw', 'nsfw']) {
			const job = await module.createJob(1, request({network: 'twitter', contentType, target: {}}));
			assert.equal(job.contentType, contentType);assert.deepEqual(job.target, {});assert.equal(job.intentVersion, 6);
		}
		for (const contentType of [undefined, null, false, 'other']) {
			assert.throws(() => normalizeRequest(request({contentType})), {code: 'publication_content_type_invalid'});
		}
		assert.throws(() => normalizeRequest(request({network: 'twitter', target: {sensitive: false}})), {status: 400});
	});
	it('validates frozen Bluesky, Discord and Telegram targets and claim filters', async () => {
		const cases = [
			{network: 'bluesky', target: {}},
			{network: 'discord', target: {channelId: '12345678901234567890', guildId: '1'}},
			{network: 'telegram', target: {chatId: '-1001234567890'}},
		];
		for (const value of cases) {
			const created = await module.createJob(1, request(value));
			assert.deepEqual(created.target, value.target);
			const claimed = await module.claimJob(1, {intentVersion: 6, accounts: [{network: value.network, localAccountId: account.localAccountId}]});
			assert.equal(claimed.id, created.id);
			assert.equal(await module.claimJob(2, {intentVersion: 6, accounts: [{network: value.network, localAccountId: account.localAccountId}]}), null);
		}
		assert.deepEqual(normalizeRequest(request({network: 'discord', target: {channelId: '1'}})).target, {channelId: '1'});
		assert.deepEqual(normalizeRequest(request({network: 'telegram', target: {chatId: '@valid_name'}})).target, {chatId: '@valid_name'});
		for (const value of [
			{network: 'bluesky', target: {sensitive: 'false'}},
			{network: 'bluesky', target: {appPassword: 'secret'}},
			{network: 'bluesky', target: {channelId: '1'}},
			{network: 'discord', target: {}},
			{network: 'discord', target: {channelId: 123}},
			{network: 'discord', target: {channelId: '0'}},
			{network: 'discord', target: {channelId: '1'.repeat(21)}},
			{network: 'discord', target: {channelId: '1', guildId: '-2'}},
			{network: 'discord', target: {channelId: '1', sensitive: null}},
			{network: 'discord', target: {channelId: '1', botToken: 'secret'}},
			{network: 'telegram', target: {}},
			{network: 'telegram', target: {chatId: '0'}},
			{network: 'telegram', target: {chatId: '-0'}},
			{network: 'telegram', target: {chatId: '1'.repeat(21)}},
			{network: 'telegram', target: {chatId: '@12345'}},
			{network: 'telegram', target: {chatId: '@abcd'}},
			{network: 'telegram', target: {chatId: 'https://api.telegram.org'}},
			{network: 'telegram', target: {chatId: '1', sensitive: 'true'}},
			{network: 'telegram', target: {chatId: '1', botToken: 'secret'}},
		]) {
			assert.throws(() => normalizeRequest(request(value)), {status: 400});
		}
		assert.throws(() => normalizeRequest(request({target: {chatId: '1'}})), {status: 400});
	});
	it('persists the existing 500-character remote ID and AT URI without widening result URL policy', async () => {
		await module.createJob(1, request({network: 'bluesky'}));
		const job = await module.claimJob(1, {intentVersion: 6, accounts: [{network: 'bluesky', localAccountId: account.localAccountId}]});
		const atUri = 'at://did:plc:example/app.bsky.feed.post/record';
		const result = {claimToken: job.claimToken, status: 'posted', remoteId: atUri, remoteUrl: 'https://bsky.app/profile/example.bsky.social/post/record'};
		await assert.rejects(module.reportResult(1, job.id, {...result, remoteId: 'a'.repeat(501)}), {status: 400});
		await assert.rejects(module.reportResult(1, job.id, {...result, remoteUrl: result.remoteUrl + '?token=secret'}), {status: 400});
		assert.equal((await module.reportResult(1, job.id, result)).remoteId, atUri);
		await module.createJob(1, request());
		const max = await claim();
		assert.equal((await module.reportResult(1, max.id, {claimToken: max.claimToken, status: 'posted', remoteId: 'a'.repeat(500)})).remoteId.length, 500);
	});
	it('accepts only the canonical Rule34 result query for its confirmed ID and network', async () => {
		const rule34 = await module.createJob(1, request({network: 'rule34xxx', target: {tags: 'artist original', source: 'https://example.com'}}));
		const claimed = await module.claimJob(1, {intentVersion: 6, accounts: [{network: 'rule34xxx', localAccountId: account.localAccountId}]});
		const remoteUrl = 'https://rule34.xxx/index.php?page=post&s=view&id=123';
		const result = {claimToken: claimed.claimToken, status: 'posted', remoteId: '123', remoteUrl};
		for (const badUrl of [remoteUrl + '&token=secret', remoteUrl + '&id=123', remoteUrl.replace('id=123', 'id=124'), remoteUrl.replace('s=view', 's=add'), remoteUrl.replace('rule34.xxx', 'evil.example'), remoteUrl.replace('/index.php', '/other.php'), remoteUrl.replace('https:', 'http:')]) {
			await assert.rejects(module.reportResult(1, rule34.id, {...result, remoteUrl: badUrl}), {status: 400});
		}
		assert.equal((await module.reportResult(1, rule34.id, result)).remoteUrl, remoteUrl);
		assert.equal((await module.reportResult(1, rule34.id, result)).status, 'posted');
		await module.createJob(1, request());
		const other = await claim();
		await assert.rejects(module.reportResult(1, other.id, {...result, claimToken: other.claimToken}), {status: 400});
	});
	it('binds producer digest to exact text, ordered media and sorted target fields', () => {
		const payload = {text: 'Hello ☀', attachments: [{storageId: 'bafy1', mimeType: 'image/jpeg', url: 'https://ignored.example/'}]};
		const digest = publicationIntentDigest({contentType: 'nsfw', network: 'rule34xxx', localAccountId: 'main', target: {source: 'https://example.com', tags: 'artist original'}}, payload);
		assert.equal(digest, '1d1e7de56fcd030ea99d130f7f249dd7f1d09acaf24884c87fa74ff858c97a56');
		assert.notEqual(publicationIntentDigest({contentType: 'sfw', network: 'rule34xxx', localAccountId: 'main', target: {source: 'https://example.com', tags: 'artist original'}}, payload), digest);
		assert.equal(publicationIntentDigest({contentType: 'nsfw', network: 'rule34xxx', localAccountId: 'main', target: {tags: 'artist original', source: 'https://example.com'}}, {...payload, attachments: [{...payload.attachments[0], url: 'https://changed.example/'}]}), digest);
		assert.notEqual(publicationIntentDigest({contentType: 'nsfw', network: 'rule34xxx', localAccountId: 'other', target: {source: 'https://example.com', tags: 'artist original'}}, payload), digest);
		assert.notEqual(publicationIntentDigest({contentType: 'nsfw', network: 'rule34xxx', localAccountId: 'main', target: {source: 'https://example.com', tags: 'artist original'}}, {...payload, text: 'Changed'}), digest);
	});
	it('bounds lists and rejects unsafe input/secret fields/remote URLs', async () => {
		assert.equal(normalizeRequest(request({postId: '1', target: {kind: 'image'}})).postId, 1);
		assert.throws(() => normalizeRequest(request({target: {kind: 'invalid'}})), {status: 400});
		assert.throws(() => normalizeRequest(request({accessToken: 'secret'})), {status: 400});
		assert.throws(() => normalizeRequest(request({target: {accessToken: 'secret'}})), {status: 400});
		assert.throws(() => normalizeRequest(request({scheduledAt: 'tomorrow'})), {status: 400});
		await assert.rejects(module.listJobs(1, {limit: 1000}), {status: 400});
		await assert.rejects(module.claimJob(1, {intentVersion: 6, accounts: [{...account, userId: 2}]}), {status: 400});
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
		const module = Object.fromEntries(['createJob','listJobs','claimJob','reportResult','cancelJob','compose','getOutbox','listSources','createSource','listDestinations','registerDestinations','claimDestinationJob','disableDestination','setupServerDestination','listDestinationGroups','createDestinationGroup','updateDestinationGroup'].map(name => [name, async (...args) => {calls.push(args); return null;} ]));
		let permission = true;
		registerApi({ms: {api: {
			onAuthorizedPost: (path, handler) => routes.set(`POST ${path}`, handler),
			onAuthorizedGet: (path, handler) => routes.set(`GET ${path}`, handler)
		}}, checkUserCan: async (userId, name) => {assert.equal(name, CorePermissionName.UserGroupManagement); if (!permission) {throw new Error('not_permitted');}}} as any, module as any);
		assert.equal(routes.size, 36);
		for (const [path, handler] of routes.entries()) {
			const req = {user: {id: 7}, apiKey: {id: 1, scopes: ['assets:write']}, body: {}, query: {}, params: {jobId: 1}};
			await assert.rejects(handler(req, {send() {}}), {code: 'insufficient_scope'});
			req.apiKey.scopes = ['publishing:local', 'assets:write', 'publishing:manage'];
			permission = false;
			await assert.rejects(handler(req, {send() {}}), /not_permitted/);
			permission = true;
			await handler(req, {send() {}});
			assert.equal(calls.at(-1)[0], 7);
		}
	});
});
