import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Sequelize, QueryTypes} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';

const migration = createRequire(import.meta.url)('../app/modules/database/migrations/20261110000000-bind-publication-destinations.cjs');

describe('publication destination schema upgrade', function () {
	this.timeout(30000);
	const schema = `publication_destination_migration_${randomUUID().replaceAll('-', '')}`;
	let sequelize;
	before(async () => {
		sequelize = new Sequelize({...databaseConfig, database: process.env.DATABASE_NAME || 'geesome_test', logging: false, pool: {max: 1}} as any);
		await sequelize.createSchema(schema, {});
		await sequelize.query(`SET search_path TO "${schema}"`);
	});
	after(async () => {
		await sequelize?.dropSchema(schema, {cascade: true});
		await sequelize?.close();
	});
	it('upgrades released jobs without loss and refuses rollback after destination jobs exist', async () => {
		await migration.up(sequelize.getQueryInterface());
		await sequelize.query('CREATE TABLE "publicationJobs" (id SERIAL PRIMARY KEY, status VARCHAR(20) NOT NULL)');
		await sequelize.query(`INSERT INTO "publicationJobs" (status) VALUES ('queued'), ('processing')`);
		await migration.up(sequelize.getQueryInterface());
		await migration.up(sequelize.getQueryInterface());
		const rows = await sequelize.query('SELECT * FROM "publicationJobs" ORDER BY id', {type: QueryTypes.SELECT});
		assert.equal(rows.length, 2);
		assert.equal(rows[0].destinationId, null);
		assert.equal(rows[1].status, 'processing');
		await sequelize.query(`UPDATE "publicationJobs" SET "destinationId"=1, "clientId"='key:1', "executionMode"='client' WHERE id=1`);
		await assert.rejects(migration.down(sequelize.getQueryInterface()), /publication_destination_jobs_prevent_rollback/);
		await sequelize.query('UPDATE "publicationJobs" SET "destinationId"=NULL');
		await migration.down(sequelize.getQueryInterface());
		assert.equal((await sequelize.query('SELECT * FROM "publicationJobs"', {type: QueryTypes.SELECT})).length, 2);
	});
});
