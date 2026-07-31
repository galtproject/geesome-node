import assert from 'node:assert';
import {createHash} from 'node:crypto';
import {IGeesomeApp} from '../app/interface.js';
import {getApiKeyScopes} from '../app/modules/api/integrationScopes.js';
import {getAssetRequestHash} from '../app/modules/asset/index.js';

describe('agent-friendly asset integration', function () {
	this.timeout(60_000);

	let app: IGeesomeApp;
	let user;
	let apiKey;
	let apiToken: string;
	const proxyOrigin = process.env.AGENT_API_PROXY_ORIGIN;
	const advertisedOrigin = proxyOrigin || 'https://geesome.example';
	const apiPort = Number(process.env.PORT || 7796);

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		app = await (await import('../app/index.js')).default({
			storageConfig: appConfig.storageConfig,
			port: apiPort,
			apiConfig: {publicUrl: advertisedOrigin, publicBasePath: '/api/v1'}
		});
		await app.flushDatabase();
		const setup = await app.setup({email: 'asset-admin@example.com', name: 'asset-admin', password: 'admin'});
		user = setup.user;
		apiToken = await app.generateUserApiKey(user.id, {
			title: 'asset publisher',
			scopes: ['assets:write', 'assets:read-private', 'operations:read', 'asset-batches:write']
		});
		apiKey = (await app.getUserByApiToken(apiToken)).apiKey;
	});

	it('serves the upload and immutable-read contract over HTTP', async () => {
		const bytes = Buffer.from('agent-friendly-http-asset');
		const expectedSha256 = sha256(bytes);
		const contentCountBefore = await (app.ms.database as any).models.Content.count();
		const mismatchForm = new FormData();
		mismatchForm.append('file', new Blob([bytes], {type: 'text/plain'}), 'http-asset.txt');
		mismatchForm.append('expectedSha256', '0'.repeat(64));
		const apiBaseUrl = proxyOrigin ? `${proxyOrigin}/api/v1` : `http://127.0.0.1:${apiPort}/v1`;
		const mismatchResponse = await fetch(`${apiBaseUrl}/assets`, {
			method: 'POST',
			headers: {Authorization: `Bearer ${apiToken}`, 'Idempotency-Key': 'release:http-mismatch'},
			body: mismatchForm
		});
		assert.equal(mismatchResponse.status, 422);
		assert.match(mismatchResponse.headers.get('content-type') || '', /application\/problem\+json/);
		assert.equal((await mismatchResponse.json() as any).code, 'asset_digest_mismatch');
		assert.equal(await (app.ms.database as any).models.Content.count(), contentCountBefore);

		const form = new FormData();
		form.append('file', new Blob([bytes], {type: 'text/plain'}), 'http-asset.txt');
		form.append('expectedSha256', expectedSha256);
		form.append('logicalPath', 'release/http-asset.txt');

		const createResponse = await fetch(`${apiBaseUrl}/assets`, {
			method: 'POST',
			headers: {Authorization: `Bearer ${apiToken}`, 'Idempotency-Key': 'release:http-asset'},
			body: form
		});
		assert.equal(createResponse.status, 201);
		assert(createResponse.headers.get('x-request-id'));
		const asset: any = await createResponse.json();
		assert.equal(asset.sha256, expectedSha256);
		assert.equal(asset.bytes, bytes.length);

		const replayForm = new FormData();
		replayForm.append('file', new Blob([bytes], {type: 'text/plain'}), 'http-asset.txt');
		replayForm.append('expectedSha256', expectedSha256);
		replayForm.append('logicalPath', 'release/http-asset.txt');
		const replayResponse = await fetch(`${apiBaseUrl}/assets`, {
			method: 'POST',
			headers: {Authorization: `Bearer ${apiToken}`, 'Idempotency-Key': 'release:http-asset'},
			body: replayForm
		});
		assert.equal(replayResponse.status, 200);
		assert.equal((await replayResponse.json() as any).storageId, asset.storageId);

		const contentUrl = proxyOrigin ? asset.urls.content : `http://127.0.0.1:${apiPort}/ipfs/${asset.storageId}`;
		const contentResponse = await fetch(contentUrl, {method: 'HEAD'});
		assert.equal(contentResponse.status, 200);
		assert.equal(contentResponse.headers.get('content-digest'), `sha-256=:${Buffer.from(expectedSha256, 'hex').toString('base64')}:`);
		assert.equal(contentResponse.headers.get('etag'), `\"${asset.storageId}\"`);
		assert.match(contentResponse.headers.get('cache-control') || '', /immutable/);
	});

	it('resolves every bootstrap URL through the production-shaped proxy', async function () {
		if (!proxyOrigin) {
			this.skip();
		}
		const discoveryResponse = await fetch(`${proxyOrigin}/.well-known/geesome`);
		assert.equal(discoveryResponse.status, 200);
		const discovery: any = await discoveryResponse.json();
		assert.equal(discovery.apiBaseUrl, `${proxyOrigin}/api/v1`);
		for (const url of [discovery.openapiUrl, discovery.healthUrl]) {
			const response = await fetch(url);
			assert.equal(response.status, 200, url);
		}
		const openapi = await getJson(discovery.openapiUrl);
		assert.equal(openapi.servers[0].url, discovery.apiBaseUrl);
	});

	it('returns and resolves a stable async operation resource', async () => {
		const bytes = Buffer.from('agent-friendly-async-asset');
		const expectedSha256 = sha256(bytes);
		const form = new FormData();
		form.append('file', new Blob([bytes], {type: 'text/plain'}), 'async-asset.txt');
		form.append('expectedSha256', expectedSha256);
		form.append('async', 'true');
		const apiBaseUrl = proxyOrigin ? `${proxyOrigin}/api/v1` : `http://127.0.0.1:${apiPort}/v1`;
		const response = await fetch(`${apiBaseUrl}/assets`, {
			method: 'POST',
			headers: {Authorization: `Bearer ${apiToken}`, 'Idempotency-Key': 'release:http-async'},
			body: form
		});
		assert.equal(response.status, 202);
		assert.equal(response.headers.get('retry-after'), '2');
		const accepted: any = await response.json();
		assert.match(accepted.operationId, /^op_\d+$/);
		const operationNumber = accepted.operationId.slice(3);
		let operation: any;
		for (let attempt = 0; attempt < 50; attempt += 1) {
			const poll = await fetch(`${apiBaseUrl}/operations/${operationNumber}`, {headers: {Authorization: `Bearer ${apiToken}`}});
			assert.equal(poll.status, 200);
			operation = await poll.json();
			if (['succeeded', 'failed', 'cancelled'].includes(operation.status)) {
				break;
			}
			await new Promise(resolve => setTimeout(resolve, 100));
		}
		assert.equal(operation.status, 'succeeded');
		assert.equal(operation.result.sha256, expectedSha256);
	});

	afterEach(async () => {
		await app.stop();
	});

	it('stores, replays, verifies, batches, and completes immutable assets', async () => {
		const firstBytes = Buffer.from('agent-friendly-asset-one');
		const firstSha = sha256(firstBytes);
		const firstHash = getAssetRequestHash({
			sha256: firstSha,
			bytes: firstBytes.length,
			mimeType: 'text/plain',
			logicalPath: 'release/one.txt',
			previewPolicy: 'none',
			batchId: null,
			logicalId: null
		});
		const firstRequest = await app.ms.asset.prepareAssetRequest(user.id, 'release:first', firstHash);
		const first = await app.ms.asset.createAssetFromUpload(user.id, firstBytes, 'one.txt', {
			userApiKeyId: apiKey.id,
			idempotencyRequestId: firstRequest.request.id,
			sha256: firstSha,
			bytes: firstBytes.length,
			mimeType: 'text/plain',
			logicalPath: 'release/one.txt',
			previewPolicy: 'none'
		});

		assert.equal(first.sha256, firstSha);
		assert.equal(first.bytes, firstBytes.length);
		assert.equal(first.created, true);
		assert.equal(first.urls.content, `${advertisedOrigin}/ipfs/${first.storageId}`);
		const storageObject = await app.ms.database.getStorageObjectByStorageId(first.storageId);
		assert.equal(storageObject.sha256, firstSha);

		const replay = await app.ms.asset.prepareAssetRequest(user.id, 'release:first', firstHash);
		assert.equal(replay.created, false);
		assert.equal(replay.asset.storageId, first.storageId);
		await assert.rejects(
			app.ms.asset.prepareAssetRequest(user.id, 'release:first', `${firstHash.slice(0, -1)}${firstHash.endsWith('0') ? '1' : '0'}`),
			(error: any) => error.code === 'idempotency_key_conflict'
		);
		await assert.rejects(
			app.ms.asset.getAsset(user.id + 999, first.storageId),
			(error: any) => error.code === 'asset_not_found'
		);

		const secondBytes = Buffer.from('agent-friendly-asset-two');
		const secondSha = sha256(secondBytes);
		const secondHash = getAssetRequestHash({
			sha256: secondSha,
			bytes: secondBytes.length,
			mimeType: 'text/plain',
			logicalPath: 'release/two.txt',
			previewPolicy: 'none',
			batchId: null,
			logicalId: null
		});
		const secondRequest = await app.ms.asset.prepareAssetRequest(user.id, 'release:second', secondHash);
		const second = await app.ms.asset.createAssetFromUpload(user.id, secondBytes, 'two.txt', {
			userApiKeyId: apiKey.id,
			idempotencyRequestId: secondRequest.request.id,
			sha256: secondSha,
			bytes: secondBytes.length,
			mimeType: 'text/plain',
			logicalPath: 'release/two.txt',
			previewPolicy: 'none'
		});

		const batch = await app.ms.asset.createBatch(user.id, {items: [
			{logicalId: 'one', logicalPath: 'release/one.txt', sha256: firstSha, bytes: firstBytes.length, mimeType: 'text/plain'},
			{logicalId: 'two', logicalPath: 'release/two.txt', sha256: secondSha, bytes: secondBytes.length, mimeType: 'text/plain'}
		]}, 'release:batch');
		assert.equal(batch.items.filter(item => item.requiredUpload).length, 0);
		assert.deepEqual(batch.items.map(item => item.asset.storageId).sort(), [first.storageId, second.storageId].sort());

		const completed = await app.ms.asset.completeBatch(user.id, batch.batchId, apiKey.id);
		assert.equal(completed.status, 'completed');
		assert.match(completed.manifest.sha256, /^[a-f0-9]{64}$/);
		assert.equal(completed.manifest.url, `${advertisedOrigin}/ipfs/${completed.manifest.storageId}`);
		const completionReplay = await app.ms.asset.completeBatch(user.id, batch.batchId, apiKey.id);
		assert.equal(completionReplay.manifest.sha256, completed.manifest.sha256);

		const fiftyItems = Array.from({length: 50}, (_, index) => ({
			logicalId: `item-${String(index).padStart(2, '0')}`,
			logicalPath: `release/item-${index}.txt`,
			sha256: index % 2 ? firstSha : secondSha,
			bytes: index % 2 ? firstBytes.length : secondBytes.length,
			mimeType: 'text/plain'
		}));
		const resumedBatch = await app.ms.asset.createBatch(user.id, {items: fiftyItems}, 'release:fifty');
		assert.equal(resumedBatch.items.length, 50);
		assert.equal(resumedBatch.items.filter(item => item.requiredUpload).length, 0);
		const resumedComplete = await app.ms.asset.completeBatch(user.id, resumedBatch.batchId, apiKey.id);
		assert.equal(resumedComplete.status, 'completed');
		const [assetCountRows]: any = await (app.ms.database as any).sequelize.query('SELECT COUNT(*)::int AS count FROM assets');
		assert.equal(assetCountRows[0].count, 2);
		assert(getApiKeyScopes(apiKey).includes('assets:write'));
		assert(apiKey.lastUsedAt);
	});
});

function sha256(value: Buffer): string {
	return createHash('sha256').update(value).digest('hex');
}

async function getJson(url: string) {
	const response = await fetch(url);
	assert.equal(response.status, 200);
	return response.json();
}
