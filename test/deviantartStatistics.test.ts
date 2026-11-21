import assert from 'node:assert/strict';
import {createStatisticsReader} from '../app/modules/socNetAccount/statistics.js';

const userid = '12345678-1234-1234-1234-123456789abc';
const remoteId = 'abcdef12-1234-1234-1234-123456789abc';
const credentials = {accessToken: 'access-secret', clientId: '1234', clientSecret: 'client-secret', refreshToken: 'refresh-secret'};
const json = (body, status = 200) => new Response(JSON.stringify(body), {status});
function fixture(override?: any) {
	const requests = [];
	const reader = createStatisticsReader(async (url, options) => {
		requests.push({url, options});
		assert.equal(new URL(url).origin, 'https://www.deviantart.com');
		assert.equal(options.redirect, 'error');
		assert(!url.includes('secret'));
		const replaced = await override?.(url, options);
		if (replaced) {
			return replaced;
		}
		if (url.endsWith('/user/whoami')) {
			return json({userid, username: 'Artist'});
		}
		if (url.includes('expand=user.stats')) {
			return json({userid, stats: {watchers: 0}});
		}
		return json({metadata: [{deviationid: remoteId.toUpperCase(), author: {userid}, stats: {views: 42, favourites: 0, comments: 2}}]});
	});
	const input = {network: 'deviantart', kind: 'post', account: {accountIdentity: `deviantart:${userid}`, credentials, refreshCredentials: undefined}, remoteId, target: {}};
	return {reader, requests, input};
}
describe('DeviantArt statistics', () => {
	it('refreshes once when metadata rejects a token after successful identity verification, persists before retry', async () => {
		for (const responseKind of ['http', 'json', 'always-expired']) {
			let metadataReads = 0, refreshes = 0, persisted = false;
			const f = fixture((url, options) => {
				if (url.endsWith('/oauth2/token')) {
					refreshes++;
					return json({token_type: 'bearer', access_token: 'rotated-access', refresh_token: 'rotated-refresh'});
				}
				if (url.includes('/metadata?')) {
					metadataReads++;
					if (metadataReads === 1 || responseKind === 'always-expired') {
						return json({error: 'invalid_token'}, responseKind === 'http' ? 401 : 400);
					}
					assert(persisted);
					assert.equal(options.headers.Authorization, 'Bearer rotated-access');
				}
			});
			f.input.account.refreshCredentials = async renew => {
				const updated = await renew(credentials);
				persisted = true;
				assert.equal(updated.refreshToken, 'rotated-refresh');
				return updated;
			};
			if (responseKind === 'always-expired') {
				await assert.rejects(f.reader(f.input), (error: any) => error.statisticsStatus === 'authorization_required');
			} else {
				assert.deepEqual(await f.reader(f.input), {likes: 0, views: 42, replies: 2});
			}
			assert.equal(metadataReads, 2);
			assert.equal(refreshes, 1);
		}
	});

	it('distinguishes revoked refresh from a temporary token endpoint failure after metadata expiry', async () => {
		for (const [http, status] of [[400, 'authorization_required'], [503, 'unavailable'], [429, 'rate_limited']]) {
			const f = fixture(url => url.includes('/metadata?') ? json({error: 'invalid_token'}, 400) : url.endsWith('/oauth2/token') ? json({error: 'invalid_grant'}, http as number) : undefined);
			f.input.account.refreshCredentials = renew => renew(credentials);
			await assert.rejects(f.reader(f.input), (error: any) => error.statisticsStatus === status);
		}
	});
	it('does not refresh or request consent for generic OAuth or transient errors', async () => {
		for (const [body, http, status] of [[{error: 'oauth_error'}, 400, 'access_denied'], [{error: 'private'}, 503, 'unavailable']]) {
			const f = fixture(url => url.includes('/metadata?') ? json(body, http as number) : undefined);
			f.input.account.refreshCredentials = async () => { throw new Error('Must not refresh'); };
			await assert.rejects(f.reader(f.input), (error: any) => error.statisticsStatus === status);
		}
	});

	it('reads watchers, favourites, views and comments, preserving real zeros', async () => {
		const f = fixture();
		assert.deepEqual(await f.reader({...f.input, kind: 'group'}), {followers: 0});
		assert.deepEqual(await f.reader(f.input), {likes: 0, views: 42, replies: 2});
		const request = f.requests.at(-1);
		assert.equal(new URL(request.url).searchParams.get('deviationids[]'), remoteId);
		assert.equal(new URL(request.url).searchParams.get('ext_stats'), 'true');
		assert.equal(new URL(request.url).searchParams.get('mature_content'), 'true');
		assert.equal(request.options.headers.Authorization, 'Bearer access-secret');
	});
	it('keeps absent metrics null and rejects negative metrics without leaking provider data', async () => {
		const f = fixture(url => url.includes('/metadata?') ? json({metadata: [{deviationid: remoteId, author: {userid}}]}) : undefined);
		assert.deepEqual(await f.reader(f.input), {likes: null, views: null, replies: null});
		const invalid = fixture(url => url.includes('/metadata?') ? json({metadata: [{deviationid: remoteId, author: {userid}, stats: {views: -1}}]}) : undefined);
		await assert.rejects(invalid.reader(invalid.input), (error: any) => error.statisticsStatus === 'unavailable' && !error.message.includes('secret'));
	});
	it('requires matching account and deviation author, and rejects arbitrary receipt URLs before fetching', async () => {
		const f = fixture();
		await assert.rejects(f.reader({...f.input, remoteId: 'https://evil.example/'}));
		assert.equal(f.requests.length, 0);
		const changed = fixture(url => url.includes('/metadata?') ? json({metadata: [{deviationid: remoteId, author: {userid: remoteId}, stats: {views: 2}}]}) : undefined);
		await assert.rejects(changed.reader(changed.input));
		await assert.rejects(f.reader({...f.input, account: {...f.input.account, accountIdentity: `deviantart:${remoteId}`}}));
	});
	it('returns access_denied for denied access, rate_limited for throttling and unavailable for missing works', async () => {
		for (const [http, status] of [[403, 'access_denied'], [429, 'rate_limited'], [404, 'unavailable'], [400, 'unavailable']]) {
			const f = fixture(url => url.includes('/metadata?') ? json({error: 'private-secret'}, http as number) : undefined);
			await assert.rejects(f.reader(f.input), (error: any) => error.statisticsStatus === status && !error.message.includes('private'));
		}
	});
	it('recognizes OAuth scope errors returned as HTTP 400 JSON', async () => {
		const f = fixture(url => url.includes('/metadata?') ? json({error: 'insufficient_scope', error_description: 'private-secret'}, 400) : undefined);
		await assert.rejects(f.reader(f.input), (error: any) => error.statisticsStatus === 'consent_required' && !error.message.includes('private'));
	});
	it('uses managed token rotation before statistics and asks reconnect when refresh is revoked', async () => {
		const f = fixture((url, options) => {
			if (url.endsWith('/user/whoami') && options.headers.Authorization === 'Bearer access-secret') {
				return json({error: 'expired'}, 401);
			}
		});
		let persisted = false;
		f.input.account.refreshCredentials = async renew => {
			// The account lock may reveal already rotated credentials from another caller.
			const current = {...credentials, accessToken: 'new-access', refreshToken: 'new-refresh'};
			const updated = await renew(current);
			persisted = true;
			return updated;
		};
		assert.deepEqual(await f.reader(f.input), {likes: 0, views: 42, replies: 2});
		assert(persisted);
		assert.equal(f.requests.at(-1).options.headers.Authorization, 'Bearer new-access');
		const revoked = fixture(url => url.endsWith('/user/whoami') ? json({}, 401) : url.endsWith('/oauth2/token') ? json({error: 'invalid_grant'}, 400) : undefined);
		revoked.input.account.refreshCredentials = renew => renew(credentials);
		await assert.rejects(revoked.reader(revoked.input), (error: any) => error.statisticsStatus === 'authorization_required');
	});
});
