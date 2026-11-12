import assert from 'node:assert/strict';
import {createServerProviders, ServerPublicationError} from '../app/modules/socNetPublishing/providers/index.js';
import {normalizeRequest} from '../app/modules/socNetPublishing/index.js';
import {validatePreparedPublication} from '../app/modules/socNetPublishing/imagePreparation.js';

const userid = '12345678-1234-1234-1234-123456789abc';
const deviationid = 'abcdef12-1234-1234-1234-123456789abc';
const credentials = {accessToken: 'access-secret', clientId: '1234', clientSecret: 'client-secret', refreshToken: 'refresh-secret'};
const target = {title: 'A new picture', tags: ['digital_art'], isAiGenerated: false, noAi: true};
const payload = (extra: any = {}) => ({text: 'Description of the work', attachments: [{storageId: 'QmOwned', mimeType: 'image/jpeg'}], contentType: 'nsfw', target, ...extra});
const response = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
function fixture(override?: any) {
	const requests = [];
	const providers = createServerProviders({fetch: async (url, options: any) => {
		requests.push({url, options});
		assert.equal(new URL(url).origin, 'https://www.deviantart.com');
		assert.equal(new URL(url).search, '');
		assert.equal(options.redirect, 'error');
		const replaced = await override?.(url, options, requests);
		if (replaced) {
			return replaced;
		}
		if (url.endsWith('user/whoami')) {
			return response({userid, username: 'Fixture-Artist'});
		}
		if (url.endsWith('/oauth2/token')) {
			return response({access_token: 'new-access-secret', refresh_token: 'new-refresh-secret', token_type: 'Bearer'});
		}
		if (url.endsWith('stash/submit')) {
			return response({status: 'success', itemid: 1234567});
		}
		if (url.endsWith('stash/publish')) {
			return response({status: 'success', deviationid, url: 'https://www.deviantart.com/fixture-artist/art/A-new-picture-1234567'});
		}
		throw Error('unexpected endpoint');
	}, loadMedia: async () => ({bytes: Buffer.from([255, 216, 255, 1]), mimeType: 'image/jpeg'})});
	return {providers, requests, account: {accountIdentity: `deviantart:${userid}`, credentials}};
}

describe('DeviantArt publication provider', () => {
	it('verifies UUID identity without uploading or publishing and keeps credentials internal', async () => {
		const f = fixture();
		const result = await f.providers.verify('deviantart', credentials, {});
		assert.equal(result.accountIdentity, `deviantart:${userid}`);
		assert.equal(result.username, 'Fixture-Artist');
		assert.equal(f.requests.length, 1);
		assert.equal(f.requests[0].options.headers.Authorization, 'Bearer access-secret');
	});
	it('uploads owned bytes then publishes with explicit AI, tags, noAI and strict mature settings', async () => {
		const f = fixture();
		const result = await f.providers.publish('deviantart', f.account, payload());
		assert.equal(result.remoteId, deviationid);
		const upload = f.requests.find(item => item.url.endsWith('stash/submit')).options.body;
		assert.equal(upload.get('title'), target.title);
		assert.equal(upload.get('artist_comments'), payload().text);
		assert.equal(upload.get('is_ai_generated'), 'false');
		assert.equal(upload.get('noai'), 'true');
		assert.deepEqual(upload.getAll('tags[]'), target.tags);
		assert.deepEqual(Buffer.from(await upload.get('file').arrayBuffer()), Buffer.from([255, 216, 255, 1]));
		const publish = f.requests.find(item => item.url.endsWith('stash/publish')).options.body;
		assert.equal(publish.get('itemid'), '1234567');
		assert.equal(publish.get('is_mature'), 'true');
		assert.equal(publish.get('mature_level'), 'strict');
		assert.equal(publish.get('allow_free_download'), 'false');
	});
	it('sets SFW explicitly and preserves affirmative AI disclosure', async () => {
		const f = fixture();
		await f.providers.publish('deviantart', f.account, payload({contentType: 'sfw', target: {...target, isAiGenerated: true, noAi: false}}));
		const body = f.requests.at(-1).options.body;
		assert.equal(body.get('is_mature'), 'false');
		assert.equal(body.has('mature_level'), false);
		assert.equal(body.get('is_ai_generated'), 'true');
		assert.equal(body.get('noai'), 'false');
	});
	it('rejects a changed account before upload', async () => {
		const f = fixture();
		await assert.rejects(f.providers.publish('deviantart', {...f.account, accountIdentity: 'wrong'}, payload()), /account changed/);
		assert.equal(f.requests.length, 1);
	});
	it('requires current access token on first setup and does not consume an unpersisted refresh token', async () => {
		const f = fixture(url => url.endsWith('user/whoami') ? response({error: 'expired'}, 401) : undefined);
		await assert.rejects(f.providers.verify('deviantart', credentials), /first connection requires/);
		assert.equal(f.requests.length, 1);
	});
	it('refreshes a stored account once on 401, commits rotation before publishing and verifies identity again', async () => {
		let persisted = false;
		const f = fixture((url, options) => {
			if (url.endsWith('user/whoami') && options.headers.Authorization === 'Bearer access-secret') {
				return response({error: 'expired'}, 401);
			}
			if (url.endsWith('stash/submit')) {
				assert(persisted);
				assert.equal(options.headers.Authorization, 'Bearer new-access-secret');
			}
		});
		await f.providers.publish('deviantart', {...f.account, refreshCredentials: async renew => {
			const updated = await renew(credentials);
			assert.equal(updated.refreshToken, 'new-refresh-secret');
			persisted = true;
			return updated;
		}}, payload());
		assert.equal(f.requests.filter(item => item.url.endsWith('/oauth2/token')).length, 1);
	});
	it('treats upload timeout as unpublished, and publish timeout/5xx/bad receipt/unsafe URL as unknown without retries', async () => {
		const upload = fixture(url => {if (url.endsWith('stash/submit')) {throw Error('provider-secret');}});
		await assert.rejects(upload.providers.publish('deviantart', upload.account, payload()), (error: any) => error instanceof ServerPublicationError && !error.ambiguous && !error.message.includes('secret'));
		for (const failure of [() => {throw Error('provider-secret');}, () => response({error: 'provider-secret'}, 503), () => response({status: 'success'}), () => response({deviationid, url: 'https://evil.example/art/123'})]) {
			const f = fixture(url => url.endsWith('stash/publish') ? failure() : undefined);
			await assert.rejects(f.providers.publish('deviantart', f.account, payload()), (error: any) => error.ambiguous && !error.message.includes('secret'));
			assert.equal(f.requests.filter(item => item.url.endsWith('stash/publish')).length, 1);
		}
	});
	it('keeps explicit 400 failures known and application errors with HTTP200 unpublished or unknown by stage', async () => {
		for (const [stage, status, ambiguous] of [['stash/publish', 400, false], ['stash/submit', 200, false], ['stash/publish', 200, true]] as const) {
			const f = fixture(url => url.endsWith(stage) ? response({error: 'private-provider-message'}, status) : undefined);
			await assert.rejects(f.providers.publish('deviantart', f.account, payload()), (error: any) => error.ambiguous === ambiguous && !error.message.includes('private'));
		}
	});
	it('rejects unsafe targets and missing images before network requests', async () => {
		for (const extra of [{attachments: []}, {attachments: [payload().attachments[0], payload().attachments[0]]}, {target: {...target, isAiGenerated: undefined}}, {target: {...target, tags: ['bad tag']}}, {target: {...target, title: 'x'.repeat(51)}}]) {
			const f = fixture();
			await assert.rejects(async () => f.providers.publish('deviantart', f.account, payload(extra)));
			assert.equal(f.requests.length, 0);
		}
	});
	it('normalizes frozen target defaults and applies prepared image/text limits', () => {
		const normalized = normalizeRequest({contentType: 'sfw', network: 'deviantart', requestKey: 'test', postId: 1, localAccountId: 'validation', scheduledAt: '2026-11-12T00:00:00Z', target: {title: '  Art  ', isAiGenerated: true}});
		assert.deepEqual(normalized.target, {title: 'Art', tags: [], isAiGenerated: true, noAi: true});
		assert.throws(() => validatePreparedPublication({text: '', imageStorageIds: [], destinations: [{network: 'deviantart', target}]}), {code: 'local_publication_image_count_invalid'});
		assert.throws(() => validatePreparedPublication({text: 'x'.repeat(50001), imageStorageIds: ['QmOwned'], destinations: [{network: 'deviantart', target}]}), {code: 'local_publication_text_too_long'});
	});
});
