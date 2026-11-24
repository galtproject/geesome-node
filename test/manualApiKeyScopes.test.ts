import assert from 'node:assert/strict';
import createApp from '../app/index.js';
import {CorePermissionName as P} from '../app/modules/database/interface.js';
import {getApiKeyScopes} from '../app/modules/api/integrationScopes.js';
import registerPublishingApi from '../app/modules/socNetPublishing/api.js';

describe('manual API key creation scopes', () => {
	let app, saved, permissions;
	beforeEach(async () => {
		permissions = [P.UserAll];
		const database = {
			getCorePermissions: async () => permissions.map(name => ({name})),
			isHaveCorePermission: async (_id, name) => permissions.includes(name),
			addApiKey: async data => {saved = {...data};}
		};
		app = await createApp({modules: ['database'], skipFrontendStorage: true,
			storageConfig: {jsNode: {pass: 'fixture', salt: 'fixture'}}}, {
			loadModule: async name => name === 'database' ? database : {}
		});
	});
	afterEach(async () => {await app?.stop();});

	it('creates an unrestricted manual key that can start DeviantArt OAuth', async () => {
		await app.generateUserApiKey(1, {type: 'user_manual', title: 'Publisher'});
		assert.deepEqual(JSON.parse(saved.permissions), [P.UserAll]);
		for (const scope of ['publishing:manage', 'publishing:local', 'assets:write']) {
			assert(getApiKeyScopes(saved).includes(scope));
		}
		const routes = [];
		app.ms.api = Object.fromEntries(['onGet', 'onAuthorizedGet', 'onAuthorizedPost'].map(method => [method,
			(path, handler) => routes.push({path, handler})]));
		registerPublishingApi(app, {startDeviantArtOAuth: async owner => ({owner})} as any);
		const route = routes.find(item => item.path === 'user/social-publications/deviantart/oauth/start');
		let response;
		await route.handler({user: {id: 1}, apiKey: saved, body: {}}, {setHeader() {}, send: value => {response = value;}});
		assert.deepEqual(response, {owner: 1});
		await assert.rejects(route.handler({user: {id: 1}, apiKey: {permissions: saved.permissions}, body: {}}, {}), {code: 'insufficient_scope'});
	});

	it('derives management only when the owner has group management', async () => {
		permissions = [P.UserApiKeyManagement, P.UserGroupManagement];
		await app.generateUserApiKey(1, {type: 'user_manual'});
		assert.deepEqual(getApiKeyScopes(saved), ['publishing:local', 'publishing:manage']);
		permissions = [P.UserApiKeyManagement, P.UserSaveData];
		await app.generateUserApiKey(1, {type: 'user_manual'});
		assert(getApiKeyScopes(saved).includes('assets:write'));
		assert(!getApiKeyScopes(saved).includes('publishing:manage'));
		assert(!getApiKeyScopes(saved).includes('publishing:local'));
	});

	it('preserves explicitly restricted permissions including empty permissions', async () => {
		for (const value of [[P.UserGroupManagement], []]) {
			await app.generateUserApiKey(1, {type: 'user_manual', permissions: value});
			assert.equal(saved.scopes, undefined);
			assert.deepEqual(JSON.parse(saved.permissions), value);
			assert(!getApiKeyScopes(saved).includes('publishing:manage'));
		}
	});

	it('preserves explicit scopes and rejects scopes the owner cannot grant', async () => {
		for (const scopes of [['publishing:local'], []]) {
			await app.generateUserApiKey(1, {type: 'user_manual', scopes});
			assert.deepEqual(JSON.parse(saved.scopes), scopes);
			assert(!getApiKeyScopes(saved).includes('publishing:manage'));
		}
		permissions = [P.UserApiKeyManagement, P.UserSaveData];
		await assert.rejects(app.generateUserApiKey(1, {type: 'user_manual', scopes: ['publishing:manage']}), /not_permitted/);
	});

	it('keeps legacy and non-manual keys without implicit management scope', async () => {
		for (const type of [undefined, 'password_auth', 'invite', 'integration']) {
			await app.generateUserApiKey(1, {type});
			assert.equal(saved.scopes, undefined);
			assert(!getApiKeyScopes(saved).includes('publishing:manage'));
		}
	});
});
