import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Sequelize, QueryTypes} from 'sequelize';
import config from '../app/modules/database/config.js';
const migration = createRequire(import.meta.url)('../app/modules/database/migrations/20261110001000-server-social-publishing.cjs');

describe('server publication released-schema upgrade', function () {
	this.timeout(30000);
	let sequelize;
	const schema = `server_upgrade_${randomUUID().replaceAll('-', '')}`;
	before(async () => {
		sequelize = new Sequelize({...config, database: process.env.DATABASE_NAME || 'geesome_test', logging: false, pool: {max: 1}} as any);
		await sequelize.createSchema(schema, {});
		await sequelize.query(`SET search_path TO "${schema}"`);
	});
	after(async () => {await sequelize?.dropSchema(schema, {cascade: true});await sequelize?.close();});
	it('accepts fresh databases, upgrades legacy data and blocks rollback with server data', async () => {
		await migration.up(sequelize.getQueryInterface());
		await sequelize.query('CREATE TABLE "publicationJobs" (id SERIAL PRIMARY KEY, "localAccountId" VARCHAR(200) NOT NULL, "executionMode" VARCHAR(20), status VARCHAR(20))');
		await sequelize.query('CREATE TABLE "publicationDestinations" (id SERIAL PRIMARY KEY, "userId" INTEGER, "clientId" VARCHAR(200) NOT NULL, "localAccountId" VARCHAR(200) NOT NULL, "executionMode" VARCHAR(20), "localKey" VARCHAR(200))');
		await sequelize.query('CREATE TABLE "socNetAccounts" (id SERIAL PRIMARY KEY)');
		await sequelize.query(`INSERT INTO "publicationJobs" ("localAccountId", status) VALUES ('legacy', 'queued'), ('legacy', 'processing')`);
		await migration.up(sequelize.getQueryInterface());await migration.up(sequelize.getQueryInterface());
		const rows = await sequelize.query('SELECT * FROM "publicationJobs" ORDER BY id', {type: QueryTypes.SELECT});assert.equal(rows.length, 2);assert.equal(rows[1].status, 'processing');assert.equal(rows[0].serverAccountId, null);
		await sequelize.query(`INSERT INTO "publicationJobs" ("localAccountId", "executionMode", status) VALUES (NULL, 'server', 'queued')`);
		await assert.rejects(migration.down(sequelize.getQueryInterface()), /server_publication_data_prevents_rollback/);
		await sequelize.query(`DELETE FROM "publicationJobs" WHERE "executionMode"='server'`);
		await sequelize.query(`INSERT INTO "socNetAccounts" ("serverCredentialsEncrypted") VALUES ('encrypted')`);
		await assert.rejects(migration.down(sequelize.getQueryInterface()), /server_publication_data_prevents_rollback/);
		await sequelize.query('DELETE FROM "socNetAccounts"');await migration.down(sequelize.getQueryInterface());
		assert.equal((await sequelize.query('SELECT * FROM "publicationJobs"', {type: QueryTypes.SELECT})).length, 2);
	});
});
