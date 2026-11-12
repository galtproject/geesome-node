import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import createGroupModel from '../app/modules/group/models/group.js';
import createSubgroupModel from '../app/modules/group/models/groupSubgroup.js';
import {getSubgroupMethods} from '../app/modules/group/subgroups.js';
import {normalizeSubgroupAlias, normalizeSubgroupConfig} from '../app/modules/group/subgroupConfig.js';
import registerGroupApi from '../app/modules/group/api.js';

describe('owned subgroup routes', function () {
	this.timeout(30000);
	const schema = `subgroup_routes_${randomUUID().replaceAll('-', '')}`;
	let db, models, methods, parent, child, second, foreign, denied;
	before(async () => {
		db = new Sequelize({...databaseConfig, database: process.env.DATABASE_NAME || 'geesome_test', define: {schema}, logging: false} as any);
		await db.createSchema(schema, {});
		const User = db.define('user', {}), Content = db.define('content', {});
		await User.sync();await Content.sync();
		await User.bulkCreate([{id: 1}, {id: 2}]);
		models = {User, Content};
		models.Group = await createGroupModel(db, models);
		models.GroupSubgroup = await createSubgroupModel(db, models);
		methods = getSubgroupMethods({checkUserCan: async () => {
			if (denied) {
				throw new Error('not_permitted');
			}
		}}, models);
	});
	beforeEach(async () => {
		denied = false;
		await models.GroupSubgroup.destroy({where: {}});
		await models.Group.destroy({where: {}});
		const make = (name, extra = {}) => models.Group.create({name, title: name, creatorId: 1, type: 'channel', isPublic: true, isEncrypted: false, isDeleted: false, isRemote: false, ...extra});
		parent = await make('creator-root', {isPublic: false});
		child = await make('creator-feed');
		second = await make('creator-news');
		foreign = await make('foreign-feed', {creatorId: 2});
	});
	after(async () => {await db?.dropSchema(schema, {cascade: true});await db?.close();});
	const input = (extra = {}) => ({subgroupId: child.id, alias: 'feed', config: {tabLabel: 'Feed', order: 10}, ...extra});
	it('stores one replay-safe link from an owned private parent to its public feed with SQL route constraints', async () => {
		const results = await Promise.all(Array.from({length: 4}, () => methods.saveSubgroup(1, parent.id, input())));
		assert(results.every(result => result.subgroup.revision === 1));
		assert.equal(await models.GroupSubgroup.count(), 1);
		assert.deepEqual(await methods.listSubgroups(1, parent.id), {subgroups: [results[0].subgroup]});
		assert.deepEqual(Object.keys(results[0].subgroup).sort(), ['alias', 'config', 'parentGroupId', 'revision', 'subgroupId']);
		await assert.rejects(models.GroupSubgroup.create({parentGroupId: parent.id, subgroupId: second.id, alias: 'feed'}), {name: 'SequelizeUniqueConstraintError'});
		await assert.rejects(models.GroupSubgroup.create({parentGroupId: parent.id, subgroupId: child.id, alias: 'another'}), {name: 'SequelizeUniqueConstraintError'});
		await assert.rejects(models.GroupSubgroup.create({parentGroupId: parent.id, subgroupId: 999999, alias: 'missing'}), {name: 'SequelizeForeignKeyConstraintError'});
		await assert.rejects(models.GroupSubgroup.create({parentGroupId: parent.id, subgroupId: parent.id, alias: 'self'}), error => error.original?.code === '23514');
	});
	it('compares update/removal revisions, supports lost replies and preserves alias uniqueness', async () => {
		await methods.saveSubgroup(1, parent.id, input());
		const update = input({alias: 'updates', revision: 1, config: {order: 5, tabLabel: 'Updates'}});
		assert.equal((await methods.saveSubgroup(1, parent.id, update)).subgroup.revision, 2);
		assert.equal((await methods.saveSubgroup(1, parent.id, update)).subgroup.revision, 2);
		await assert.rejects(methods.saveSubgroup(1, parent.id, {...update, alias: 'stale'}), {code: 'subgroup_changed'});
		await assert.rejects(methods.saveSubgroup(1, parent.id, input({subgroupId: second.id, alias: 'updates'})), {code: 'subgroup_alias_conflict'});
		await assert.rejects(methods.removeSubgroup(1, parent.id, {subgroupId: child.id, revision: 1}), {code: 'subgroup_changed'});
		assert.deepEqual(await methods.removeSubgroup(1, parent.id, {subgroupId: child.id, revision: 2}), {removed: true});
		assert.deepEqual(await methods.removeSubgroup(1, parent.id, {subgroupId: child.id, revision: 2}), {removed: true});
		assert.equal(await models.GroupSubgroup.count(), 0);
	});
	it('never authorizes foreign parents/children or private and unavailable target groups', async () => {
		await assert.rejects(methods.listSubgroups(2, parent.id), {code: 'subgroup_parent_unavailable'});
		await assert.rejects(methods.saveSubgroup(2, parent.id, input()), {code: 'subgroup_channel_unavailable'});
		await assert.rejects(methods.saveSubgroup(1, parent.id, input({subgroupId: foreign.id})), {code: 'subgroup_channel_unavailable'});
		for (const state of [{isPublic: false}, {isEncrypted: true}, {isDeleted: true}, {isRemote: true}, {type: 'personal-chat'}]) {
			await child.update({...{isPublic: true, isEncrypted: false, isDeleted: false, isRemote: false, type: 'channel'}, ...state});
			await assert.rejects(methods.saveSubgroup(1, parent.id, input()), {code: 'subgroup_channel_unavailable'});
		}
		denied = true;
		await assert.rejects(methods.listSubgroups(1, parent.id), /not_permitted/);
		assert.equal(await models.GroupSubgroup.count(), 0);
	});
	it('renders only currently available owned public children without inherited permissions or nested links', async () => {
		await methods.saveSubgroup(1, parent.id, input());
		await methods.saveSubgroup(1, parent.id, input({subgroupId: second.id, alias: 'news', config: {tabLabel: 'News', order: 1}}));
		const rows = await methods.getRenderableSubgroups(1, parent.id);
		assert.deepEqual(rows.map(row => row.alias), ['news', 'feed']);
		assert.equal(rows[1].group.id, child.id);
		assert.equal(rows[1].group.isPublic, true);
		assert.equal(rows[1].group.propertiesJson, undefined);
		await child.update({isPublic: false});
		assert.deepEqual((await methods.getRenderableSubgroups(1, parent.id)).map(row => row.alias), ['news']);
		await second.update({creatorId: 2});
		assert.deepEqual(await methods.getRenderableSubgroups(1, parent.id), []);
		assert.equal((await methods.listSubgroups(1, parent.id)).subgroups.length, 2);
	});
	it('validates bounded alias/config and rejects identities, traversal, reserved routes and extra fields', async () => {
		for (const alias of ['', 'Feed', '../feed', 'feed/', '/feed', 'posts', 'account', 'api', 'public', 'x'.repeat(65), 'foo_bar']) {
			assert.throws(() => normalizeSubgroupAlias(alias), {code: 'subgroup_alias_invalid'});
		}
		for (const config of [null, [], {groupId: 1}, {alias: 'feed'}, {tabLabel: ''}, {tabLabel: 'x'.repeat(81)}, {tabLabel: 'bad\nlabel'}, {order: -1}, {order: 1.5}, {order: 1001}]) {
			assert.throws(() => normalizeSubgroupConfig(config), {code: 'subgroup_config_invalid'});
		}
		assert.deepEqual(normalizeSubgroupConfig(), {});
		assert.equal(normalizeSubgroupAlias('feed-2'), 'feed-2');
		await assert.rejects(methods.saveSubgroup(1, parent.id, input({target: {}})), {code: 'subgroup_input_invalid'});
		await assert.rejects(methods.saveSubgroup(1, parent.id, input({subgroupId: parent.id})), {code: 'subgroup_input_invalid'});
		assert.equal(await models.GroupSubgroup.count(), 0);
	});
	it('routes authenticated owner identity and path-bound subgroup IDs through existing group APIs', async () => {
		const routes = new Map(), calls = [];
		const api = {onAuthorizedGet: (path, fn) => routes.set('GET ' + path, fn), onAuthorizedPost: (path, fn) => routes.set('POST ' + path, fn), onGet() {}, onPost() {}};
		const module: any = Object.fromEntries(['listSubgroups', 'saveSubgroup', 'removeSubgroup'].map(method => [method, async (...args) => {calls.push({method, args});return {};} ]));
		registerGroupApi({ms: {api}} as any, module);
		for (const [path, body] of [['GET user/group/:parentGroupId/subgroups', undefined], ['POST user/group/:parentGroupId/subgroups', {subgroupId: 5, alias: 'feed'}], ['POST user/group/:parentGroupId/subgroups/:subgroupId/remove', {subgroupId: 999, revision: 1}]]) {
			await routes.get(path)({user: {id: 7}, params: {parentGroupId: 3, subgroupId: 5}, body}, {send() {}});
		}
		assert(calls.every(call => call.args[0] === 7 && call.args[1] === 3));
		assert.deepEqual(calls[2].args[2], {subgroupId: 5, revision: 1});
	});
});
