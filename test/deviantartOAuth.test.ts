import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import helpers from '../app/helpers.js';
import createModels from '../app/modules/socNetPublishing/models.js';
import createAccounts from '../app/modules/socNetAccount/models.js';
import {getModule} from '../app/modules/socNetPublishing/index.js';
import {deviantArtRedirectUri} from '../app/modules/socNetPublishing/deviantartOAuth.js';
import {isSensitiveOAuthCallback} from '../app/modules/api/sensitiveOAuthCallback.js';
import registerApi from '../app/modules/socNetPublishing/api.js';
import {GroupType} from '../app/modules/group/interface.js';

const redirectUri = 'https://example.com/v1/user/social-publications/deviantart/oauth/callback';
const input = {requestKey: 'da-oauth', label: 'Art', contentPolicy: 'sfw', clientId: '123', clientSecret: 'private-app-secret', enabled: false, sourceGroupId: 2};
const identity = '12345678-1234-1234-1234-123456789abc';

describe('DeviantArt OAuth owner-bound PKCE lifecycle', function () {
	this.timeout(30000);
	let sequelize, models, app, module, requests, mode, providerFetch;
	const schema = `da_oauth_${randomUUID().replaceAll('-', '')}`;
	before(async () => {
		sequelize = new Sequelize({...config, database: process.env.DATABASE_NAME || 'geesome_test', logging: false, pool: {max: 5}, define: {schema}} as any);
		await sequelize.createSchema(schema, {});
		models = await createModels(sequelize);
		await createAccounts(sequelize);
	});
	after(async () => {await sequelize?.dropSchema(schema, {cascade: true});await sequelize?.close();});
	beforeEach(async () => {
		await models.PublicationOAuthFlow.destroy({where: {}});
		await models.PublicationDestination.destroy({where: {}});
		await sequelize.models.socNetAccount.destroy({where: {}});
		requests = [];mode = 'success';
		app = {config: {apiConfig: {publicUrl: 'https://example.com'}}, ms: {database: {sequelize}, group: {getGroup: async () => ({id: 2, creatorId: 1, type: GroupType.Channel, isPublic: false, isOpen: false})}},
			encryptTextWithAppPass: text => helpers.encryptText(text, 'test-app-pass'), decryptTextWithAppPass: text => helpers.decryptText(text, 'test-app-pass')};
		providerFetch = async (url, options) => {
			requests.push({url, options});
			assert.equal(new URL(url).origin, 'https://www.deviantart.com');assert.equal(options.redirect, 'error');
			if (url.endsWith('/oauth2/token')) {
				if (mode === 'invalid-client') {
					return new Response(JSON.stringify({error: 'invalid_client', error_description: 'private-secret'}), {status: 400});
				}
				if (mode === 'unknown') {
					throw new Error('provider-private-secret');
				}
				return new Response(JSON.stringify(mode === 'bad-token' ? {error: '<script>private</script>'} : {access_token: mode === 'reconnected' ? 'reconnected-access' : 'private-access', refresh_token: mode === 'reconnected' ? 'reconnected-refresh' : 'private-refresh', token_type: 'Bearer'}));
			}
			if (url.endsWith('user/whoami')) {
				return new Response(JSON.stringify({userid: identity, username: 'Artist'}));
			}
			throw new Error('Unexpected provider operation');
		};
		module = getModule(app, models, {redirectUri, fetch: providerFetch});
	});
	const start = async (extra = {}) => module.startDeviantArtOAuth(1, {...input, ...extra});
	const state = flow => new URL(flow.authorizationUrl).searchParams.get('state');
	it('returns a fixed HTTPS PKCE URL and encrypts application/verifier with hashed state, pending status is owner-scoped', async () => {
		const flow = await start();const auth = new URL(flow.authorizationUrl);
		assert.equal(auth.origin, 'https://www.deviantart.com');assert.equal(auth.pathname, '/oauth2/authorize');
		assert.equal(auth.searchParams.get('scope'), 'basic user browse stash publish');assert.equal(auth.searchParams.get('redirect_uri'), redirectUri);
		assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');assert.equal(flow.redirectUri, redirectUri);
		assert(!JSON.stringify(flow).includes('private'));
		const row = await models.PublicationOAuthFlow.findByPk(flow.flowId);
		assert.equal(row.stateHash, createHash('sha256').update(state(flow)).digest('hex'));assert(!row.secretEncrypted.includes('private-app-secret'));
		const stored = JSON.parse(await app.decryptTextWithAppPass(row.secretEncrypted));
		assert.equal(auth.searchParams.get('code_challenge'), createHash('sha256').update(stored.verifier).digest('base64url'));
		assert.equal((await module.getDeviantArtOAuth(1, flow.flowId)).status, 'pending');
		await assert.rejects(module.getDeviantArtOAuth(2, flow.flowId), {status: 404});assert.equal(requests.length, 0);
	});
	it('exchanges code once across concurrent callback requests, verifies account and stores safe destination without publication', async () => {
		const flow = await start();const row = await models.PublicationOAuthFlow.findByPk(flow.flowId);
		const verifier = JSON.parse(await app.decryptTextWithAppPass(row.secretEncrypted)).verifier;
		const completions = await Promise.allSettled([module.completeDeviantArtOAuth({state: state(flow), code: 'one-time-code'}), module.completeDeviantArtOAuth({state: state(flow), code: 'one-time-code'})]);
		assert.equal(completions.filter(item => item.status === 'fulfilled').length, 1);
		assert.equal(requests.filter(item => item.url.endsWith('/oauth2/token')).length, 1);
		const token = requests[0];assert.equal(token.options.body.get('code_verifier'), verifier);assert.equal(token.options.body.get('redirect_uri'), redirectUri);
		assert.equal(token.options.body.get('client_secret'), input.clientSecret);
		const result = await module.getDeviantArtOAuth(1, flow.flowId);assert.equal(result.status, 'connected');assert.equal(result.destination.accountIdentity, `deviantart:${identity}`);
		assert.equal(result.destination.enabled, false);assert(!JSON.stringify(result).includes('private'));
		assert.equal((await row.reload()).secretEncrypted, null);
		const account = await sequelize.models.socNetAccount.findOne();assert(!account.serverCredentialsEncrypted.includes('private-access'));
		assert.equal(JSON.parse(await app.decryptTextWithAppPass(account.serverCredentialsEncrypted)).credentials.accessToken, 'private-access');
		await assert.rejects(module.completeDeviantArtOAuth({state: state(flow), code: 'code'}), {status: 409});
		assert(!requests.some(item => item.url.includes('stash/')));
	});

	it('reconnects an owned shared account without secrets in input and preserves concurrent destination settings', async () => {
		const initial = await start();
		await module.completeDeviantArtOAuth({state: state(initial), code: 'initial'});
		const destination = (await module.getDeviantArtOAuth(1, initial.flowId)).destination;
		const shared = await module.setupServerDestination(1, {label: input.label, sourceGroupId: input.sourceGroupId, requestKey: 'second', network: 'deviantart', target: {}, account: {clientId: input.clientId, clientSecret: input.clientSecret, accessToken: 'old-access', refreshToken: 'old-refresh'}, contentPolicy: 'nsfw', enabled: true});
		requests.length = 0;
		const flow = await module.startDeviantArtOAuth(1, {destinationId: destination.id});
		assert.equal(requests.length, 0);
		assert(!JSON.stringify(flow).includes(input.clientSecret));
		assert.equal(new URL(flow.authorizationUrl).searchParams.get('scope'), 'basic user browse stash publish');
		await models.PublicationDestination.update({enabled: true, label: 'Edited during consent', contentPolicy: 'nsfw'}, {where: {id: destination.id}});
		mode = 'reconnected';
		assert.deepEqual(await module.completeDeviantArtOAuth({state: state(flow), code: 'reconnect'}), {status: 'connected'});
		const current = (await module.getDeviantArtOAuth(1, flow.flowId)).destination;
		assert.equal(current.id, destination.id);assert.equal(current.label, 'Edited during consent');assert.equal(current.enabled, true);assert.equal(current.contentPolicy, 'nsfw');
		const second = await models.PublicationDestination.findByPk(shared.destination.id);
		const first = await models.PublicationDestination.findByPk(destination.id);
		assert.equal(second.socNetAccountId, first.socNetAccountId);
		assert.equal(second.enabled, true);assert.equal(second.contentPolicy, 'nsfw');
		const account = await module.loadServerAccount(1, second.socNetAccountId, 'deviantart', second.accountIdentity);
		assert.equal(account.credentials.accessToken, 'reconnected-access');
		assert.equal(await sequelize.models.socNetAccount.count(), 1);
		assert(!requests.some(item => item.url.includes('stash/')));
	});
	it('rejects foreign destinations, mixed reconnect inputs and consent for another account without mutating credentials', async () => {
		const initial = await start();await module.completeDeviantArtOAuth({state: state(initial), code: 'initial'});
		const destination = (await module.getDeviantArtOAuth(1, initial.flowId)).destination;
		await assert.rejects(module.startDeviantArtOAuth(2, {destinationId: destination.id}), {status: 404});
		for (const bad of [{destinationId: 0}, {destinationId: destination.id, enabled: true}, {destinationId: destination.id, clientId: '123'}]) {
			await assert.rejects(module.startDeviantArtOAuth(1, bad), {status: 400});
		}
		const saved = (await sequelize.models.socNetAccount.findOne()).serverCredentialsEncrypted;
		const flow = await module.startDeviantArtOAuth(1, {destinationId: destination.id});
		const differentFetch = async (url, options) => url.endsWith('user/whoami') ? new Response(JSON.stringify({userid: 'aaaaaaaa-1234-1234-1234-123456789abc', username: 'Other'})) : providerFetch(url, options);
		const other = getModule(app, models, {redirectUri, fetch: differentFetch});
		assert.deepEqual(await other.completeDeviantArtOAuth({state: state(flow), code: 'wrong-account'}), {status: 'failed'});
		assert.equal((await sequelize.models.socNetAccount.findOne()).serverCredentialsEncrypted, saved);
		assert.equal(await sequelize.models.socNetAccount.count(), 1);
	});
	it('requests application credentials only when unavailable and accepts paired overrides without exposing them', async () => {
		const initial = await start();await module.completeDeviantArtOAuth({state: state(initial), code: 'initial'});
		const destination = (await module.getDeviantArtOAuth(1, initial.flowId)).destination;
		await sequelize.models.socNetAccount.update({serverCredentialsEncrypted: null}, {where: {}});
		await assert.rejects(module.startDeviantArtOAuth(1, {destinationId: destination.id}), (error: any) => error.code === 'deviantart_oauth_credentials_required');
		const flow = await module.startDeviantArtOAuth(1, {destinationId: destination.id, clientId: input.clientId, clientSecret: input.clientSecret});
		assert(!JSON.stringify(flow).includes(input.clientSecret));
		assert.deepEqual(await module.completeDeviantArtOAuth({state: state(flow), code: 'repair'}), {status: 'connected'});
	});
	it('survives module restart between start and callback, retains pending owner binding', async () => {
		const flow = await start();const reloaded = getModule(app, models, {redirectUri, fetch: providerFetch});
		assert.equal((await reloaded.getDeviantArtOAuth(1, flow.flowId)).status, 'pending');
		assert.equal((await reloaded.completeDeviantArtOAuth({state: state(flow), code: 'code'})).status, 'connected');
	});
	it('consumes denied state without provider calls and never reflects provider error descriptions', async () => {
		const flow = await start();assert.deepEqual(await module.completeDeviantArtOAuth({state: state(flow), error: 'access_denied', error_description: '<script>private</script>'}), {status: 'failed'});
		assert.equal(requests.length, 0);const status = await module.getDeviantArtOAuth(1, flow.flowId);
		assert.equal(status.error, 'deviantart_oauth_denied');assert(!JSON.stringify(status).includes('script'));
		assert.equal((await models.PublicationOAuthFlow.findByPk(flow.flowId)).secretEncrypted, null);
	});
	it('expires old flows, scrubs encrypted credentials, rejects unknown and duplicated query values', async () => {
		const flow = await start();await models.PublicationOAuthFlow.update({expiresAt: new Date(0)}, {where: {id: flow.flowId}});
		await assert.rejects(module.completeDeviantArtOAuth({state: state(flow), code: 'code'}));
		assert.equal(requests.length, 0);
		assert.equal(await models.PublicationOAuthFlow.findByPk(flow.flowId), null);
		for (const bad of [{state: ['a', 'b'], code: 'code'}, {state: state(flow), code: ['x', 'y']}, {state: state(flow), error: ['x']}, {state: 'not-state', code: 'code'}]) {
			await assert.rejects(module.completeDeviantArtOAuth(bad), {status: 400});
		}
	});

	it('signals rejected application credentials without exposing token endpoint details', async () => {
		const flow = await start();mode = 'invalid-client';
		assert.deepEqual(await module.completeDeviantArtOAuth({state: state(flow), code: 'code'}), {status: 'failed'});
		const outcome = await module.getDeviantArtOAuth(1, flow.flowId);
		assert.equal(outcome.error, 'deviantart_oauth_credentials_required');
		assert(!JSON.stringify(outcome).includes('private-secret'));
	});
	it('turns exchange errors into safe failed outcomes and never retries an ambiguous code', async () => {
		for (const failure of ['bad-token', 'unknown']) {
			mode = failure;const flow = await start();assert.deepEqual(await module.completeDeviantArtOAuth({state: state(flow), code: 'code'}), {status: 'failed'});
			const status = await module.getDeviantArtOAuth(1, flow.flowId);assert.equal(status.error, 'deviantart_oauth_failed');assert(!JSON.stringify(status).includes('private'));
			await assert.rejects(module.completeDeviantArtOAuth({state: state(flow), code: 'code'}), {status: 409});
		}
		assert.equal(requests.length, 2);assert.equal(await sequelize.models.socNetAccount.count(), 0);
	});
	it('bounds pending flows per owner and rejects arbitrary callbacks, invalid credentials and foreign sources', async () => {
		for (const bad of [{redirectUri: 'https://evil.example'}, {clientId: '0'}, {clientSecret: 'has whitespace'}, {sourceGroupId: 0}]) {
			await assert.rejects(start(bad), {status: 400});
		}
		await assert.rejects(module.startDeviantArtOAuth(2, input), {status: 403});
		for (let i = 0; i < 10; i++) {
			await start();
		}
		await assert.rejects(start(), {status: 429});
		for (const uri of ['http://example.com' + new URL(redirectUri).pathname, redirectUri + '?secret=1', 'https://user:pass@example.com' + new URL(redirectUri).pathname, 'https://example.com/wrong']) {
			assert.throws(() => deviantArtRedirectUri(app, uri), {status: 409});
		}
	});
	it('authorizes start/status, registers public callback first, and returns fixed no-store HTML without callback query data', async () => {
		const routes = [];app.checkUserCan = async () => true;
		app.ms.api = Object.fromEntries(['onGet', 'onAuthorizedGet', 'onAuthorizedPost'].map(method => [method, (path, handler) => routes.push({method, path, handler})]));
		registerApi(app, module);
		const startRoute = routes.find(item => item.path.endsWith('/oauth/start') && item.path.includes('/social-'));
		const callback = routes.find(item => item.method === 'onGet' && item.path.endsWith('/oauth/callback'));
		const status = routes.find(item => item.path.endsWith('/oauth/:flowId'));
		assert(routes.indexOf(callback) < routes.indexOf(status));
		await assert.rejects(startRoute.handler({user: {id: 1}, apiKey: {scopes: ['publishing:local']}, body: input}, {}), {status: 403});
		await assert.rejects(status.handler({user: {id: 1}, apiKey: {scopes: []}, params: {flowId: 'a'.repeat(64)}}, {}), {status: 403});
		const headers = {};let html = '';
		await callback.handler({query: {state: '<script>private-code</script>', error: 'private-provider-error'}}, {setHeader: (key, value) => headers[key] = value, send: value => html = value});
		assert.equal(headers['Cache-Control'], 'no-store');assert.equal(headers['Referrer-Policy'], 'no-referrer');assert.match(headers['Content-Security-Policy'], /default-src 'none'/);
		assert(!html.includes('private'));assert(!html.includes('<script>'));
		const pending = await start();
		await callback.handler({query: {state: state(pending), code: 'valid'}, stream: {url: `/v1/user/social-publications/deviantart/oauth/callback?state=${state(pending)}&state=other&code=valid`}}, {setHeader: () => {}, send: () => {}});
		assert.equal((await module.getDeviantArtOAuth(1, pending.flowId)).status, 'pending');
		assert.equal(requests.length, 0);
		assert(isSensitiveOAuthCallback('/v1/user/social-publications/deviantart/oauth/callback?code=private&state=private'));
		assert(isSensitiveOAuthCallback('/api/v1/user/social-publications/deviantart/oauth/callback/?error=denied'));
		assert(!isSensitiveOAuthCallback('/v1/user/social-publications/deviantart/oauth/start'));
		assert(!isSensitiveOAuthCallback('/v1/health'));
	});
});
