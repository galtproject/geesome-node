import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize, DataTypes} from 'sequelize';
import createAccounts from '../app/modules/socNetAccount/models.js';
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
	let sequelize, models, publishing, accounts, module, destination, job, serverCalls;
	const observed = (kind, id, metrics, observedAt = '2026-11-10T12:00:00Z') => ({kind, [kind === 'post' ? 'jobId' : 'destinationId']: id, observedAt, metrics});
	before(async () => {
		sequelize = new Sequelize({...databaseConfig, database: process.env.DATABASE_NAME || 'geesome_test', logging: false, define: {schema}} as any);
		await sequelize.createSchema(schema, {});
		publishing = await createPublishingModels(sequelize);
		models = await createStatisticsModels(sequelize);
		accounts = await createAccounts(sequelize);
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
		await accounts.Account.destroy({where: {}, truncate: true});
		await sequelize.models.post.destroy({where: {}, truncate: true});
		await sequelize.models.post.create({id: 4, userId: 1, groupId: 2});
		destination = await publishing.PublicationDestination.create({userId: 1, clientId: 'key:1', localKey: 'main', localAccountId: 'threads_1', sourceGroupId: 2, network: 'threads', label: 'Main', contentPolicy: 'nsfw', executionMode: 'client', target: {}});
		job = await publishing.PublicationJob.create({userId: 1, postId: 4, destinationId: destination.id, clientId: 'key:1', executionMode: 'client', requestKey: randomUUID(), requestHash: 'hash', network: 'threads', target: {}, payload: {text: 'Caption'}, scheduledAt: new Date(), status: 'posted', remoteId: '123'});
		module = getModule({ms: {group: {getPostPure: async () => ({groupId: 2})}, socNetAccount: {listTelegramStatisticsAccounts: accountModule({} as any, accounts).listTelegramStatisticsAccounts, assertTelegramStatisticsAccount: accountModule({} as any, accounts).assertTelegramStatisticsAccount, getStatistics: async (userId, input) => {serverCalls.push({userId, input});return input.kind === 'group' ? {followers: 30} : input.readerAccountId ? {views: 17, reactions: 2, replies: 0, reposts: 1, likes: null} : null;}}}}, models, {now: () => new Date('2026-11-11T23:00:00Z')});
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
		assert.equal((await module.refresh(1, {kind: 'post', id: job.id})).results[0].status, 'connection_required');
		await job.update({serverAccountId: 10});
		assert.equal((await module.refresh(1, {kind: 'post', id: job.id})).results[0].status, 'connection_required');
		assert.equal(serverCalls.length, 1);
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
	it('filters DeviantArt receipts and destinations while reporting metric collection unsupported', async () => {
		const identity = 'deviantart:12345678-1234-1234-1234-123456789abc';
		const account = await accounts.Account.create({userId: 1, socNet: 'deviantart', accountId: identity, serverCredentialsEncrypted: 'encrypted-fixture'});
		await destination.update({network: 'deviantart', executionMode: 'server', socNetAccountId: account.id, accountIdentity: identity});
		await job.update({network: 'deviantart', executionMode: 'server', serverAccountId: account.id, accountIdentity: identity});
		const socNetAccount = accountModule({decryptTextWithAppPass: async () => JSON.stringify({network: 'deviantart', accountIdentity: identity, credentials: {accessToken: 'private'}})} as any, accounts, {
			reader: createStatisticsReader(async () => {throw Error('Unsupported statistics must not call the provider');})
		});
		const statistics = getModule({ms: {group: {getPostPure: async () => ({groupId: 2})}, socNetAccount}}, models);
		const summary = await statistics.summary(1, {network: 'deviantart'});
		assert.equal(summary.posts.length, 1);assert.equal(summary.groups.length, 1);
		assert.equal(summary.posts[0].network, 'deviantart');assert.equal(summary.groups[0].network, 'deviantart');
		assert.equal((await statistics.refresh(1, {kind: 'post', id: job.id})).results[0].status, 'unsupported');
		assert.equal((await statistics.refresh(1, {kind: 'group', id: destination.id})).results[0].status, 'unsupported');
		assert.equal(await models.SocialPostStatistic.count(), 0);assert.equal(await models.SocialGroupStatistic.count(), 0);
		assert(!JSON.stringify(summary).includes('private'));
	});
	it('counts all confirmed receipts by destination, with rolling boundaries and distinct remote IDs', async () => {
		const asOf = new Date('2026-11-11T23:00:00Z');
		const add = (remoteId, ageHours, extra = {}) => publishing.PublicationJob.create({...job.toJSON(), id: undefined, requestKey: randomUUID(), remoteId, createdAt: new Date('2020-01-01'), confirmedAt: new Date(asOf.getTime() - ageHours * 3600000), ...extra});
		await add('day', 1);
		await add('day', 2); // One confirmed remote publication, even with duplicate receipts.
		await add('boundary-day', 24);
		await add('week', 25);
		await add('boundary-week', 168);
		await add('old', 169);
		await add('future', -1);
		await add('failed', 1, {status: 'failed'});
		await add('foreign', 1, {userId: 2});
		await add('other-destination', 1, {destinationId: destination.id + 50});
		const summary = await module.summary(1, {limit: 1});
		assert.equal(summary.posts.length, 1);
		assert.deepEqual(summary.groups[0].publicationCounts, {last24Hours: 2, last7Days: 4, asOf: asOf.toISOString()});
		assert.deepEqual((await module.summary(1, {offset: 5, limit: 1})).groups[0].publicationCounts, summary.groups[0].publicationCounts);
	});
	it('describes shared Discord guild scope and persists member observations without calling them followers', async () => {
		await destination.update({network: 'discord', target: {guildId: '123', channelId: '456'}});
		const safe = await publishing.PublicationDestination.create({...destination.toJSON(), id: undefined, localKey: 'safe', target: {guildId: '123', channelId: '789'}});
		await module.record(1, 'key:1', {observations: [observed('group', destination.id, {members: 100, online: 10}), observed('group', destination.id, {members: 104, online: 12}, '2026-11-11T12:00:00Z')]});
		const group = (await module.summary(1)).groups[0];
		assert.deepEqual(group.audience, {kind: 'guildMembers', scopeId: '123', approximate: true, sharedDestinations: 2});
		assert.equal(group.statistics.audienceDelta, 4);
		assert.equal(group.statistics.followerDelta, null);
		assert.equal((await module.summary(1)).groups[1].statistics.metrics.members, 104);
		await module.record(1, 'key:1', {observations: [observed('group', safe.id, {members: 105, online: 13}, '2026-11-11T13:00:00Z')]});
		assert.equal((await module.summary(1)).groups[0].statistics.metrics.members, 105);
		assert.equal((await module.summary(1)).groups[1].statistics.audienceDelta, 5);
		assert.equal((await module.history(1, {kind: 'group', id: safe.id})).snapshots.length, 2);
	});
	it('keeps a legacy local Discord destination without guild ID readable', async () => {
		await destination.update({network: 'discord', target: {channelId: '456'}});
		const group = (await module.summary(1)).groups[0];
		assert.equal(group.audience.scopeId, null);
		assert.equal(group.audience.sharedDestinations, 1);
		assert.equal((await module.history(1, {kind: 'group', id: destination.id})).snapshots.length, 0);
	});
	it('binds only owned usable Telegram users and reads client or server receipts through Node', async () => {
		const account = await accounts.Account.create({userId: 1, socNet: 'telegram', accountId: '777', sessionKey: 'private-session', apiKey: 'a'.repeat(32), apiId: '123', username: 'reader', isEncrypted: false});
		const foreign = await accounts.Account.create({userId: 2, socNet: 'telegram', accountId: '888', sessionKey: 'foreign', isEncrypted: false});
		await destination.update({network: 'telegram', target: {chatId: '-100123'}});
		await job.update({network: 'telegram', target: {chatId: '-100123'}});
		assert.equal((await module.refresh(1, {kind: 'post', id: job.id})).results[0].status, 'connection_required');
		await assert.rejects(module.bindTelegramReader(1, destination.id, {accountId: foreign.id}));
		await assert.rejects(module.bindTelegramReader(2, destination.id, {accountId: foreign.id}));
		await module.bindTelegramReader(1, destination.id, {accountId: account.id});
		await assert.rejects(module.record(1, 'key:1', {observations: [observed('post', job.id, {views: 999})]}), /executor_forbidden/);
		const settings = await module.telegramSettings(1);
		assert.equal(settings.destinations[0].accountId, account.id);
		assert.equal(settings.accounts.length, 1);
		assert.doesNotMatch(JSON.stringify(settings), /private|sessionKey|apiKey/);
		assert.equal((await module.refresh(1, {kind: 'post', id: job.id})).results[0].status, 'updated');
		assert.equal(serverCalls.at(-1).input.readerAccountId, account.id);
		assert.deepEqual((await module.summary(1)).posts[0].statistics.metrics, {views: 17, reactions: 2, replies: 0, reposts: 1, likes: null});
		await module.bindTelegramReader(1, destination.id, {accountId: null});
		assert.equal((await module.refresh(1, {kind: 'post', id: job.id})).results[0].status, 'connection_required');
		await account.update({isEncrypted: true});
		await assert.rejects(module.bindTelegramReader(1, destination.id, {accountId: account.id}));
	});
	it('stores Patreon paid audience separately and rejects paid counts on another network', async () => {
		await assert.rejects(module.record(1, 'key:1', {observations: [observed('group', destination.id, {followers: 10, paidMembers: 2})]}));
		await destination.update({network: 'patreon'});
		await module.record(1, 'key:1', {observations: [observed('group', destination.id, {followers: 10, paidMembers: 2})]});
		assert.equal((await module.summary(1)).groups[0].statistics.metrics.paidMembers, 2);
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
		assert.equal(routes.length, 9);
		for (const route of routes) {
			await assert.rejects(route.handler({user: {id: 1}, apiKey: {id: 7, scopes: ['assets:write']}, body: {}, query: {}}, {send() {}}));
		}
		for (const route of routes.filter(row => row.path.includes('/telegram-login/') || row.path.endsWith('/telegram-account'))) {
			await assert.rejects(route.handler({user: {id: 1}, apiKey: {id: 7, scopes: ['publishing:local']}, body: {}, params: {}}, {send() {}}), {status: 403});
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


describe('Discord guild audience adapter', () => {
	it('reads approximate server membership/presence and returns permission errors safely', async () => {
		const input = {network: 'discord', kind: 'group', account: {credentials: {botToken: 'private_token'}}, target: {guildId: '123', channelId: '456'}, remoteId: undefined};
		const reader = createStatisticsReader(async (url, options) => {
			assert.equal(url, 'https://discord.com/api/v10/guilds/123?with_counts=true');
			assert.equal(new Headers(options.headers).get('authorization'), 'Bot private_token');
			return new Response(JSON.stringify({id: '123', approximate_member_count: 100, approximate_presence_count: 5}));
		});
		assert.deepEqual(await reader(input), {members: 100, online: 5});
		await assert.rejects(createStatisticsReader(async () => new Response('secret', {status: 403}))(input), (error: any) => error.statisticsStatus === 'access_denied' && !error.message.includes('secret'));
	});
});
