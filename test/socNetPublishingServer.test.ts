import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import helpers from '../app/helpers.js';
import createModels from '../app/modules/socNetPublishing/models.js';
import createAccounts from '../app/modules/socNetAccount/models.js';
import {getModule, normalizeRequest} from '../app/modules/socNetPublishing/index.js';
import {getModule as accountModule} from '../app/modules/socNetAccount/index.js';
import {publicationIntentDigest} from '../app/modules/socNetPublishing/producer.js';
import {getDestinationMethods} from '../app/modules/socNetPublishing/destinations.js';
import startCron from '../app/modules/socNetPublishing/cron.js';
import registerApi from '../app/modules/socNetPublishing/api.js';
import {getApiKeyScopes} from '../app/modules/api/integrationScopes.js';
import {CorePermissionName} from '../app/modules/database/interface.js';
import {GroupType, PostStatus} from '../app/modules/group/interface.js';

describe('server social publishing foundation', function () {
	this.timeout(30000);
	let sequelize, models, app, module, published, outcome, group, identity;
	const schema = `server_publications_${randomUUID().replaceAll('-', '')}`;
	const setup = (extra = {}) => ({contentPolicy: 'nsfw', requestKey: 'telegram-main', network: 'telegram', label: 'Server Telegram', sourceGroupId: 2, account: {botToken: 'fixture-bot-secret'}, target: {chatId: '-12345'}, ...extra});
	before(async () => {
		sequelize = new Sequelize({...config, database: process.env.DATABASE_NAME || 'geesome_test', logging: false, pool: {max: 2}, define: {schema}} as any);
		await sequelize.createSchema(schema, {});
		models = await createModels(sequelize);
		await createAccounts(sequelize);
	});
	after(async () => { await sequelize?.dropSchema(schema, {cascade: true}); await sequelize?.close(); });
	beforeEach(async () => {
		await models.PublicationJob.destroy({where: {}}); await models.PublicationDestination.destroy({where: {}}); await sequelize.models.socNetAccount.destroy({where: {}});
		published = [];outcome = 'posted';identity = 'bot:12345';
		group = {id: 2, creatorId: 1, type: GroupType.Channel, isPublic: false, isOpen: false};
		app = {config: {apiConfig: {publicUrl: 'https://node.example'}}, ms: {database: {sequelize, models: {}}, group: {
			getGroup: async () => group,
			getPost: async () => ({id: 1, groupId: 2, userId: 1, status: PostStatus.Published, group}),
			canEditPostInGroup: async userId => userId === 1,
			getPostContentData: async () => [{type: 'text', text: 'Frozen server text'}]
		}}, encryptTextWithAppPass: text => helpers.encryptText(text, 'test-app-pass'), decryptTextWithAppPass: text => helpers.decryptText(text, 'test-app-pass')};
		module = getModule(app, models, {providers: {
			verify: async (_network, _credentials, target) => ({accountIdentity: identity, target}),
			publish: async (network, account, payload) => {published.push({network, account, payload}); if (outcome !== 'posted') {throw Object.assign(new Error('provider-secret must not be logged'), {ambiguous: outcome === 'unknown'});} return {remoteId: '42', remoteUrl: 'https://t.me/fixture/42'};}
		}});
	});
	async function queued(destination, extra = {}) {
		return models.PublicationJob.create({userId: 1, postId: 1, contentType: 'nsfw', requestKey: randomUUID(), requestHash: 'a'.repeat(64), destinationId: destination.id,
			executionMode: 'server', serverAccountId: destination.account, accountIdentity: destination.accountIdentity, localAccountId: null, clientId: null,
			network: 'telegram', intentVersion: 6, target: {chatId: '-12345'}, payload: {text: 'Frozen server text', attachments: []}, scheduledAt: new Date(0), status: 'queued', ...extra});
	}
	async function registered(extra = {}) {
		const result = await module.setupServerDestination(1, setup({enabled: true, ...extra}));
		const row = await models.PublicationDestination.findByPk(result.destination.id);
		return {...result.destination, account: row.socNetAccountId};
	}
	it('lists queued jobs in sending order before pagination with stable ties and owner/network filters', async () => {
		const destination = await registered();
		const late = await queued(destination, {scheduledAt: '2030-01-03T00:00:00Z'});
		const first = await queued(destination, {scheduledAt: '2030-01-01T00:00:00Z'});
		const tied = await queued(destination, {scheduledAt: '2030-01-01T00:00:00Z'});
		const posted = await queued(destination, {status: 'posted', scheduledAt: '2020-01-01T00:00:00Z'});
		await queued(destination, {userId: 2, scheduledAt: '2000-01-01T00:00:00Z'});
		await queued(destination, {network: 'discord', scheduledAt: '2000-01-01T00:00:00Z'});
		const query = {order: 'queue', network: 'telegram', limit: 2};
		assert.deepEqual((await module.listJobs(1, query)).map(job => job.id), [first.id, tied.id]);
		assert.deepEqual((await module.listJobs(1, {...query, offset: 2})).map(job => job.id), [late.id, posted.id]);
		assert.deepEqual((await module.listJobs(1, {ids: [late.id, first.id, tied.id, posted.id].join(',')})).map(job => job.id), [posted.id, tied.id, first.id, late.id]);
		await assert.rejects(module.listJobs(1, {order: 'invalid'}), {status: 400});
	});
	it('separates active queue from history before pagination and intersects explicit status and owner filters', async () => {
		const destination = await registered();
		const early = await queued(destination, {status: 'failed', scheduledAt: '2030-01-01T00:00:00Z'});
		const later = await queued(destination, {status: 'processing', scheduledAt: '2030-01-02T00:00:00Z'});
		const review = await queued(destination, {status: 'needs_review', scheduledAt: '2030-01-03T00:00:00Z'});
		const pending = await queued(destination, {scheduledAt: '2030-01-04T00:00:00Z'});
		const posted = await queued(destination, {status: 'posted'});
		const cancelled = await queued(destination, {status: 'cancelled'});
		await queued(destination, {userId: 2, status: 'posted'});
		const ids = async query => (await module.listJobs(1, query)).map(job => job.id);
		assert.deepEqual(await ids({view: 'queue', limit: 2}), [early.id, later.id]);
		assert.deepEqual(await ids({view: 'queue', limit: 2, offset: 2}), [review.id, pending.id]);
		assert.deepEqual(await ids({view: 'history', limit: 1}), [cancelled.id]);
		assert.deepEqual(await ids({view: 'history', limit: 1, offset: 1}), [posted.id]);
		assert.deepEqual(await ids({view: 'queue', status: 'posted'}), []);
		assert.deepEqual(await ids({view: 'history', status: 'posted'}), [posted.id]);
		assert.deepEqual(await ids({view: 'history', network: 'discord'}), []);
		await assert.rejects(module.listJobs(1, {view: 'invalid'}), {status: 400});
	});
	it('encrypts write-only credentials, defaults disabled, reuses account and preserves destination identity', async () => {
		const first = await module.setupServerDestination(1, setup());assert.equal(first.destination.enabled, false);
		assert(!JSON.stringify(first).includes('fixture-bot-secret'));assert.equal(first.destination.clientId, undefined);assert.equal(first.destination.socNetAccountId, undefined);
		const account = await sequelize.models.socNetAccount.findOne();assert(!account.serverCredentialsEncrypted.includes('fixture-bot-secret'));
		assert.equal((await module.setupServerDestination(1, setup({enabled: true}))).destination.id, first.destination.id);
		assert.equal(await sequelize.models.socNetAccount.count(), 1);
		identity = 'bot:99999';await assert.rejects(module.setupServerDestination(1, setup()), {status: 409});
		const accounts = accountModule(app, {Account: sequelize.models.socNetAccount});
		await assert.rejects(accounts.createOrUpdateAccount(1, {socNet: 'telegram', accountId: 'bot:12345', username: 'replacement'}), /dedicated_setup/);
		await assert.rejects(accounts.createOrUpdateAccount(1, {socNet: 'telegram', accountId: 'bot:99999', serverCredentialsEncrypted: 'forged'}), /dedicated_setup/);
	});
	it('uses explicit one-channel policies with a shared account and frozen worker validation', async () => {
		const {resolveDestination} = getDestinationMethods(models.PublicationDestination, {normalizeRequest, app, loadServerAccount: module.loadServerAccount, boundedInteger: Number, problem: (status, code) => Object.assign(new Error(code), {status, code})});
		const sfw = await registered({contentPolicy: 'sfw'});
		const nsfw = await registered({requestKey: 'telegram-other', contentPolicy: 'nsfw', target: {chatId: '-67890'}});
		assert.equal(sfw.account, nsfw.account);
		assert.equal(sfw.contentPolicy, 'sfw');
		await assert.rejects(module.setupServerDestination(1, setup({contentPolicy: 'sfw', target: {chatId: '-12345', sfwChatId: '-67890'}})), {status: 400});

		await assert.rejects(resolveDestination(1, {contentType: 'nsfw', destinationId: sfw.id, network: 'telegram', target: {}}), {code: 'publication_content_policy_forbidden'});
		const invalid = await queued(sfw, {contentPolicy: 'sfw', target: {chatId: '-12345'}});
		await module.processServerQueue();assert.equal(published.length, 0);assert.equal((await invalid.reload()).status, 'failed');
		const frozen = await queued(sfw, {contentPolicy: 'nsfw', target: {chatId: '-12345'}});
		await module.processServerQueue();assert.equal(published.length, 1);assert.equal((await frozen.reload()).contentPolicy, 'nsfw');
	});
	it('rechecks the due slot after a candidate is rescheduled before its claim lock', async () => {
		const destination = await registered();const job = await queued(destination);let moved = false;
		models.PublicationJob.addHook('beforeFind', 'reschedule-before-claim', async options => {
			if (options.transaction && options.lock && !moved) {
				moved = true;
				await job.update({scheduledAt: new Date(Date.now() + 3600000)});
			}
		});
		try {
			assert.equal(await module.claimServerJob(), null);assert.equal(moved, true);await job.reload();assert.equal(job.status, 'queued');assert.equal(published.length, 0);
		} finally {
			models.PublicationJob.removeHook('beforeFind', 'reschedule-before-claim');
		}
	});
	it('isolates server claims, frozen payload, result permissions and outcome state', async () => {
		const destination = await registered();const job = await queued(destination);
		assert.equal(await module.claimJob(1, {intentVersion: 6, accounts: [{network: 'telegram', localAccountId: 'anything'}]}), null);
		assert.equal(await module.claimDestinationJob(1, 'key:1', {intentVersion: 6, destinationIds: [destination.id]}), null);
		await models.PublicationDestination.update({target: {chatId: '-77777'}}, {where: {id: destination.id}});
		await module.processServerQueue();assert.equal(published.length, 1);assert.equal(published[0].payload.target.chatId, '-12345');assert.equal((await job.reload()).status, 'posted');
		assert.equal((await module.listJobs(1))[0].serverAccountId, undefined);
		await assert.rejects(module.reportResult(1, job.id, {claimToken: job.claimToken, status: 'posted', remoteId: '42'}, 'key:1'), {status: 403});
	});
	it('serializes concurrent worker ticks and never republishes unknown or processing outcomes', async () => {
		const destination = await registered();const job = await queued(destination);outcome = 'unknown';
		await Promise.all([module.processServerQueue(), module.processServerQueue()]);assert.equal(published.length, 1);assert.equal((await job.reload()).status, 'needs_review');
		assert(!job.error.includes('provider-secret'));await module.processServerQueue();assert.equal(published.length, 1);
		await queued(destination, {status: 'processing'});await module.processServerQueue();assert.equal(published.length, 1);
	});
	it('retries only database result after acknowledgement loss', async () => {
		const destination = await registered();await queued(destination);const report = module.reportResult.bind(module);let failed = false;
		module.reportResult = async (...args) => {if (!failed) {failed = true;throw Error('db unavailable');}return report(...args);};
		await assert.rejects(module.processServerQueue());assert.equal(published.length, 1);await module.processServerQueue();assert.equal(published.length, 1);
	});
	it('keeps disabled/missing credentials queued and prevents source privacy changes', async () => {
		const destination = await registered();const job = await queued(destination);await module.disableDestination(1, destination.id, {});
		await module.processServerQueue();assert.equal((await job.reload()).status, 'queued');assert.equal(published.length, 0);
		await models.PublicationDestination.update({enabled: true}, {where: {id: destination.id}});app.decryptTextWithAppPass = () => {throw Error('wrong app key');};
		await module.processServerQueue();assert.equal((await job.reload()).status, 'queued');assert.equal(published.length, 0);
		app.decryptTextWithAppPass = text => helpers.decryptText(text, 'test-app-pass');group.isPublic = true;
		await module.processServerQueue();await module.processServerQueue();assert.equal((await job.reload()).status, 'failed');assert.equal(published.length, 0);
	});
	it('does not starve healthy jobs behind disabled destinations or bad encrypted accounts', async () => {
		const bad = await registered();for (let i=0;i<25;i++) {await queued(bad);}
		await module.disableDestination(1, bad.id, {});
		const healthy = await registered({requestKey: 'healthy'});const job = await queued(healthy);await module.processServerQueue();assert.equal((await job.reload()).status, 'posted');
		await models.PublicationDestination.update({enabled: true}, {where: {id: bad.id}});
		// Both destinations share a verified account, so use a separate corrupt account for the blocked batch.
		const broken = await sequelize.models.socNetAccount.create({userId: 1, socNet: 'telegram', accountId: 'bot:66666', serverCredentialsEncrypted: 'corrupt'});
		await models.PublicationDestination.update({socNetAccountId: broken.id, accountIdentity: 'bot:66666'}, {where: {id: bad.id}});
		await models.PublicationJob.update({serverAccountId: broken.id, accountIdentity: 'bot:66666'}, {where: {destinationId: bad.id}});
		const next = await queued(healthy);await module.processServerQueue();await module.processServerQueue();assert.equal((await next.reload()).status, 'posted');
	});
	it('keeps startup paused and uses stable v6 canonical digest', () => {
		assert.equal(startCron(app, module), null);
		const payload = {text: 'hello', attachments: [{storageId: 'QmOne', mimeType: 'image/jpeg'}]};
		assert.equal(publicationIntentDigest({contentType: 'nsfw', destinationId: 1, accountIdentity: 'bot:12345', network: 'telegram', target: {chatId: '-123'}, executionMode: 'server'}, payload), publicationIntentDigest({contentType: 'nsfw', destinationId: 1, accountIdentity: 'bot:12345', network: 'telegram', target: {chatId: '-123'}, executionMode: 'server'}, payload));
	});
	it('requires explicit management scope on canonical and legacy setup endpoints', async () => {
		assert(!getApiKeyScopes({permissions: JSON.stringify([CorePermissionName.UserGroupManagement])} as any).includes('publishing:manage'));
		const routes = new Map();registerApi({ms: {api: {onGet() {}, onAuthorizedPost: (path, handler) => routes.set(path, handler), onAuthorizedGet() {}}}, checkUserCan: async () => {}} as any, module);
		for (const prefix of ['social-publications','local-publications']) {
			const handler = routes.get(`user/${prefix}/server-destinations`);assert(handler);
			await assert.rejects(handler({user: {id: 1}, apiKey: {scopes: ['publishing:local']}, body: setup()}, {send() {}}), {code: 'insufficient_scope'});
			await handler({user: {id: 1}, apiKey: {scopes: ['publishing:manage']}, body: setup()}, {send(value) {assert.equal(value.destination.executionMode, 'server');}});
		}
	});
	it('reverifies stored credentials for settings without changing endpoints or publishing, rejects stale/foreign edits', async () => {
		const {destination} = await module.setupServerDestination(1, setup());
		await models.PublicationDestination.update({defaultDelayMinutes: 240}, {where: {id: destination.id}});
		const {defaultDelayMinutes: _interval, ...legacyDestination} = destination;
		const input = {expected: legacyDestination, enabled: true, contentPolicy: 'sfw'};
		const result = await module.updateServerDestinationSettings(1, destination.id, input);
		assert.equal(result.destination.enabled, true);assert.equal(result.destination.contentPolicy, 'sfw');
		assert.equal(result.destination.defaultDelayMinutes, 240);
		assert.equal(result.destination.id, destination.id);assert.deepEqual(result.destination.target, destination.target);
		assert(!JSON.stringify(result).includes('fixture-bot-secret'));assert.equal(published.length, 0);
		assert.deepEqual((await module.updateServerDestinationSettings(1, destination.id, input)).destination, result.destination);
		await assert.rejects(module.updateServerDestinationSettings(2, destination.id, input), {status: 404});
		await assert.rejects(module.updateServerDestinationSettings(1, destination.id, {...input, expected: {...destination, target: {chatId: '-9'}}, enabled: false}), {status: 409});
		await assert.rejects(module.updateServerDestinationSettings(1, destination.id, {...input, target: {chatId: '-9'}}), {status: 400});
		identity = 'bot:99999';await assert.rejects(module.updateServerDestinationSettings(1, destination.id, {expected: result.destination, enabled: false, contentPolicy: 'nsfw'}), {status: 409});
		assert.equal((await models.PublicationDestination.findByPk(destination.id)).enabled, true);
	});
	it('settings route requires explicit management authorization in both namespaces', async () => {
		const routes = new Map();let calls = 0;
		registerApi({ms: {api: {onGet() {}, onAuthorizedGet() {}, onAuthorizedPost: (path, handler) => routes.set(path, handler)}}, checkUserCan: async () => {}} as any,
			{updateServerDestinationSettings: async (userId, id) => {assert.equal(userId, 7);assert.equal(id, '9');calls++;return {};}} as any);
		for (const prefix of ['social-publications', 'local-publications']) {
			const handler = routes.get('user/' + prefix + '/server-destinations/:destinationId/settings');
			const request = {user: {id: 7}, apiKey: {type: 'user_manual', scopes: ['publishing:local']}, params: {destinationId: '9'}, body: {}};
			await assert.rejects(handler(request, {send() {}}), {status: 403});
			request.apiKey.scopes.push('publishing:manage');await handler(request, {send() {}});
		}
		assert.equal(calls, 2);
	});

});
