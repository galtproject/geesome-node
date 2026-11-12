import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import defineUsers from '../app/modules/database/models/user.js';
import defineContent from '../app/modules/database/models/content.js';
import defineGroups from '../app/modules/group/models/group.js';
import definePosts from '../app/modules/group/models/post.js';
import defineSubgroups from '../app/modules/group/models/groupSubgroup.js';
import defineMembership from '../app/modules/membership/models.js';
import {registerPublicationSources} from '../app/modules/membership/publicationSources.js';
import {createMembershipPublisher, publicationState} from '../app/modules/staticSiteGenerator/membershipPublisher.js';

const url = process.env.CREATOR_SUBGROUP_TEST_DATABASE_URL;
(url ? describe : describe.skip)('subgroup transactional publication invalidation on PostgreSQL', function () {
	this.timeout(30000);
	let db, admin, models, M, sources, publisher, parent, child, link;
	const schema = 'subgroup_sources_' + randomUUID().replaceAll('-', '');
	before(async () => {
		assert(['127.0.0.1', 'localhost'].includes(new URL(url!).hostname));
		admin = new Sequelize(url!, {logging: false});
		await admin.createSchema(schema, {});
		db = new Sequelize(url!, {logging: false, define: {schema}, dialectOptions: {options: `-c search_path=${schema},public`}});
		models = {};
		models.User = await defineUsers(db, models);
		models.Content = await defineContent(db, models);
		models.Group = await defineGroups(db, models);
		models.Post = await definePosts(db, models);
		models.GroupSubgroup = await defineSubgroups(db, models);
		M = await defineMembership(db);
		const app: any = {ms: {database: {sequelize: db, models}}};
		publisher = createMembershipPublisher(app, M, {clock: () => new Date()}, {});
		sources = registerPublicationSources(app, M, publisher);
	});
	after(async () => {
		sources?.stop();
		await publisher?.stop();
		await db?.close();
		await admin?.dropSchema(schema, {});
		await admin?.close();
	});
	beforeEach(async () => {
		await M.resources.destroy({where: {}});
		await M.publications.destroy({where: {}});
		const owner = await models.User.create({name: randomUUID()});
		parent = await models.Group.create({title: 'Creator', creatorId: owner.id, type: 'channel', isPublic: false});
		child = await models.Group.create({title: 'Feed', creatorId: owner.id, type: 'channel', isPublic: true});
		link = await models.GroupSubgroup.create({parentGroupId: parent.id, subgroupId: child.id, alias: 'feed', config: {}});
		await M.resources.create({id: 'creator', domain: 'creator.test', ownerId: owner.id, groupId: String(parent.id), postsEnabled: true, data: {publication: {sourceVersion: 0, publicationId: randomUUID()}}});
	});
	async function state() { return publicationState(await M.resources.findByPk('creator')); }
	it('coalesces post and relation edits in one transaction and rolls back source/job together', async () => {
		await db.transaction(async transaction => {
			await models.Post.create({groupId: child.id, status: 'published'}, {transaction});
			await link.update({config: {tabLabel: 'Latest'}}, {transaction});
			await child.update({title: 'Updated feed'}, {transaction});
		});
		assert.equal((await state()).sourceVersion, 1);
		assert.equal(await M.publications.count(), 1);
		assert.equal((await M.publications.findOne()).requestKey, 'auto:1');
		await assert.rejects(() => db.transaction(async transaction => {
			await child.update({isPublic: false}, {transaction});
			throw new Error('rollback');
		}), /rollback/);
		assert.equal((await state()).sourceVersion, 1);
		assert.equal(await M.publications.count(), 1);
		assert.equal((await child.reload()).isPublic, true);
	});
	it('invalidates parent for all child publication state fields and relation bulk edits', async () => {
		let revision = 0;
		for (const patch of [{isPublic: false}, {isEncrypted: true}, {isDeleted: true}, {isRemote: true}, {type: 'group'}, {creatorId: parent.creatorId + 1}]) {
			if (patch.creatorId) {
				const owner = await models.User.create({name: randomUUID()});
				patch.creatorId = owner.id;
			}
			await models.Group.update(patch, {where: {id: child.id}});
			assert.equal((await state()).sourceVersion, ++revision);
		}
		await models.GroupSubgroup.update({config: {tabLabel: 'Latest'}}, {where: {id: link.id}});
		assert.equal((await state()).sourceVersion, ++revision);
		await models.GroupSubgroup.destroy({where: {id: link.id}});
		assert.equal((await state()).sourceVersion, ++revision);
		assert.equal(await M.publications.count(), revision);
	});
	for (const bulk of [false, true]) {
		it(`captures parent before ${bulk ? 'bulk' : 'instance'} hard-delete cascades relation`, async () => {
			if (bulk) {
				await models.Group.destroy({where: {id: child.id}});
			} else {
				await child.destroy();
			}
			assert.equal(await models.GroupSubgroup.count({where: {id: link.id}}), 0);
			assert.equal((await state()).sourceVersion, 1);
			assert.equal(await M.publications.count(), 1);
		});
	}
	for (const bulk of [false, true]) {
		it(`waits for an in-flight link before ${bulk ? 'bulk' : 'instance'} transactional hard deletion`, async () => {
			await link.destroy();
			await (await M.resources.findByPk('creator')).update({data: {publication: {sourceVersion: 0, publicationId: randomUUID()}}});
			await M.publications.destroy({where: {}});
			const linking = await db.transaction(), deleting = await db.transaction();
			let deletion;
			try {
				await models.Group.findAll({where: {id: child.id}, order: [['id', 'ASC']], transaction: linking, lock: linking.LOCK.UPDATE});
				await models.GroupSubgroup.create({parentGroupId: parent.id, subgroupId: child.id, alias: 'feed', config: {}}, {transaction: linking});
				deletion = bulk ? models.Group.destroy({where: {id: child.id}, transaction: deleting}) : child.destroy({transaction: deleting});
				const pid = deleting.connection.processID;
				let blocked = false;
				for (let attempt = 0; attempt < 100; attempt++) {
					const [rows] = await admin.query('SELECT cardinality(pg_blocking_pids(:pid)) > 0 AS blocked', {replacements: {pid}});
					if (rows[0].blocked) {
						blocked = true;
						break;
					}
					await new Promise(resolve => setTimeout(resolve, 10));
				}
				assert(blocked, 'delete waits on the same Group row held by the link save');
				await linking.commit();
				await deletion;
				await deleting.commit();
			} catch (error) {
				if (!linking.finished) {
					await linking.rollback();
				}
				await deletion?.catch(() => {});
				if (!deleting.finished) {
					await deleting.rollback();
				}
				throw error;
			}
			assert.equal(await models.GroupSubgroup.count({where: {subgroupId: child.id}}), 0);
			assert.equal((await state()).sourceVersion, 2, 'link publication and later cascade removal each invalidate the parent');
			assert.equal(await M.publications.count(), 2);
		});
	}
	it('invalidates relation bulk-create and instance removal without duplicating jobs', async () => {
		await link.destroy();
		assert.equal((await state()).sourceVersion, 1);
		await db.transaction(async transaction => {
			await models.GroupSubgroup.bulkCreate([{parentGroupId: parent.id, subgroupId: child.id, alias: 'feed', config: {}}], {transaction});
			await models.Post.create({groupId: child.id, status: 'published'}, {transaction});
		});
		assert.equal((await state()).sourceVersion, 2);
		assert.equal(await M.publications.count(), 2);
	});
	it('leaves initial publication explicit', async () => {
		const row = await M.resources.findByPk('creator');
		await row.update({data: {}});
		await child.update({isPublic: false});
		assert.equal((await state()).sourceVersion, 1);
		assert.equal(await M.publications.count(), 0);
	});
});
