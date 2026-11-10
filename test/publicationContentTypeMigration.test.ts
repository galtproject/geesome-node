import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Sequelize, QueryTypes} from 'sequelize';
import config from '../app/modules/database/config.js';
import {isContentTypeAllowed} from '../app/modules/socNetPublishing/contentPolicy.js';
const migration = createRequire(import.meta.url)('../app/modules/database/migrations/20261110003000-publication-content-type.cjs');

describe('canonical publication content type upgrade', function () {
	let sequelize;
	const schema = `content_type_${randomUUID().replaceAll('-', '')}`;
	before(async () => {
		sequelize = new Sequelize({...config, database: process.env.DATABASE_NAME || 'geesome_test', logging: false, pool: {max: 1}} as any);
		await sequelize.createSchema(schema, {});await sequelize.query(`SET search_path TO "${schema}"`);
	});
	after(async () => {await sequelize?.dropSchema(schema, {cascade: true});await sequelize?.close();});
	it('has exactly one forbidden combination, independently of networks', () => {
		assert.equal(isContentTypeAllowed('nsfw', 'sfw'), false);
		assert.equal(isContentTypeAllowed(null, 'nsfw'), false);
		assert.equal(isContentTypeAllowed('sfw', 'unknown'), false);
		for (const [type, policy] of [['sfw','sfw'], ['sfw','nsfw'], ['nsfw','nsfw']]) {
			assert.equal(isContentTypeAllowed(type, policy), true);
		}
	});
	it('guards alternate endpoints before mutation and preserves old outcome identity without resending', async () => {
		await migration.up(sequelize.getQueryInterface());
		await sequelize.query('CREATE TABLE "publicationDestinations" (id SERIAL PRIMARY KEY, "contentPolicy" VARCHAR(20), target JSONB)');
		await sequelize.query('CREATE TABLE "publicationJobs" (id SERIAL PRIMARY KEY, "contentPolicy" VARCHAR(20), network VARCHAR(20), status VARCHAR(20), target JSONB, "requestHash" TEXT, producer JSONB, "claimToken" TEXT, "remoteId" TEXT)');
		await sequelize.query(`INSERT INTO "publicationDestinations" (target) VALUES ('{"chatId":"-1","sfwChatId":"-2"}')`);
		await sequelize.query(`INSERT INTO "publicationJobs" (network,status,target,"requestHash",producer,"claimToken","remoteId") VALUES ('telegram','queued','{"chatId":"-1","sensitive":false}','hash','{"digest":"old"}',NULL,NULL),('discord','processing','{"channelId":"1","sensitive":true}','same','{"digest":"opaque"}','claim','42'),('rule34xxx','posted','{"tags":"safe","source":"https://example.com","rating":"s"}','finished','{"digest":"finished"}',NULL,'43'),('threads','needs_review','{}','unknown','{}','unknown',NULL)`);
		await assert.rejects(migration.up(sequelize.getQueryInterface()), /split_alternate_destinations/);
		const [columns]: any = await sequelize.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='publicationJobs' AND column_name='contentType'`);assert.equal(columns.length, 0);
		await sequelize.query(`UPDATE "publicationDestinations" SET target=target-'sfwChatId'`);
		await migration.up(sequelize.getQueryInterface());await migration.up(sequelize.getQueryInterface());
		const rows: any[] = await sequelize.query('SELECT * FROM "publicationJobs" ORDER BY id', {type: QueryTypes.SELECT});
		assert.deepEqual(rows.map(row => row.contentType), ['sfw','nsfw','sfw','nsfw']);
		assert.deepEqual(rows.map(row => row.status), ['queued','processing','posted','needs_review']);
		assert(rows.every(row => row.intentVersion === null && !('sensitive' in row.target) && !('rating' in row.target)));
		assert.equal(rows[1].claimToken, 'claim');assert.equal(rows[1].remoteId, '42');assert.equal(rows[1].producer.digest, 'opaque');assert.equal(rows[1].requestHash, 'same');
		const [destination]: any[] = await sequelize.query('SELECT * FROM "publicationDestinations"', {type: QueryTypes.SELECT});assert.equal(destination.contentPolicy, 'nsfw');
		await assert.rejects(migration.down(), /forward_only/);
	});
});
