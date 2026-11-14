import {check, secret, loadImages, readJson, ServerPublicationError} from './common.js';
import {normalizeDeviantArtTarget} from '../deviantartTarget.js';

const origin = 'https://www.deviantart.com';
const api = `${origin}/api/v1/oauth2`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDeviantArtProvider(transport: any) {
	const headers = accessToken => ({Authorization: `Bearer ${secret(accessToken)}`, 'dA-minor-version': '20240701', 'User-Agent': 'GeeSome-Node', 'Accept-Encoding': 'gzip'});
	async function request(path, accessToken, options: any = {}, mayPublish = false) {
		const result = await readJson(transport, `${api}/${path}`, {...options, headers: {...headers(accessToken), ...options.headers}}, mayPublish);
		check(result && !result.error && result.status !== 'error', 'DeviantArt rejected request', mayPublish);
		return result;
	}
	async function whoami(credentials) {
		const user = await request('user/whoami', credentials.accessToken);
		check(uuid.test(user?.userid || '') && typeof user.username === 'string' && /^[A-Za-z0-9-]{1,50}$/.test(user.username), 'DeviantArt account identity is invalid');
		return {accountIdentity: `deviantart:${user.userid.toLowerCase()}`, username: user.username};
	}
	async function session(credentials, refreshCredentials?, allowUnmanagedRefresh = true) {
		check(credentials && /^[1-9][0-9]{0,19}$/.test(credentials.clientId), 'DeviantArt client ID is invalid');
		for (const key of ['accessToken', 'clientSecret', 'refreshToken']) {
			secret(credentials[key]);
		}
		try {
			return {...await whoami(credentials), credentials};
		} catch (error) {
			if (error.httpStatus !== 401) {
				throw error;
			}
		}
		check(refreshCredentials || allowUnmanagedRefresh, 'DeviantArt first connection requires a current access token');
		async function renew(current) {
			// Another process may have refreshed this account while we waited for its lock.
			try {
				await whoami(current);
				return current;
			} catch (error) {
				if (error.httpStatus !== 401) {
					throw error;
				}
			}
			const body = new URLSearchParams({grant_type: 'refresh_token', client_id: current.clientId, client_secret: current.clientSecret, refresh_token: current.refreshToken});
			const refreshed = await readJson(transport, `${origin}/oauth2/token`, {method: 'POST', body});
			check(refreshed && !refreshed.error && refreshed.token_type?.toLowerCase() === 'bearer', 'DeviantArt token refresh failed');
			secret(refreshed.access_token);
			secret(refreshed.refresh_token);
			return {...current, accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token};
		}
		const refreshed = refreshCredentials ? await refreshCredentials(renew) : await renew(credentials);
		// Rotated credentials must be committed before any later identity or publish failure.
		return {...await whoami(refreshed), credentials: refreshed};
	}
	return {
		async verify(credentials: any, target: any = {}, refreshCredentials?: any) {
			check(target && Object.keys(target).length === 0, 'DeviantArt destination parameters are invalid');
			const connected = await session(credentials, refreshCredentials, false);
			return {...connected, target: {}};
		},
		async publish(account: any, payload: any, loadMedia: any) {
			const target = normalizeDeviantArtTarget(payload.target);
			check(payload.attachments.length === 1, 'DeviantArt requires exactly one image');
			const [image] = await loadImages(payload, loadMedia, 10 * 1024 * 1024);
			const connected = await session(account.credentials, account.refreshCredentials);
			check(connected.accountIdentity === account.accountIdentity, 'DeviantArt publishing account changed');
			const form = new FormData();
			form.set('file', new Blob([image.bytes], {type: image.mimeType}), image.mimeType === 'image/png' ? 'publication.png' : 'publication.jpg');
			form.set('title', target.title);
			form.set('artist_comments', payload.text);
			form.set('is_ai_generated', String(target.isAiGenerated));
			form.set('noai', String(target.noAi));
			for (const tag of target.tags) {
				form.append('tags[]', tag);
			}
			const uploaded = await request('stash/submit', connected.credentials.accessToken, {method: 'POST', body: form});
			const itemid = String(uploaded.itemid || '');
			check(uploaded.status === 'success' && (typeof uploaded.itemid === 'string' || Number.isSafeInteger(uploaded.itemid)) && /^[1-9][0-9]{0,19}$/.test(itemid), 'DeviantArt upload receipt is invalid');
			const body = new URLSearchParams({itemid, is_mature: String(payload.contentType === 'nsfw'), is_ai_generated: String(target.isAiGenerated), noai: String(target.noAi), allow_free_download: 'false'});
			if (payload.contentType === 'nsfw') {
				body.set('mature_level', 'strict');
			}
			for (const tag of target.tags) {
				body.append('tags[]', tag);
			}
			const published = await request('stash/publish', connected.credentials.accessToken, {method: 'POST', body}, true);
			check(published.status === 'success' && uuid.test(published.deviationid || ''), 'DeviantArt publication identity was not confirmed', true);
			let remoteUrl;
			try {
				remoteUrl = new URL(published.url);
			} catch {
				throw new ServerPublicationError('DeviantArt publication URL was not confirmed', true);
			}
			check(remoteUrl.origin === origin && !remoteUrl.username && !remoteUrl.password && !remoteUrl.search && !remoteUrl.hash && /^\/[A-Za-z0-9-]+\/art\/[A-Za-z0-9-]+$/.test(remoteUrl.pathname), 'DeviantArt publication URL was not confirmed', true);
			return {remoteId: published.deviationid.toLowerCase(), remoteUrl: remoteUrl.href};
		}
	};
}
