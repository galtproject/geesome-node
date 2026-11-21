import {check, createTransport, readJson, secret} from '../socNetPublishing/providers/common.js';
import {createDeviantArtProvider} from '../socNetPublishing/providers/deviantart.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identity = value => typeof value === 'string' && uuid.test(value) ? `deviantart:${value.toLowerCase()}` : null;
function metric(value) {
	if (value == null) {
		return null;
	}
	check(Number.isSafeInteger(value) && value >= 0, 'Invalid DeviantArt metric');
	return value;
}

export function createDeviantArtStatisticsReader(fetchImpl = fetch) {
	const transport = createTransport(async (url, options) => {
		const response = await fetchImpl(url, options);
		// DeviantArt can report OAuth errors as HTTP 400. Read the bounded JSON
		// through the normal transport, but never expose provider descriptions.
		if (response.status === 400 && new URL(url).pathname.endsWith('/deviation/metadata')) {
			return new Response(response.body, {status: 200, headers: response.headers});
		}
		return response;
	});
	const provider = createDeviantArtProvider(transport);
	return async ({kind, account, remoteId}) => {
		check(typeof account.accountIdentity === 'string' && identity(account.accountIdentity.slice('deviantart:'.length)) === account.accountIdentity, 'Invalid DeviantArt identity');
		if (kind === 'post') {
			check(typeof remoteId === 'string' && uuid.test(remoteId), 'Invalid DeviantArt receipt');
		}
		let verifying = true;
		try {
			// Reuse publication verification and its persisted, serialized token rotation.
			let connected = await provider.verify(account.credentials, {}, account.refreshCredentials);
			verifying = false;
			check(connected.accountIdentity === account.accountIdentity, 'DeviantArt account changed');
			const query = kind === 'group' ? 'user/whoami?expand=user.stats' : `deviation/metadata?${new URLSearchParams({'deviationids[]': remoteId, ext_stats: 'true', mature_content: 'true'})}`;
			const read = async () => {
				try {
					return await readJson(transport, `https://www.deviantart.com/api/v1/oauth2/${query}`, {headers: {
						Authorization: `Bearer ${secret(connected.credentials.accessToken)}`, 'dA-minor-version': '20240701',
						'User-Agent': 'GeeSome-Node', 'Accept-Encoding': 'gzip'
					}});
				} catch (error) {
					if (error.httpStatus === 401) {
						return {error: 'invalid_token'};
					}
					throw error;
				}
			};
			const invalidToken = body => body?.error === 'invalid_token' || body?.error === 'oauth_error' && /\b(expired|invalid)\b.*\btoken\b|\btoken\b.*\b(expired|invalid)\b/i.test(String(body.error_description || ''));
			let body = await read();
			if (invalidToken(body)) {
				if (!account.refreshCredentials) {
					throw Object.assign(new Error('DeviantArt authorization expired'), {statisticsStatus: 'authorization_required'});
				}
				connected = await provider.refreshSession(connected.credentials, account.refreshCredentials, connected.credentials.accessToken);
				check(connected.accountIdentity === account.accountIdentity, 'DeviantArt account changed');
				body = await read();
			}
			if (body?.error === 'insufficient_scope' || body?.error && /\b(scope|permission)\b/i.test(String(body.error_description || ''))) {
				throw Object.assign(new Error('DeviantArt consent required'), {statisticsStatus: 'consent_required'});
			}
			if (invalidToken(body)) {
				throw Object.assign(new Error('DeviantArt authorization expired'), {statisticsStatus: 'authorization_required'});
			}
			if (body?.error === 'oauth_error') {
				throw Object.assign(new Error('DeviantArt access denied'), {statisticsStatus: 'access_denied'});
			}

			check(body && !body.error && body.status !== 'error', 'DeviantArt statistics unavailable');
			if (kind === 'group') {
				check(identity(body.userid) === account.accountIdentity, 'DeviantArt account changed');
				return {followers: metric(body.stats?.watchers)};
			}
			const post = body.metadata?.find(row => typeof row.deviationid === 'string' && row.deviationid.toLowerCase() === remoteId.toLowerCase());
			check(post && identity(post.author?.userid) === account.accountIdentity, 'DeviantArt deviation author changed');
			return {likes: metric(post.stats?.favourites), views: metric(post.stats?.views), replies: metric(post.stats?.comments)};
		} catch (error) {
			const status = error.statisticsStatus || (error.authorizationRequired || error.httpStatus === 401 || /token refresh failed/.test(error.message) || verifying && error.httpStatus === 400
				? 'authorization_required' : error.httpStatus === 403 ? 'access_denied' : error.httpStatus === 429 ? 'rate_limited' : 'unavailable');
			throw Object.assign(new Error('social_statistics_read_failed'), {statisticsStatus: status});
		}
	};
}
