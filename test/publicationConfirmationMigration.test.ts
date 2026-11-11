import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
const require = createRequire(import.meta.url);
const migration = require('../app/modules/database/migrations/20261111000000-publication-confirmed-at.cjs');

describe('publication confirmation upgrade', function () {
	this.timeout(30000);
	let sequelize;
	const schema = `confirmation_${randomUUID().replaceAll('-', '')}`;
	before(async () => {
		sequelize = new Sequelize({...databaseConfig, database: process.env.DATABASE_NAME || 'geesome_test', pool: {max: 1, min: 0}, logging: false} as any);
		await sequelize.createSchema(schema, {});
		await sequelize.query(`SET search_path TO "${schema}"`);
		await sequelize.query(`CREATE TABLE "publicationJobs" (id serial PRIMARY KEY, "userId" integer, "destinationId" integer, status text, "updatedAt" timestamptz)`);
		await sequelize.query(`INSERT INTO "publicationJobs" ("userId","destinationId",status,"updatedAt") VALUES (1,2,'posted','2026-11-10T12:00:00Z'), (1,2,'failed','2026-11-10T12:00:00Z')`);
	});
	after(async () => {
		await sequelize?.query('SET search_path TO public');
		await sequelize?.dropSchema(schema, {cascade: true});
		await sequelize?.close();
	});
	it('retains legacy terminal acknowledgement time, leaves failures unconfirmed and is replay safe', async () => {
		await migration.up(sequelize.getQueryInterface());
		const [rows] = await sequelize.query('SELECT * FROM "publicationJobs" ORDER BY id');
		assert.equal(rows[0].confirmedAt.toISOString(), '2026-11-10T12:00:00.000Z');
		assert.equal(rows[1].confirmedAt, null);
		await sequelize.query(`UPDATE "publicationJobs" SET "updatedAt"='2026-11-11T12:00:00Z' WHERE id=1`);
		await migration.up(sequelize.getQueryInterface());
		const [again] = await sequelize.query('SELECT "confirmedAt" FROM "publicationJobs" WHERE id=1');
		assert.equal(again[0].confirmedAt.toISOString(), '2026-11-10T12:00:00.000Z');
		const [indexes] = await sequelize.query(`SELECT indexdef FROM pg_indexes WHERE schemaname=:schema AND indexname='publication_jobs_owner_destination_confirmed_idx'`, {replacements: {schema}});
		assert.equal(indexes.length, 1);
		assert.match(indexes[0].indexdef, /WHERE \(status = 'posted'::text\)/);
	});
});
