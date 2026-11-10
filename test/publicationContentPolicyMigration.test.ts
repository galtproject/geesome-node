import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Sequelize, QueryTypes} from 'sequelize';
import config from '../app/modules/database/config.js';

const migration = createRequire(import.meta.url)('../app/modules/database/migrations/20261110002000-publication-content-policy.cjs');

describe('publication content policy released-schema upgrade', function () {
	this.timeout(30000);
	let sequelize;
	const schema = `policy_upgrade_${randomUUID().replaceAll('-', '')}`;
	before(async () => {
		sequelize = new Sequelize({...config, database: process.env.DATABASE_NAME || 'geesome_test', logging: false, pool: {max: 1}} as any);
		await sequelize.createSchema(schema, {});
		await sequelize.query(`SET search_path TO "${schema}"`);
	});
	after(async () => {await sequelize?.dropSchema(schema, {cascade: true});await sequelize?.close();});
	it('preserves legacy jobs and routes and refuses to discard policy data on rollback', async () => {
		await migration.up(sequelize.getQueryInterface());
		await sequelize.query('CREATE TABLE "publicationJobs" (id SERIAL PRIMARY KEY, status VARCHAR(20), target JSONB)');
		await sequelize.query('CREATE TABLE "publicationDestinations" (id SERIAL PRIMARY KEY, target JSONB)');
		await sequelize.query(`INSERT INTO "publicationJobs" (status,target) VALUES ('queued','{"channelId":"123"}'), ('processing','{"channelId":"456"}')`);
		await sequelize.query(`INSERT INTO "publicationDestinations" (target) VALUES ('{"channelId":"123","sfwChannelId":"456"}')`);
		await migration.up(sequelize.getQueryInterface());await migration.up(sequelize.getQueryInterface());
		const jobs = await sequelize.query('SELECT * FROM "publicationJobs" ORDER BY id', {type: QueryTypes.SELECT});
		assert.deepEqual(jobs.map(row => row.contentPolicy), [null, null]);assert.equal(jobs[1].status, 'processing');
		const [legacy] = await sequelize.query('SELECT * FROM "publicationDestinations"', {type: QueryTypes.SELECT});assert.equal(legacy.target.sfwChannelId, '456');
		await sequelize.query(`UPDATE "publicationDestinations" SET "contentPolicy"='sfw'`);
		await assert.rejects(migration.down(sequelize.getQueryInterface()), /publication_content_policy_prevents_rollback/);
		await sequelize.query('UPDATE "publicationDestinations" SET "contentPolicy"=NULL');
		await sequelize.query(`UPDATE "publicationJobs" SET "contentPolicy"='nsfw' WHERE id=1`);
		await assert.rejects(migration.down(sequelize.getQueryInterface()), /publication_content_policy_prevents_rollback/);
		await sequelize.query('UPDATE "publicationJobs" SET "contentPolicy"=NULL');await migration.down(sequelize.getQueryInterface());
		assert.equal((await sequelize.query('SELECT * FROM "publicationJobs"', {type: QueryTypes.SELECT})).length, 2);
	});
});
