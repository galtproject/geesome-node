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
			const connected = await provider.verify(account.credentials, {}, account.refreshCredentials);
			verifying = false;
			check(connected.accountIdentity === account.accountIdentity, 'DeviantArt account changed');
			const query = kind === 'group' ? 'user/whoami?expand=user.stats' : `deviation/metadata?${new URLSearchParams({'deviationids[]': remoteId, ext_stats: 'true', mature_content: 'true'})}`;
			const body = await readJson(transport, `https://www.deviantart.com/api/v1/oauth2/${query}`, {headers: {
				Authorization: `Bearer ${secret(connected.credentials.accessToken)}`, 'dA-minor-version': '20240701',
				'User-Agent': 'GeeSome-Node', 'Accept-Encoding': 'gzip'
			}});
			if (['insufficient_scope', 'invalid_token', 'oauth_error'].includes(body?.error) || body?.error && /\b(scope|permission)\b/i.test(String(body.error_description || ''))) {
				throw Object.assign(new Error('DeviantArt consent required'), {statisticsStatus: 'reconnect_required'});
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
			const status = error.statisticsStatus || ([401, 403].includes(error.httpStatus) || /token refresh failed/.test(error.message) || verifying && error.httpStatus === 400
				? 'reconnect_required' : error.httpStatus === 429 ? 'rate_limited' : 'unavailable');
			throw Object.assign(new Error('social_statistics_read_failed'), {statisticsStatus: status});
		}
	};
}
