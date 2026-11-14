import {createHash, randomBytes} from 'node:crypto';
import {Op} from 'sequelize';
import {ApiProblemError} from '../api/problem.js';
import {getPublicApiContext} from '../api/publicUrls.js';
import {createTransport, readJson, secret} from './providers/common.js';
import {normalizeContentPolicy} from './contentPolicy.js';
import {isOwnedQueueGroup} from './sources.js';
import {destinationView} from './destinations.js';

const callbackPath = '/v1/user/social-publications/deviantart/oauth/callback';
const ttlMs = 10 * 60 * 1000;
const opaque = /^[a-f0-9]{64}$/;
const digest = value => createHash('sha256').update(value).digest('hex');
function problem(status, code): never {
	throw new ApiProblemError(status, code, code.replaceAll('_', ' '));
}

export function deviantArtRedirectUri(app, override = process.env.DEVIANTART_OAUTH_REDIRECT_URI) {
	let url;
	try {
		url = new URL(override || `${getPublicApiContext(app).publicUrl}${callbackPath}`);
	} catch {
		problem(409, 'deviantart_oauth_callback_unconfigured');
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== callbackPath) {
		problem(409, 'deviantart_oauth_callback_unconfigured');
	}
	return url.href;
}

export function getDeviantArtOAuthMethods(app, {PublicationOAuthFlow: Flow, PublicationDestination: Destination}, accounts, options: any = {}) {
	const transport = createTransport(options.fetch);
	const now = () => new Date();
	async function expire() {
		await Flow.update({status: 'expired', secretEncrypted: null, error: 'deviantart_oauth_expired'}, {where: {expiresAt: {[Op.lte]: now()}, status: {[Op.in]: ['pending', 'processing']}}});
		await Flow.destroy({where: {expiresAt: {[Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000)}}});
	}
	return {
		async startDeviantArtOAuth(userId, input) {
			if (!Flow || !input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['requestKey', 'label', 'sourceGroupId', 'contentPolicy', 'enabled', 'clientId', 'clientSecret'].includes(key)) ||
				typeof input.requestKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.requestKey) || typeof input.label !== 'string' || !input.label.trim() || input.label.length > 200 || /[\u0000-\u001f\u007f]/.test(input.label) ||
				typeof input.clientId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(input.clientId) || input.enabled !== undefined && typeof input.enabled !== 'boolean' ||
				input.sourceGroupId != null && (!Number.isSafeInteger(input.sourceGroupId) || input.sourceGroupId < 1)) {
				problem(400, 'deviantart_oauth_input_invalid');
			}
			try {
				secret(input.clientSecret);
			} catch {
				problem(400, 'deviantart_oauth_credentials_invalid');
			}
			const contentPolicy = normalizeContentPolicy(input.contentPolicy);
			if (input.sourceGroupId && !isOwnedQueueGroup(await app.ms.group.getGroup(input.sourceGroupId), userId)) {
				problem(403, 'local_publication_source_forbidden');
			}
			const redirectUri = deviantArtRedirectUri(app, options.redirectUri);
			await expire();
			const flowId = randomBytes(32).toString('hex');
			const state = randomBytes(32).toString('hex');
			const verifier = randomBytes(48).toString('base64url');
			const expiresAt = new Date(Date.now() + ttlMs);
			const encrypted = await app.encryptTextWithAppPass(JSON.stringify({clientId: input.clientId, clientSecret: input.clientSecret, verifier, redirectUri,
				setup: {network: 'deviantart', requestKey: input.requestKey, label: input.label.trim(), sourceGroupId: input.sourceGroupId ?? null, contentPolicy, enabled: input.enabled === true, target: {}}}));
			await Flow.sequelize.transaction(async transaction => {
				await Flow.sequelize.query('SELECT pg_advisory_xact_lock(163130, :owner)', {replacements: {owner: userId}, transaction});
				if (await Flow.count({where: {userId, status: {[Op.in]: ['pending', 'processing']}}, transaction}) >= 10) {
					problem(429, 'deviantart_oauth_too_many_pending');
				}
				await Flow.create({id: flowId, userId, stateHash: digest(state), status: 'pending', expiresAt, secretEncrypted: encrypted}, {transaction});
			});
			const authorization = new URL('https://www.deviantart.com/oauth2/authorize');
			authorization.search = new URLSearchParams({response_type: 'code', client_id: input.clientId, redirect_uri: redirectUri, scope: 'basic user browse stash publish',
				state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'}).toString();
			return {flowId, authorizationUrl: authorization.href, expiresAt: expiresAt.toISOString(), redirectUri};
		},
		async getDeviantArtOAuth(userId, flowId) {
			if (!opaque.test(flowId || '')) {
				problem(404, 'deviantart_oauth_not_found');
			}
			await expire();
			const row = await Flow.findOne({where: {id: flowId, userId}});
			if (!row) {
				problem(404, 'deviantart_oauth_not_found');
			}
			const destination = row.status === 'connected' ? await Destination.findOne({where: {id: row.destinationId, userId, network: 'deviantart', executionMode: 'server'}}) : null;
			return {flowId: row.id, status: row.status, expiresAt: row.expiresAt.toISOString(), ...(destination ? {destination: destinationView(destination)} : {}), ...(row.error ? {error: row.error} : {})};
		},
		async completeDeviantArtOAuth(input) {
			if (!input || typeof input.state !== 'string' || !opaque.test(input.state) || input.code !== undefined && (typeof input.code !== 'string' || !/^[A-Za-z0-9._~-]{1,4096}$/.test(input.code)) ||
				input.error !== undefined && typeof input.error !== 'string' || !input.code && !input.error) {
				problem(400, 'deviantart_oauth_callback_invalid');
			}
			await expire();
			const row = await Flow.findOne({where: {stateHash: digest(input.state)}});
			if (!row) {
				problem(400, 'deviantart_oauth_state_invalid');
			}
			const [claimed] = await Flow.update({status: 'processing'}, {where: {id: row.id, status: 'pending', expiresAt: {[Op.gt]: now()}}});
			if (!claimed) {
				problem(409, 'deviantart_oauth_already_used');
			}
			try {
				if (input.error) {
					throw new Error('denied');
				}
				const data = JSON.parse(await app.decryptTextWithAppPass(row.secretEncrypted));
				const body = new URLSearchParams({grant_type: 'authorization_code', client_id: data.clientId, client_secret: data.clientSecret, code: input.code,
					redirect_uri: data.redirectUri, code_verifier: data.verifier});
				const token = await readJson(transport, 'https://www.deviantart.com/oauth2/token', {method: 'POST', body});
				if (!token || token.error || token.token_type?.toLowerCase() !== 'bearer') {
					throw new Error('token_invalid');
				}
				secret(token.access_token);
				secret(token.refresh_token);
				const account = {clientId: data.clientId, clientSecret: data.clientSecret, accessToken: token.access_token, refreshToken: token.refresh_token};
				// Keep exchanged tokens encrypted during setup; a crashed processing flow requires fresh consent, never a repeated code exchange.
				await row.update({secretEncrypted: await app.encryptTextWithAppPass(JSON.stringify({setup: data.setup, account}))});
				const result = await accounts.setupServerDestination(row.userId, {...data.setup, account});
				await row.update({status: 'connected', destinationId: result.destination.id, secretEncrypted: null, error: null});
				return {status: 'connected'};
			} catch {
				await row.update({status: 'failed', secretEncrypted: null, error: input.error ? 'deviantart_oauth_denied' : 'deviantart_oauth_failed'});
				return {status: 'failed'};
			}
		}
	};
}
