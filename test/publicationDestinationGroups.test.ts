import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import registerApi from '../app/modules/socNetPublishing/api.js';
import createModels from '../app/modules/socNetPublishing/models.js';
import {getDestinationGroupMethods} from '../app/modules/socNetPublishing/destinationGroups.js';

describe('publication destination groups', function () {
	this.timeout(30000);
	const schema = `destination_groups_${randomUUID().replaceAll('-', '')}`;
	let db, models, groups, owned, foreign;
	const problem = (status, code) => Object.assign(new Error(code), {status, code});
	const boundedInteger = (value, min, max) => {
		if (!Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
			throw problem(400, 'invalid_integer');
		}
		return Number(value);
	};
	before(async () => {
		db = new Sequelize({...config, database: process.env.DATABASE_NAME || 'geesome_test', define: {schema}, logging: false} as any);
		await db.createSchema(schema, {});
		models = await createModels(db);
		groups = getDestinationGroupMethods(models.PublicationDestinationGroup, models.PublicationDestination, {problem, boundedInteger});
		const destination = (userId, localKey) => models.PublicationDestination.create({userId, clientId: 'key:1', localKey, localAccountId: localKey, network: 'discord', label: localKey, target: {channelId: '123'}, enabled: true, contentPolicy: 'nsfw'});
		owned = await Promise.all([destination(1, 'one'), destination(1, 'two')]);
		foreign = await destination(2, 'foreign');
	});
	after(async () => {await db?.dropSchema(schema, {cascade: true});await db?.close();});
	const input = (extra = {}) => ({requestKey: randomUUID(), label: 'All channels', destinationIds: owned.map(row => row.id), enabled: true, ...extra});
	it('stores ordered same-network members, retries creation concurrently, and exposes safe owner-only metadata', async () => {
		const body = input();
		const results = await Promise.all(Array.from({length: 4}, () => groups.createDestinationGroup(1, body)));
		assert.equal(new Set(results.map(row => row.group.id)).size, 1);
		const group = results[0].group;
		assert.deepEqual(group.destinationIds, owned.map(row => row.id));
		assert.deepEqual(Object.keys(group).sort(), ['destinationIds', 'enabled', 'id', 'label', 'revision']);
		assert.equal((await groups.listDestinationGroups(2)).groups.length, 0);
		assert.equal((await groups.listDestinationGroups(1, {limit: 1})).groups.length, 1);
		await assert.rejects(groups.createDestinationGroup(1, {...body, label: 'different'}), {code: 'publication_destination_group_request_conflict'});
	});
	it('rejects duplicate/foreign/missing members, nested groups, credentials and unbounded lists without creating records', async () => {
		const count = await models.PublicationDestinationGroup.count();
		for (const extra of [{destinationIds: []}, {destinationIds: [owned[0].id, owned[0].id]}, {destinationIds: [foreign.id]}, {destinationIds: [99999]}, {destinationIds: ['1']}, {groupIds: [1]}, {botToken: 'not-accepted'}, {destinationIds: Array.from({length: 21}, (_, i) => i + 1)}]) {
			await assert.rejects(groups.createDestinationGroup(1, input(extra)));
		}
		assert.equal(await models.PublicationDestinationGroup.count(), count);
		await assert.rejects(groups.listDestinationGroups(1, {limit: 101}));
	});
	it('compares revisions, permits exact lost-reply replay and preserves accepted member snapshots through retirement', async () => {
		const create = input();
		const {group} = await groups.createDestinationGroup(1, create);
		const frozen = structuredClone(group);
		const update = {label: 'Safe channel', destinationIds: [owned[1].id], enabled: false, revision: 1};
		const result = await groups.updateDestinationGroup(1, group.id, update);
		assert.equal(result.group.revision, 2);
		assert.deepEqual((await groups.updateDestinationGroup(1, group.id, update)).group, result.group);
		await assert.rejects(groups.updateDestinationGroup(1, group.id, {...update, label: 'Stale overwrite'}), {code: 'publication_destination_group_changed'});
		await assert.rejects(groups.updateDestinationGroup(2, group.id, update), {status: 404});
		assert.deepEqual((await groups.createDestinationGroup(1, create)).group, result.group);
		assert.deepEqual(frozen.destinationIds, owned.map(row => row.id));
		await owned[1].update({enabled: false});
		assert.deepEqual((await groups.listDestinationGroups(1)).groups.find(row => row.id === group.id), result.group);
	});
	it('authorizes both namespaces before group reads or writes and passes only the authenticated owner', async () => {
		const routes = new Map();
		const calls = [];
		const module = Object.fromEntries(['listDestinationGroups', 'createDestinationGroup', 'updateDestinationGroup'].map(name => [name, async (...args) => {calls.push({name, args});return {groups: []};}]));
		registerApi({ms: {api: {onGet() {}, onAuthorizedGet: (path, handler) => routes.set('GET ' + path, handler), onAuthorizedPost: (path, handler) => routes.set('POST ' + path, handler)}}, checkUserCan: async () => {}} as any, module as any);
		for (const prefix of ['social-publications', 'local-publications']) {
			for (const route of ['GET user/' + prefix + '/destination-groups', 'POST user/' + prefix + '/destination-groups', 'POST user/' + prefix + '/destination-groups/:groupId']) {
				const handler = routes.get(route);
				await assert.rejects(handler({user: {id: 1}, apiKey: {scopes: []}}, {send() {}}), {status: 403});
				await handler({user: {id: 7}, apiKey: {scopes: ['publishing:local']}, body: {}, query: {}, params: {groupId: 8}}, {send() {}});
			}
		}
		assert.equal(calls.length, 6);
		assert(calls.every(call => call.args[0] === 7));
	});

});
