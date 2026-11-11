import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DataTypes, Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import createModels from '../app/modules/socNetPublishing/models.js';
import {getQueueShuffleMethods} from '../app/modules/socNetPublishing/queueShuffle.js';
import registerApi from '../app/modules/socNetPublishing/api.js';

describe('publication queue shuffle', function () {
	this.timeout(30000);
	const schema = `shuffle_${randomUUID().replaceAll('-', '')}`;
	let db, models, Group, Post, service, group, otherGroup, first, second, foreign;
	const problem = (status, code) => Object.assign(new Error(code), {status, code});
	before(async () => {
		db = new Sequelize({...config, define: {schema}, logging: false} as any);
		await db.createSchema(schema, {});
		Group = db.define('shuffleGroup', {creatorId: DataTypes.INTEGER, isPublic: DataTypes.BOOLEAN, isOpen: DataTypes.BOOLEAN, type: DataTypes.STRING});
		Post = db.define('shufflePost', {groupId: DataTypes.INTEGER, isDeleted: {type: DataTypes.BOOLEAN, defaultValue: false}});
		await Group.sync();await Post.sync();models = await createModels(db);
		service = getQueueShuffleMethods({ms: {database: {models: {Group, Post}}}}, models, {problem}, {randomInt: () => 0});
		group = await Group.create({creatorId: 1, isPublic: false, isOpen: false, type: 'channel'});
		otherGroup = await Group.create({creatorId: 1, isPublic: false, isOpen: false, type: 'channel'});
		const destination = (userId, localKey) => models.PublicationDestination.create({userId, clientId: 'key:1', localKey, network: 'discord', label: localKey, target: {channelId: localKey}, enabled: true});
		first = await destination(1, 'first');second = await destination(1, 'second');foreign = await destination(2, 'foreign');
	});
	after(async () => {await db?.dropSchema(schema, {cascade: true});await db?.close();});
	beforeEach(async () => {await models.PublicationJob.destroy({where: {}});await models.PublicationQueueShuffle.destroy({where: {}});});
	const input = (extra = {}) => ({requestKey: randomUUID(), groupId: group.id, destinationIds: [first.id, second.id], ...extra});
	async function jobs(destination, extra = {}) {
		const post = await Post.create({groupId: group.id, ...extra});
		const rows = [];
		for (const index of [1, 2, 3]) {
			rows.push(await models.PublicationJob.create({userId: 1, postId: post.id, requestKey: randomUUID(), requestHash: 'fixture', destinationId: destination.id, network: 'discord', intentVersion: 6,
			target: {channelId: destination.localKey}, payload: {text: `${destination.localKey}-${index}`}, scheduledAt: new Date(Date.now() + index * 3600000), status: 'queued'}));
		}
		return rows;
	}
	async function snapshot() {return models.PublicationJob.findAll({order: [['id', 'ASC']], raw: true});}
	it('independently permutes each destination while preserving slots, payload, routing and immutable request hashes', async () => {
		const a = await jobs(first), b = await jobs(second);
		const before = await snapshot();const result = await service.shuffleQueue(1, input());
		assert.deepEqual(result.destinations.map(row => [row.queuedJobs, row.changedJobs]), [[3, 3], [3, 3]]);
		const after = await snapshot();
		for (const members of [a, b]) {
			const ids = new Set(members.map(row => row.id));
			const oldRows = before.filter(row => ids.has(row.id)), newRows = after.filter(row => ids.has(row.id));
			assert.deepEqual(newRows.map(row => +row.scheduledAt).sort(), oldRows.map(row => +row.scheduledAt).sort());
			assert.notDeepEqual(newRows.map(row => +row.scheduledAt), oldRows.map(row => +row.scheduledAt));
			for (let index = 0; index < oldRows.length; index++) {
				for (const key of ['requestHash', 'requestKey', 'target', 'payload', 'postId', 'destinationId', 'status']) {
					assert.deepEqual(newRows[index][key], oldRows[index][key]);
				}
			}
		}
	});
	it('excludes due, processing, terminal, foreign, other-source and unselected jobs', async () => {
		const selected = await jobs(first);const other = await jobs(second);const outside = await jobs(first, {groupId: otherGroup.id});const foreignJobs = await jobs(foreign);
		await selected[0].update({scheduledAt: new Date(0)});await selected[1].update({status: 'processing'});await selected[2].update({status: 'posted'});await foreignJobs[0].update({userId: 2});
		const before = await snapshot();const result = await service.shuffleQueue(1, input({destinationIds: [first.id]}));
		assert.equal(result.destinations[0].queuedJobs, 0);assert.deepEqual(await snapshot(), before);assert.equal(other.length + outside.length, 6);
	});
	it('shuffles the native site queue independently from social schedules and excludes protected native jobs', async () => {
		const native = await models.PublicationDestination.create({userId: 1, localKey: 'site-group', network: 'geesome', executionMode: 'native', label: 'Site Group', target: {groupId: 123}, enabled: true});
		const site = await jobs(native), social = await jobs(first), outside = await jobs(native, {groupId: otherGroup.id}), protectedJobs = await jobs(native);
		for (const job of [...site, ...outside, ...protectedJobs]) {
			await job.update({network: 'geesome', executionMode: 'native', target: {groupId: 123}});
		}
		await protectedJobs[0].update({status: 'processing'});await protectedJobs[1].update({status: 'posted'});await protectedJobs[2].update({userId: 2});
		const before = await snapshot();
		const result = await service.shuffleQueue(1, input({destinationIds: [native.id, first.id]}));
		assert.deepEqual(result.destinations.map(row => row.queuedJobs), [3, 3]);
		const after = await snapshot();
		for (const rows of [site, social]) {
			const ids = rows.map(row => row.id), oldSlots = before.filter(row => ids.includes(row.id)).map(row => +row.scheduledAt), newSlots = after.filter(row => ids.includes(row.id)).map(row => +row.scheduledAt);
			assert.deepEqual([...newSlots].sort(), [...oldSlots].sort());assert.notDeepEqual(newSlots, oldSlots);
		}
		const protectedIds = [...outside, ...protectedJobs].map(row => row.id);
		assert.deepEqual(after.filter(row => protectedIds.includes(row.id)), before.filter(row => protectedIds.includes(row.id)));
		for (const row of after) {
			const original = before.find(item => item.id === row.id);
			for (const key of ['network', 'executionMode', 'target', 'payload', 'requestHash', 'destinationId']) {
				assert.deepEqual(row[key], original[key]);
			}
		}
	});
	it('replays lost replies and concurrent retries exactly once, rejecting changed scope under the same key', async () => {
		await jobs(first);await jobs(second);const body = input();
		const results = await Promise.all([service.shuffleQueue(1, body), service.shuffleQueue(1, body)]);
		assert.deepEqual(results[0], results[1]);const frozen = await snapshot();
		assert.deepEqual(await service.shuffleQueue(1, {...body, destinationIds: [...body.destinationIds].reverse()}), results[0]);assert.deepEqual(await snapshot(), frozen);
		assert.equal(await models.PublicationQueueShuffle.count(), 1);
		await assert.rejects(service.shuffleQueue(1, {...body, destinationIds: [first.id]}), {code: 'publication_queue_shuffle_conflict'});
	});
	it('rejects missing ownership, wrong source scope, malformed IDs and retired fields before updates', async () => {
		await jobs(first);const before = await snapshot();
		for (const extra of [{destinationIds: [foreign.id]}, {destinationIds: [999999]}, {groupId: 999999}]) {
			await assert.rejects(service.shuffleQueue(1, input(extra)), {status: 403});
		}
		await first.update({sourceGroupId: otherGroup.id});await assert.rejects(service.shuffleQueue(1, input()), {status: 403});await first.update({sourceGroupId: null});
		for (const extra of [{destinationIds: []}, {destinationIds: [first.id, first.id]}, {destinationIds: ['1']}, {network: 'discord'}, {requestKey: ''}]) {
			await assert.rejects(service.shuffleQueue(1, input(extra)), {status: 400});
		}
		assert.deepEqual(await snapshot(), before);assert.equal(await models.PublicationQueueShuffle.count(), 0);
	});
	it('rolls back every schedule update when a later write fails and allows the original request to resume', async () => {
		await jobs(first);const before = await snapshot();let writes = 0;
		models.PublicationJob.addHook('beforeUpdate', 'shuffle-failure', () => {writes++;if (writes === 2) {throw Error('fixture write failure');}});
		const body = input();await assert.rejects(service.shuffleQueue(1, body), /fixture write failure/);models.PublicationJob.removeHook('beforeUpdate', 'shuffle-failure');
		assert.deepEqual(await snapshot(), before);assert.equal(await models.PublicationQueueShuffle.count(), 0);assert.equal((await service.shuffleQueue(1, body)).destinations[0].queuedJobs, 3);
	});
	it('waits for a concurrent destination claim and leaves its processing job untouched', async () => {
		const members = await jobs(first);const transaction = await db.transaction();
		await models.PublicationDestination.findByPk(first.id, {transaction, lock: transaction.LOCK.SHARE});
		await members[0].update({status: 'processing'}, {transaction});
		const pending = service.shuffleQueue(1, input({destinationIds: [first.id]}));
		await transaction.commit();const result = await pending;
		assert.equal(result.destinations[0].queuedJobs, 2);await members[0].reload();assert.equal(members[0].status, 'processing');
	});
	it('rejects a disabled destination and rolls back an oversized eligible queue', async () => {
		await first.update({enabled: false});await assert.rejects(service.shuffleQueue(1, input()), {status: 403});await first.update({enabled: true});
		const post = await Post.create({groupId: group.id});const scheduledAt = new Date(Date.now() + 86400000);
		await models.PublicationJob.bulkCreate(Array.from({length: 10001}, () => ({userId: 1, postId: post.id, requestKey: randomUUID(), requestHash: 'fixture', destinationId: first.id, network: 'discord', intentVersion: 6, target: {}, payload: {}, scheduledAt, status: 'queued'})));
		await assert.rejects(service.shuffleQueue(1, input()), {code: 'publication_queue_shuffle_too_large'});
		assert.equal(await models.PublicationJob.count({where: {scheduledAt, status: 'queued'}}), 10001);assert.equal(await models.PublicationQueueShuffle.count(), 0);
	});
	it('requires publishing scope in both URL namespaces and forwards only the authenticated owner', async () => {
		const routes = new Map(), calls = [];
		registerApi({ms: {api: {onAuthorizedGet() {}, onAuthorizedPost: (path, handler) => routes.set(path, handler)}}, checkUserCan: async () => {}} as any,
			{shuffleQueue: async (...args) => {calls.push(args);return {};}} as any);
		for (const prefix of ['social-publications', 'local-publications']) {
			const handler = routes.get(`user/${prefix}/queue-shuffle`);
			await assert.rejects(handler({user: {id: 1}, apiKey: {scopes: []}}, {send() {}}), {status: 403});
			await handler({user: {id: 7}, apiKey: {scopes: ['publishing:local']}, body: {userId: 2}}, {send() {}});
		}
		assert.deepEqual(calls.map(call => call[0]), [7, 7]);
	});
});
