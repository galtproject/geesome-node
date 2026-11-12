import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import helpers from '../app/helpers.js';
import createModels from '../app/modules/socNetPublishing/models.js';
import createAccounts from '../app/modules/socNetAccount/models.js';
import {getModule} from '../app/modules/socNetPublishing/index.js';
import {createServerProviders} from '../app/modules/socNetPublishing/providers/index.js';
import {GroupType, PostStatus} from '../app/modules/group/interface.js';

const userid = '12345678-1234-1234-1234-123456789abc';
const identity = `deviantart:${userid}`;
const initialCredentials = {accessToken: 'access-secret', clientId: '1234', clientSecret: 'client-secret', refreshToken: 'refresh-secret'};
const image = Buffer.from([255, 216, 255, 1]);
const target = {title: 'Art', tags: [], isAiGenerated: true, noAi: true};

describe('DeviantArt encrypted server destination lifecycle', function () {
	this.timeout(30000);
	let sequelize, models, app, module, fetchImpl, accessToken, refreshToken, rotations, publishes, rejectIdentity, acceptOldToken;
	const schema = `deviantart_${randomUUID().replaceAll('-', '')}`;
	const setup = (extra: any = {}) => ({network: 'deviantart', requestKey: 'da-main', label: 'DeviantArt', contentPolicy: 'nsfw', enabled: true, sourceGroupId: 2, account: initialCredentials, target: {}, ...extra});
	before(async () => {
		sequelize = new Sequelize({...config, database: process.env.DATABASE_NAME || 'geesome_test', logging: false, pool: {max: 4}, define: {schema}} as any);
		await sequelize.createSchema(schema, {});
		models = await createModels(sequelize);
		await createAccounts(sequelize);
	});
	after(async () => {await sequelize?.dropSchema(schema, {cascade: true});await sequelize?.close();});
	beforeEach(async () => {
		await models.PublicationJob.destroy({where: {}});
		await models.PublicationDestination.destroy({where: {}});
		await sequelize.models.socNetAccount.destroy({where: {}});
		accessToken = initialCredentials.accessToken;refreshToken = initialCredentials.refreshToken;rotations = 0;publishes = 0;rejectIdentity = false;acceptOldToken = false;
		const group = {id: 2, creatorId: 1, type: GroupType.Channel, isPublic: false, isOpen: false};
		const json = (value, status = 200) => new Response(JSON.stringify(value), {status});
		fetchImpl = async (url, options) => {
			if (url.endsWith('user/whoami')) {
				if (options.headers.Authorization !== `Bearer ${accessToken}` && !(acceptOldToken && options.headers.Authorization === 'Bearer access-secret')) {
					return json({error: 'expired'}, 401);
				}
				if (rejectIdentity) {
					return json({error: 'private'}, 503);
				}
				return json({userid, username: 'Fixture-Artist'});
			}
			if (url.endsWith('/oauth2/token')) {
				assert.equal(options.body.get('refresh_token'), refreshToken);
				rotations++;
				accessToken = `new-access-${rotations}`;refreshToken = `new-refresh-${rotations}`;
				return json({access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer'});
			}
			if (url.endsWith('stash/submit')) {
				return json({status: 'success', itemid: 123});
			}
			if (url.endsWith('stash/publish')) {
				publishes++;
				return json({status: 'success', deviationid: 'abcdef12-1234-1234-1234-123456789abc', url: 'https://www.deviantart.com/fixture-artist/art/Art-123'});
			}
			throw Error('unexpected request');
		};
		app = {ms: {database: {sequelize, models: {}, getContentByStorageAndUserId: async () => ({userId: 1, mimeType: 'image/jpeg', size: image.length, storageId: 'QmOwned'})}, storage: {getFileStream: async () => Readable.from([image])}, group: {
			getGroup: async () => group, getPost: async () => ({id: 1, groupId: 2, userId: 1, status: PostStatus.Published, group}), canEditPostInGroup: async () => true
		}}, encryptTextWithAppPass: text => helpers.encryptText(text, 'test-app-pass'), decryptTextWithAppPass: text => helpers.decryptText(text, 'test-app-pass')};
		module = getModule(app, models, {fetch: (...args) => fetchImpl(...args)});
	});
	async function stored() {
		const row = await sequelize.models.socNetAccount.findOne();
		return {row, decoded: JSON.parse(await app.decryptTextWithAppPass(row.serverCredentialsEncrypted))};
	}
	async function queued(destination) {
		const row = await models.PublicationDestination.findByPk(destination.id);
		return models.PublicationJob.create({userId: 1, postId: 1, requestKey: randomUUID(), requestHash: 'a'.repeat(64), destinationId: row.id,
			executionMode: 'server', serverAccountId: row.socNetAccountId, accountIdentity: identity, network: 'deviantart', contentType: 'nsfw', contentPolicy: 'nsfw', intentVersion: 6,
			target, payload: {text: 'Description', attachments: [{storageId: 'QmOwned', mimeType: 'image/jpeg'}]}, scheduledAt: new Date(0), status: 'queued'});
	}
	it('persists encrypted write-only credentials and worker publishes a frozen job with safe receipt', async () => {
		const {destination} = await module.setupServerDestination(1, setup());
		assert.equal(destination.accountIdentity, identity);assert.equal(destination.executionMode, 'server');assert.deepEqual(destination.target, {});
		assert(!JSON.stringify(destination).includes('secret'));
		const {row, decoded} = await stored();assert.deepEqual(decoded.credentials, initialCredentials);assert(!row.serverCredentialsEncrypted.includes('secret'));
		const job = await queued(destination);await module.processServerQueue();await job.reload();
		assert.equal(job.status, 'posted');assert.equal(publishes, 1);assert.equal(job.remoteUrl, 'https://www.deviantart.com/fixture-artist/art/Art-123');
	});
	it('serializes concurrent stale snapshots and commits one rotation before use', async () => {
		await module.setupServerDestination(1, setup());const {row} = await stored();
		const accounts = await Promise.all([module.loadServerAccount(1, row.id, 'deviantart', identity), module.loadServerAccount(1, row.id, 'deviantart', identity)]);
		accessToken = 'expired';
		const provider = createServerProviders({fetch: (...args) => fetchImpl(...args)});
		await Promise.all(accounts.map(account => provider.verify('deviantart', account.credentials, {}, account.refreshCredentials)));
		assert.equal(rotations, 1);assert.equal((await stored()).decoded.credentials.refreshToken, 'new-refresh-1');
		assert.equal((await module.loadServerAccount(1, row.id, 'deviantart', identity)).credentials.accessToken, 'new-access-1');
	});
	it('keeps settings refresh committed even when the destination snapshot conflicts afterward', async () => {
		const {destination} = await module.setupServerDestination(1, setup());accessToken = 'expired';
		await assert.rejects(module.updateServerDestinationSettings(1, destination.id, {expected: {...destination, label: 'stale'}, enabled: false, contentPolicy: 'sfw'}), {status: 409});
		assert.equal(rotations, 1);assert.equal((await stored()).decoded.credentials.refreshToken, 'new-refresh-1');
		assert.equal((await models.PublicationDestination.findByPk(destination.id)).enabled, true);assert.equal(publishes, 0);
	});
	it('refreshes existing setup safely, rejects stale pair overwrite on another destination, and shares account', async () => {
		const first = await module.setupServerDestination(1, setup());accessToken = 'expired';
		await module.setupServerDestination(1, setup());assert.equal(rotations, 1);
		acceptOldToken = true;
		const second = await module.setupServerDestination(1, setup({requestKey: 'da-secondary'}));
		assert.notEqual(second.destination.id, first.destination.id);assert.equal(await sequelize.models.socNetAccount.count(), 1);
		assert.equal((await stored()).decoded.credentials.refreshToken, 'new-refresh-1');
	});
	it('keeps known account rotation when a post-refresh identity check fails', async () => {
		await module.setupServerDestination(1, setup());accessToken = 'expired';
		const original = fetchImpl;
		fetchImpl = async (url, options) => {
			const result = await original(url, options);
			if (url.endsWith('/oauth2/token')) {
				rejectIdentity = true;
			}
			return result;
		};
		await assert.rejects(module.setupServerDestination(1, setup()), {code: 'server_publication_verification_failed'});
		assert.equal(rotations, 1);assert.equal((await stored()).decoded.credentials.refreshToken, 'new-refresh-1');assert.equal(publishes, 0);
	});
	it('requires valid first connection and destination mode, rejects invalid compose before creating a source/job', async () => {
		accessToken = 'expired';
		await assert.rejects(module.setupServerDestination(1, setup()), {code: 'server_publication_verification_failed'});
		assert.equal(rotations, 0);assert.equal(await sequelize.models.socNetAccount.count(), 0);
		for (const imageStorageIds of [[], ['QmOne', 'QmTwo']]) {
			await assert.rejects(module.compose(1, {requestKey: randomUUID(), text: 'description', contentType: 'sfw', imageStorageIds, destinations: [{destinationId: 1, network: 'deviantart', target}]}), {code: 'local_publication_image_count_invalid'});
		}
		await assert.rejects(module.createJob(1, {requestKey: 'local', postId: 1, network: 'deviantart', localAccountId: 'client', contentType: 'sfw', scheduledAt: '2026-11-12T00:00:00Z', target}), {code: 'local_publication_destination_required'});
		assert.equal(await models.PublicationJob.count(), 0);
	});
});
