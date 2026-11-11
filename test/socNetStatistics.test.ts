import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize, DataTypes} from 'sequelize';
import createStatisticsModels from '../app/modules/socNetStatistics/models.js';
import createPublishingModels from '../app/modules/socNetPublishing/models.js';
import {getModule} from '../app/modules/socNetStatistics/index.js';
import {getModule as accountModule} from '../app/modules/socNetAccount/index.js';
import {createStatisticsReader} from '../app/modules/socNetAccount/statistics.js';
import registerApi from '../app/modules/socNetStatistics/api.js';
import databaseConfig from '../app/modules/database/config.js';

describe('daily social statistics', function () {
	this.timeout(30000);
	const schema = `statistics_${randomUUID().replaceAll('-', '')}`;
	let sequelize, models, publishing, module, destination, job, serverCalls;
	const observed = (kind, id, metrics, observedAt = '2026-11-10T12:00:00Z') => ({kind, [kind === 'post' ? 'jobId' : 'destinationId']: id, observedAt, metrics});
	before(async () => {
		sequelize = new Sequelize({...databaseConfig, database: process.env.DATABASE_NAME || 'geesome_test', logging: false, define: {schema}} as any);
		await sequelize.createSchema(schema, {});
		publishing = await createPublishingModels(sequelize);
		models = await createStatisticsModels(sequelize);
		await sequelize.define('post', {userId: DataTypes.INTEGER, groupId: DataTypes.INTEGER}).sync({});
	});
	after(async () => {
		await sequelize?.dropSchema(schema, {cascade: true});
		await sequelize?.close();
	});
	beforeEach(async () => {
		for (const model of [...Object.values(models), ...Object.values(publishing)] as any[]) {
			await model.destroy({where: {}, truncate: true});
		}
		serverCalls = [];
		await sequelize.models.post.destroy({where: {}, truncate: true});
		await sequelize.models.post.create({id: 4, userId: 1, groupId: 2});
		destination = await publishing.PublicationDestination.create({userId: 1, clientId: 'key:1', localKey: 'main', localAccountId: 'threads_1', sourceGroupId: 2, network: 'threads', label: 'Main', contentPolicy: 'nsfw', executionMode: 'client', target: {}});
		job = await publishing.PublicationJob.create({userId: 1, postId: 4, destinationId: destination.id, clientId: 'key:1', executionMode: 'client', requestKey: randomUUID(), requestHash: 'hash', network: 'threads', target: {}, payload: {text: 'Caption'}, scheduledAt: new Date(), status: 'posted', remoteId: '123'});
		module = getModule({ms: {group: {getPostPure: async () => ({groupId: 2})}, socNetAccount: {getStatistics: async (userId, input) => {serverCalls.push({userId, input});return input.kind === 'group' ? {followers: 30} : null;}}}}, models, {now: () => new Date('2026-11-11T23:00:00Z')});
	});
	it('updates the same UTC day, ignores delayed/equal observations and inserts a new day with net delta', async () => {
		await module.record(1, 'key:1', {observations: [observed('group', destination.id, {followers: 100})]});
		await module.record(1, 'key:1', {observations: [observed('group', destination.id, {followers: 120}, '2026-11-10T23:59:59Z')]});
		await module.record(1, 'key:1', {observations: [observed('group', destination.id, {followers: 9}), observed('group', destination.id, {followers: 8}, '2026-11-10T23:59:59Z')]});
		assert.equal(await models.SocialGroupStatistic.count(), 1);
		assert.equal((await module.summary(1)).groups[0].statistics.followerDelta, null);
		await module.record(1, 'key:1', {observations: [observed('group', destination.id, {followers: 115}, '2026-11-11T00:00:00Z')]});
		const summary = await module.summary(1);
		assert.equal(summary.groups[0].statistics.followerDelta, -5);
		assert.equal(summary.groups[0].statistics.metrics.followers, 115);
		assert.equal((await module.history(1, {kind: 'group', id: destination.id})).snapshots.length, 2);
	});
	it('handles concurrent upserts without duplicates or stale values', async () => {
		await Promise.all([1, 3, 2, 4].map(hour => module.record(1, 'key:1', {observations: [observed('post', job.id, {likes: hour, views: null}, `2026-11-11T0${hour}:00:00Z`)]})));
		assert.equal(await models.SocialPostStatistic.count(), 1);
		const post = (await module.summary(1)).posts[0];
		assert.equal(post.statistics.metrics.likes, 4);
		assert.equal(post.statistics.metrics.views, null);
		assert.equal(post.text, 'Caption');
		assert(!JSON.stringify(post).includes('requestHash'));
	});
	it('rejects foreign owners/clients, server writes, unposted receipts and invalid metrics atomically', async () => {
		const input = {observations: [observed('post', job.id, {likes: 1})]};
		await assert.rejects(module.record(2, 'key:1', input), /entity_not_found/);
		await assert.rejects(module.record(1, 'key:2', input), /executor_forbidden/);
		await assert.rejects(module.history(2, {kind: 'post', id: job.id}), /entity_not_found/);
		await assert.rejects(module.record(1, 'key:1', {observations: [...input.observations, observed('group', destination.id, {followers: -1})]}), /metrics_invalid/);
		assert.equal(await models.SocialPostStatistic.count(), 0);
		for (const metrics of [{likes: '4'}, {likes: 1.5}, {likes: Number.MAX_SAFE_INTEGER + 1}, {followers: 4}, {likes: NaN}, {}]) {
			await assert.rejects(module.record(1, 'key:1', {observations: [observed('post', job.id, metrics)]}));
		}
		await assert.rejects(module.record(1, 'key:1', {observations: [observed('post', job.id, {likes: 1}, '2026-11-12T12:00:00Z')]}), /timestamp_invalid/);
		await job.update({executionMode: 'server'});
		await assert.rejects(module.record(1, 'key:1', input), /executor_forbidden/);
		await job.update({executionMode: 'client', status: 'queued'});
		await assert.rejects(module.record(1, 'key:1', input), /entity_not_found/);
		assert.deepEqual((await module.summary(2)).posts, []);
	});
	it('delegates server data to socNetAccount, persists it and preserves history on failure/unsupported', async () => {
		await destination.update({executionMode: 'server', network: 'telegram', socNetAccountId: 9, accountIdentity: 'bot:123', target: {chatId: '-123'}});
		assert.equal((await module.refresh(1, {kind: 'group', id: destination.id})).results[0].status, 'updated');
		assert.equal(serverCalls[0].input.accountId, 9);
		assert.equal(serverCalls[0].input.accountIdentity, 'bot:123');
		assert.deepEqual(serverCalls[0].input.target, {chatId: '-123'});
		assert.equal((await module.summary(1)).groups[0].statistics.metrics.followers, 30);
		await job.update({executionMode: 'server', network: 'telegram', serverAccountId: 9, accountIdentity: 'bot:123'});
		assert.equal((await module.refresh(1, {kind: 'post', id: job.id})).results[0].status, 'unsupported');
		await job.update({serverAccountId: 10});
		assert.equal((await module.refresh(1, {kind: 'post', id: job.id})).results[0].status, 'unavailable');
		assert.equal(serverCalls.length, 2);
		await assert.rejects(module.refresh(2, {kind: 'group', id: destination.id}), /entity_not_found/);
	});
	it('bounds and paginates receipts, destinations and source/network filters', async () => {
		await publishing.PublicationJob.create({...job.toJSON(), id: undefined, requestKey: randomUUID(), remoteId: '124'});
		const first = await module.summary(1, {groupId: 2, network: 'threads', limit: 1});
		assert.equal(first.posts.length, 1);
		assert.equal(first.nextOffset, 1);
		assert.equal((await module.summary(1, {limit: 1, offset: 1})).nextOffset, null);
		assert.equal((await module.summary(1, {groupId: 9})).posts.length, 0);
		assert.equal((await module.summary(1, {network: 'telegram'})).groups.length, 0);
		await assert.rejects(module.summary(1, {limit: 500}));
		await assert.rejects(module.summary(1, {groupId: '1 OR 1=1'}));
		await assert.rejects(module.summary(1, {network: 'arbitrary'}));
	});
	it('account module decrypts only owned matching server identities and never returns credentials', async () => {
		const Account = sequelize.define('statisticsAccountFixture', {userId: DataTypes.INTEGER, socNet: DataTypes.STRING, accountId: DataTypes.STRING, serverCredentialsEncrypted: DataTypes.TEXT});
		await Account.sync({});
		await Account.destroy({where: {}});
		const row = await Account.create({userId: 1, socNet: 'telegram', accountId: 'bot:123', serverCredentialsEncrypted: 'encrypted'});
		let reads = 0;
		const account = accountModule({decryptTextWithAppPass: async () => JSON.stringify({network: 'telegram', accountIdentity: 'bot:123', credentials: {botToken: 'private'}})} as any, {Account}, {reader: async input => {reads++;assert.equal(input.account.credentials.botToken, 'private');return {followers: 7};}});
		const input = {accountId: row.id, accountIdentity: 'bot:123', network: 'telegram', kind: 'group' as const, target: {chatId: '-123'}};
		assert.deepEqual(await account.getStatistics(1, input), {followers: 7});
		await assert.rejects(account.getStatistics(2, input), /account_unavailable/);
		await assert.rejects(account.getStatistics(1, {...input, accountIdentity: 'bot:456'}), /account_unavailable/);
		assert.equal(reads, 1);
	});
	it('authorizes every API route and binds local observations to a dedicated key', async () => {
		const routes = [], invocations = [];
		registerApi({checkUserCan: async () => {}, ms: {api: {onAuthorizedGet: (path, handler) => routes.push({path, handler}), onAuthorizedPost: (path, handler) => routes.push({path, handler})}}}, {summary: async () => ({}), history: async () => ({}), refresh: async () => ({}), record: async (...args) => {invocations.push(args);return {};}});
		assert.equal(routes.length, 4);
		for (const route of routes) {
			await assert.rejects(route.handler({user: {id: 1}, apiKey: {id: 7, scopes: ['assets:write']}, body: {}, query: {}}, {send() {}}));
		}
		const observation = routes.find(row => row.path.endsWith('/observations'));
		await observation.handler({user: {id: 1}, apiKey: {id: 7, scopes: ['publishing:local']}, body: {observations: []}}, {send() {}});
		assert.equal(invocations[0][1], 'key:7');
	});
});

describe('server social statistics provider reads', () => {
	it('reads Telegram membership without publishing and rejects hostile target interpolation', async () => {
		const requests = [];
		const reader = createStatisticsReader(async (url, options) => {requests.push({url, options});return new Response(JSON.stringify({ok: true, result: 12}));});
		const input = {network: 'telegram', kind: 'group', account: {credentials: {botToken: '12345:abcdefghijklmnopqrstuv'}}, target: {chatId: '-100123'}, remoteId: undefined};
		assert.deepEqual(await reader(input), {followers: 12});
		assert.equal(requests[0].options.redirect, 'error');
		assert.match(requests[0].url, /\/getChatMemberCount\?/);
		assert.equal(await reader({...input, kind: 'post'}), null);
		await assert.rejects(reader({...input, target: {chatId: '-123/evil'}}));
		assert.equal(requests.length, 1);
	});
});
