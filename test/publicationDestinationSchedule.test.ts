import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import createModels from '../app/modules/socNetPublishing/models.js';
import {getDestinationMethods} from '../app/modules/socNetPublishing/destinations.js';
import registerApi from '../app/modules/socNetPublishing/api.js';

describe('publication destination schedule defaults', function () {
	this.timeout(30000);
	const schema = `destination_schedule_${randomUUID().replaceAll('-', '')}`;
	let db, model, methods, rows;
	const problem = (status, code) => Object.assign(new Error(code), {status, code});
	before(async () => {
		db = new Sequelize({...config, database: 'geesome_test', define: {schema}, logging: false} as any);
		await db.createSchema(schema, {});
		model = (await createModels(db)).PublicationDestination;
		methods = getDestinationMethods(model, {app: {}, normalizeRequest: value => value, problem, boundedInteger: Number, loadServerAccount() {}});
		rows = await Promise.all(['client', 'server', 'native'].map((executionMode, index) => model.create({userId: 1, clientId: executionMode === 'client' ? 'key:1' : null, localKey: `route-${index}`, network: 'twitter', localAccountId: executionMode === 'client' ? 'account' : null, label: executionMode, executionMode, target: {}, enabled: true})));
	});
	after(async () => {await db?.dropSchema(schema, {cascade: true});await db?.close();});
	it('stores independent defaults for all execution modes, permits retries and resets to fallback', async () => {
		for (const [index, row] of rows.entries()) {
			const input = {defaultDelayMinutes: [10, 60, 120][index], expectedDefaultDelayMinutes: null};
			const result = await methods.updateDestinationSchedule(1, row.id, input);
			assert.equal(result.destination.defaultDelayMinutes, input.defaultDelayMinutes);
			assert.deepEqual(await methods.updateDestinationSchedule(1, row.id, input), result);
			await assert.rejects(methods.updateDestinationSchedule(1, row.id, {...input, defaultDelayMinutes: 30}), {status: 409});
		}
		assert.deepEqual((await methods.listDestinations(1)).destinations.map(row => row.defaultDelayMinutes), [10, 60, 120]);
		await methods.updateDestinationSchedule(1, rows[0].id, {defaultDelayMinutes: null, expectedDefaultDelayMinutes: 10});
		assert.equal((await methods.listDestinations(1)).destinations[0].defaultDelayMinutes, null);
	});
	it('rejects foreign owners and invalid intervals without changing persisted settings', async () => {
		await assert.rejects(methods.updateDestinationSchedule(2, rows[1].id, {defaultDelayMinutes: 10, expectedDefaultDelayMinutes: 60}), {status: 404});
		for (const value of [0, -1, 1.5, '30', 1440, undefined]) {
			await assert.rejects(methods.updateDestinationSchedule(1, rows[1].id, {defaultDelayMinutes: value, expectedDefaultDelayMinutes: 60}), {status: 400});
		}
		assert.equal((await methods.listDestinations(2)).destinations.length, 0);
		assert.equal((await methods.listDestinations(1)).destinations[1].defaultDelayMinutes, 60);
	});
	it('preserves defaults when a client registers its stable routes again', async () => {
		await methods.updateDestinationSchedule(1, rows[0].id, {defaultDelayMinutes: 240, expectedDefaultDelayMinutes: null});
		await methods.registerDestinations(1, 'key:1', {destinations: [{localKey: rows[0].localKey, network: 'twitter', localAccountId: 'account', label: 'Updated label', contentPolicy: 'nsfw', target: {}, enabled: true}]});
		assert.equal((await methods.listDestinations(1)).destinations[0].defaultDelayMinutes, 240);
	});
	it('requires publishing scope and group management in both namespaces', async () => {
		const routes = new Map();
		let owner;
		registerApi({ms: {api: {onGet() {}, onAuthorizedGet() {}, onAuthorizedPost: (path, handler) => routes.set(path, handler)}}, checkUserCan: async () => {}} as any, {updateDestinationSchedule: async id => {owner = id;return {};}} as any);
		for (const prefix of ['social-publications', 'local-publications']) {
			const handler = routes.get(`user/${prefix}/destinations/:destinationId/schedule-settings`);
			await assert.rejects(handler({user: {id: 1}, apiKey: {scopes: []}}, {send() {}}), {status: 403});
			await handler({user: {id: 7}, apiKey: {scopes: ['publishing:local']}, params: {destinationId: 1}, body: {}}, {send() {}});
			assert.equal(owner, 7);
		}
	});
});
