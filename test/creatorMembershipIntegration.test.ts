import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {getModule as createGroupModule} from '../app/modules/group/index.js';
import {CID} from 'multiformats/cid';
import {create as createKuboClient} from 'kubo-rpc-client';
import JsIpfsServiceNode from 'geesome-libs/src/JsIpfsServiceNode.js';
import {sha256} from 'multiformats/hashes/sha2';
import {publicationDigest} from '../app/modules/staticSiteGenerator/membershipProjection.js';
import registerPublicationApi from '../app/modules/membership/publicationApi.js';
import createApp from '../app/index.js';
import { request as httpRequest } from 'node:http';
import { randomUUID, generateKeyPairSync, createSign } from 'node:crypto';
import { Sequelize } from 'sequelize';
import { OAuth2Client } from 'google-auth-library';
import defineUsers from '../app/modules/database/models/user.js';
import defineContent from '../app/modules/database/models/content.js';
import defineGroups from '../app/modules/group/models/group.js';
import definePosts from '../app/modules/group/models/post.js';
import definePermissions from '../app/modules/database/models/corePermission.js';
import defineKeys from '../app/modules/database/models/userApiKey.js';
import defineIdentities from '../app/modules/googleAuthorization/models.js';
import definePayments from '../app/modules/payments/models.js';
import defineMembership from '../app/modules/membership/models.js';
import { createGoogleAuthorization } from '../app/modules/googleAuthorization/index.js';
import { createPayments } from '../app/modules/payments/index.js';
import { createMembership, periodEnd } from '../app/modules/membership/index.js';
import registerGoogle from '../app/modules/googleAuthorization/api.js';
import registerPayments from '../app/modules/payments/api.js';
import registerMembership from '../app/modules/membership/api.js';
import createApi from '../app/modules/api/index.js';
import { configuredSite, siteProblem } from '../app/modules/api/browserSession.js';
import { CorePermissionName } from '../app/modules/database/interface.js';
const databaseUrl = process.env.CREATOR_MEMBERSHIP_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite('creator modules with real PostgreSQL and HTTP', function () {
	this.timeout(30000);
	let db, app, authApp, delegated, identityModels, membershipModels, paymentModels, models, google, membership, payments, owner, otherOwner;
	let api, base;
	let now = new Date();
	const transfers = new Map<string, any[]>();
	const publicationContents = new Map<string, any[]>();
	let outage = false;
	const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	const cert = publicKey.export({ type: 'spki', format: 'pem' }).toString();
	const verifier = new OAuth2Client();
	let waveReader, waveCookie, meatCookie, paidInvoice;
	const observer = {
		quote: async () => '1000',
		check: async () => true,
		scan: async (_snapshot, address) => {
			if (outage) {
				throw new Error('fake_chain_outage');
			}
			return transfers.get(address) || [];
		}
	};
	function jwt(nonce, overrides = {}, key = privateKey) {
		const seconds = Math.floor(Date.now() / 1000);
		const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'local-test' })).toString('base64url');
		const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'existing-google-client',
			iat: seconds, exp: seconds + 3600, sub: 'existing-google-reader', email: 'buyer@example.test', email_verified: true, name: 'Buyer', nonce, ...overrides })).toString('base64url');
		const signed = `${header}.${payload}`;
		return `${signed}.${createSign('RSA-SHA256').update(signed).sign(key).toString('base64url')}`;
	}
	async function request(path, { site = 'wave', cookie = '', body, raw, method, token, origin, headers = {} }: any = {}) {
		const host = site === 'meat' ? 'eraofmeat.com' : site === 'wave' ? 'eraofwave.com' : site;
		return new Promise<any>((resolve, reject) => {
			const req = httpRequest(path.startsWith('/ipfs/') ? `${base}${path}` : `${base}/v1/${path}`, { method: method || (body === undefined && raw === undefined ? 'GET' : 'POST'), headers: {
					Host: host, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin || `https://${host}` }),
					...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers
				} }, response => {
				let text = '';
				response.setEncoding('utf8');
				response.on('data', chunk => { text += chunk; });
				response.on('end', () => resolve({ status: response.statusCode, body: text ? (String(response.headers['content-type']).includes('json') ? JSON.parse(text) : text) : null,
					cookies: response.headers['set-cookie'] || [], headers: { get: key => response.headers[key.toLowerCase()] } }));
			});
			req.on('error', reject);
			req.end(raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw);
		});
	}
	async function login(site = 'wave', overrides = {}) {
		const challenge = await request('login/google/challenge', { site });
		assert.equal(challenge.status, 200);
		const result = await request('login/google', { site, cookie: challenge.cookies[0].split(';')[0], body: { credential: jwt(challenge.body.nonce, overrides) } });
		assert.equal(result.status, 200, JSON.stringify(result.body));
		return { ...result, cookie: result.cookies.find(cookie => cookie.startsWith('__Host-geesome_session=')).split(';')[0] };
	}
	before(async () => {
		const url = new URL(databaseUrl!);
		assert(['127.0.0.1', 'localhost'].includes(url.hostname));
		assert.equal(url.pathname, '/geesome_membership_test');
		db = new Sequelize(databaseUrl!, { logging: false, pool: { max: 8 } });
		await db.authenticate();
		// Only this explicitly named disposable database is reset.
		await db.getQueryInterface().dropAllTables();
		models = {};
		models.User = await defineUsers(db, models);
		models.Content = await defineContent(db, models);
		models.Group = await defineGroups(db, models);
		models.Post = await definePosts(db, models);
		models.CorePermission = await definePermissions(db, models);
		models.UserApiKey = await defineKeys(db, models);
		owner = await models.User.create({ name: 'creator' });
		otherOwner = await models.User.create({ name: 'other-creator' });
		await models.CorePermission.create({ userId: owner.id, name: CorePermissionName.UserGroupManagement, isActive: true });
		await models.CorePermission.create({ userId: owner.id, name: CorePermissionName.AdminAll, isActive: true });
		await models.CorePermission.create({ userId: otherOwner.id, name: CorePermissionName.UserGroupManagement, isActive: true });
		const wave = await models.Group.create({ name: 'wave', creatorId: owner.id, title: 'Era Of Wave', isPublic: false, isEncrypted: false, isOpen: false });
		const meat = await models.Group.create({ name: 'meat', creatorId: otherOwner.id, title: 'Era Of Meat', isPublic: false, isEncrypted: false, isOpen: false });
		const sites = [{ id: 'wave', origin: 'https://eraofwave.com', groupId: wave.id, ownerId: owner.id }, { id: 'meat', origin: 'https://eraofmeat.com', groupId: meat.id, ownerId: otherOwner.id }]
			.map(site => ({ ...site, googleClientId: 'existing-google-client', postsEnabled: true, registrationEnabled: true }));
		delegated = await models.User.create({ name: 'delegated-site-owner' });
		for (const name of [CorePermissionName.AdminMembershipSites, CorePermissionName.UserGroupManagement]) {
			await models.CorePermission.create({ userId: delegated.id, name, isActive: true });
		}
		// Run production permission methods and AsyncLocalStorage key scoping;
		// bootstrap module stubs keep this fixture independent of IPFS/network startup.
		authApp = await createApp({ skipFrontendStorage: true, storageConfig: { jsNode: { pass: 'test', salt: 'test' } } }, { loadModule: async () => ({}) });
		authApp.ms.database = { isHaveCorePermission: async (userId, name) => Boolean(await models.CorePermission.findOne({ where: { userId, name, isActive: true } })) } as any;
		app = { config: { domain: 'localhost', apiConfig: {}, paymentsConfig: { worker: false } }, ms: { database: { sequelize: db, models } },
			checkModules(names) {
				for (const name of names) {
					assert(this.ms[name]);
				}
			},
			checkUserCan: authApp.checkUserCan.bind(authApp),
			isAdminCan: authApp.isAdminCan.bind(authApp),
			runWithApiKey: authApp.runWithApiKey.bind(authApp),
			getUserByApiToken: async token => {
				const user = token.startsWith('test-owner') ? owner : token.startsWith('test-delegated') ? delegated
					: ['test-other-owner', 'test-ungranted'].includes(token) ? otherOwner : token === 'test-reader' ? await models.User.findByPk(waveReader.userId) : null;
				let permissions = [CorePermissionName.UserAll];
				if (token === 'test-ungranted') {
					permissions = [CorePermissionName.AdminMembershipSites, CorePermissionName.UserGroupManagement];
				} else if (token === 'test-owner') {
					permissions.push(CorePermissionName.AdminAll);
				} else if (token === 'test-delegated' || token === 'test-owner-delegated') {
					permissions = [CorePermissionName.AdminMembershipSites, CorePermissionName.UserGroupManagement];
				} else if (token === 'test-delegated-no-group') {
					permissions = [CorePermissionName.AdminMembershipSites];
				}
				return { user, apiKey: { userId: user?.id, isDisabled: false, permissions: JSON.stringify(permissions) } };
			} };

		// Group adapters use real production models; no IPFS publication is involved.
		app.ms.group = {
			getLocalGroup: async (userId, id) => {
				const group = await models.Group.findByPk(id);
				assert.equal(group.creatorId, userId);
				return group;
			},
			getGroupPosts: async (groupId, filters, pagination) => {
				const list = await models.Post.findAll({ where: { groupId, isDeleted: false, status: filters.status }, order: [['publishedAt', 'DESC'], ['id', 'DESC']], limit: pagination.limit, offset: pagination.offset });
				for (const post of list) {
					post.contents = publicationContents.get(String(post.id)) || [];
				}
				return {list};
			},
			forEachHydratedGroupPostBatch: async (groupId, options, onBatch) => {
				let offset = 0;
				while (offset < options.maxRefs) {
					const posts = await models.Post.findAll({where: {groupId, isDeleted: false, status: options.filters.status}, order: [['publishedAt', 'DESC'], ['id', 'DESC']], limit: options.batchLimit, offset});
					for (const post of posts) {
						post.contents = publicationContents.get(String(post.id)) || [];
					}
					await onBatch({groupPosts: posts, refCount: posts.length});
					if (posts.length < options.batchLimit) {
						break;
					}
					offset += posts.length;
				}
			},
			prepareContentData: async content => ({text: await app.ms.storage.getFileDataText(content.storageId)}),
			getPostPure: id => models.Post.findByPk(id)
		};
		identityModels = await defineIdentities(db);
		paymentModels = await definePayments(db);
		membershipModels = await defineMembership(db);
		google = createGoogleAuthorization(app, identityModels, { clock: () => now, google: {
				verifyIdToken: ({ idToken, audience }) => verifier.verifySignedJwtWithCertsAsync(idToken, { 'local-test': cert }, audience, ['accounts.google.com', 'https://accounts.google.com'])
			} });
		payments = createPayments(app, paymentModels, { observer, env: { DIRECT_CRYPTO_SEED_PHRASE: 'test test test test test test test test test test test junk' }, clock: () => now });
		app.ms.googleAuthorization = google;
		app.ms.payments = payments;
		membership = createMembership(app, membershipModels, { clock: () => now, publicationHeartbeatMs: 20 });
		app.ms.membership = membership;
		for (const site of sites) {
			await membership.provisionSite(owner.id, { ...site, enabled: true, version: 0 });
		}
		payments.configureLedger({ models: membership.models, resource: membership.resource, serial: membership.serial,
			grantPaidInvoice: membership.grantPaidInvoice, clock: () => now, fail: siteProblem });
		api = await createApi(app, { host: '127.0.0.1', port: 23000 + Math.floor(Math.random() * 10000), registerRoutes: (_app, module) => {
				app.ms.api = module;
				registerGoogle(app, google);
				registerPayments(app, payments);
				registerMembership(app, membership);
				registerPublicationApi(app, membership);
				module.onAuthorizedPost('test/upload', async (_req, res) => res.send({ ok: true }), { storageReadOnly: true });
			} });
		base = `http://127.0.0.1:${api.port}`;
	});
	after(async () => {
		await api?.stop();
		await payments?.stop();
		await authApp?.stop();
		await membership?.stop();
		await db?.close();
	});
	it('verifies a signed Google credential and creates only a private user with a site session', async () => {
		const result = await login();
		waveCookie = result.cookie;
		waveReader = result.body.reader;
		assert(!result.body.apiKey);
		assert.match(result.cookies[0], /Secure; HttpOnly; SameSite=Lax/);
		assert(!result.cookies[0].includes('Domain='));
		assert.equal(result.headers.get('cache-control'), 'no-store');
		const user = await models.User.findByPk(waveReader.userId);
		assert.equal(user.email, null);
		assert.equal(user.passwordHash, null);
		assert.equal(user.manifestStorageId, null);
		assert.equal(user.storageAccountId, null);
		assert.equal(await models.CorePermission.count({ where: { userId: user.id } }), 0);
		assert.equal(await models.UserApiKey.count({ where: { userId: user.id } }), 0);
		assert.equal(await models.GroupMembers.count({ where: { userId: user.id } }), 0);
		assert.equal((await request('test/upload', { cookie: waveCookie, body: {} })).status, 401);
		assert.equal((await request('test/upload', { token: 'test-owner', body: {} })).status, 200);
	});
	it('stores site settings in SQL and applies owner changes without restart', async () => {
		const route = 'membership/admin/wave/site';
		const initial = await request(route, { token: 'test-owner' });
		assert.equal(initial.status, 200);
		assert.equal(initial.body.version, 1);
		assert.equal((await request(route, { token: 'test-other-owner' })).status, 403);
		assert.equal((await request(route, { cookie: waveCookie })).status, 401);
		const settings = { version: 1, enabled: true, googleClientId: 'changed-client', registrationEnabled: false, postsEnabled: true };
		assert.equal((await request(route, { token: 'test-other-owner', body: settings })).status, 403);
		assert.equal((await request(route, { token: 'test-owner', body: { ...settings, origin: 'https://evil.test' } })).status, 400);
		const [a, b] = await Promise.all([request(route, { token: 'test-owner', body: settings }), request(route, { token: 'test-owner', body: settings })]);
		assert.deepEqual([a.status, b.status].sort(), [200, 409]);
		assert.equal((await request('login/google/challenge')).body.googleClientId, 'changed-client');
		let saved = await request(route, { token: 'test-owner', body: { ...settings, googleClientId: '', version: 2 } });
		assert.equal(saved.status, 200);
		assert.equal((await request('login/google/challenge')).status, 503);
		saved = await request(route, { token: 'test-owner', body: { ...settings, googleClientId: 'existing-google-client', version: 3 } });
		assert.equal(saved.status, 200);
		const challenge = await request('login/google/challenge');
		const denied = await request('login/google', { cookie: challenge.cookies[0].split(';')[0], body: { credential: jwt(challenge.body.nonce, { sub: 'new-registration-disabled-reader' }) } });
		assert.equal(denied.status, 403);
		assert.equal(await identityModels.Identity.count({ where: { subject: 'new-registration-disabled-reader' } }), 0);
		assert.equal((await login()).body.reader.id, waveReader.id);
		saved = await request(route, { token: 'test-owner', body: { ...settings, googleClientId: 'existing-google-client', enabled: false, version: 4 } });
		assert.equal(saved.status, 200);
		assert.equal((await request('membership/resource')).status, 404);
		assert.equal((await request('browser-session', { cookie: waveCookie })).status, 404);
		assert.equal((await request('login/google/challenge')).status, 404);
		saved = await request(route, { token: 'test-owner', body: { ...settings, googleClientId: 'existing-google-client', registrationEnabled: true, version: 5 } });
		assert.equal(saved.status, 200);
		assert.equal((await request('membership/resource')).status, 200);
		// The process and service objects have not been restarted or reconfigured.
		assert.equal((await membership.resolveSite('eraofwave.com')).version, 6);
	});
	it('delegates provisioning to account and key scopes without granting full administration or foreign groups', async () => {
		const group = await models.Group.create({ name: 'delegated', creatorId: delegated.id, title: 'Delegated', isPublic: false, isEncrypted: false, isOpen: false });
		const input = { id: 'delegated', origin: 'https://delegated.test', groupId: String(group.id), ownerId: delegated.id,
			googleClientId: 'delegated-client', postsEnabled: false, registrationEnabled: true, enabled: true, version: 0 };
		for (const token of ['test-owner-user-only', 'test-delegated-user-only', 'test-delegated-no-group', 'test-ungranted', 'test-other-owner']) {
			assert.equal((await request('membership/sites', { token, body: input })).status, 403, token);
		}
		assert.equal(await membershipModels.resources.count({ where: { id: 'delegated' } }), 0);
		assert.equal((await request('membership/sites', { token: 'test-delegated', body: { ...input, ownerId: owner.id } })).status, 403);
		// Even an admin account is restricted by a delegated integration key.
		assert.equal((await request('membership/sites', { token: 'test-owner-delegated', body: input })).status, 403);
		const result = await request('membership/sites', { token: 'test-delegated', body: input });
		assert.equal(result.status, 200);
		assert.equal(result.body.ownerId, delegated.id);
		assert.equal((await request('membership/admin/delegated/site', { token: 'test-delegated' })).status, 200);
		assert.equal((await request('membership/admin/delegated/site', { token: 'test-other-owner' })).status, 403);
		assert.equal(await authApp.isAdminCan(delegated.id, CorePermissionName.AdminAll), false);
		assert.equal(await authApp.isAdminCan(delegated.id, CorePermissionName.AdminSetPermissions), false);
		assert.equal((await request('membership/sites', { token: 'test-delegated', body: { ...input, origin: 'https://different.test', version: 1 } })).status, 409);
	});
	it('reserves domain bindings for node operators and imports existing resources without repricing', async () => {
		const current = (await request('membership/admin/wave/site', { token: 'test-owner' })).body;
		assert.equal((await request('membership/sites', { token: 'test-other-owner', body: current })).status, 403);
		assert.equal((await request('membership/sites', { cookie: waveCookie, body: current })).status, 401);
		assert.equal((await request('membership/sites', { token: 'test-owner', body: { ...current, origin: 'https://evil.test' } })).status, 409);
		const group = await models.Group.create({ name: 'third', creatorId: owner.id, title: 'Third', isPublic: false, isEncrypted: false, isOpen: false });
		const input = { ...current, id: 'third', groupId: String(group.id), version: 0 };
		assert.equal((await request('membership/sites', { token: 'test-owner', body: input })).status, 409);
		assert.equal((await request('membership/sites', { token: 'test-owner', body: { ...input, origin: 'https://third.test/path' } })).status, 400);
		const created = await request('membership/sites', { token: 'test-owner', body: { ...input, origin: 'https://third.test' } });
		assert.equal(created.status, 200);
		assert.equal((await request('membership/resource', { site: 'third.test' })).status, 200);
		// Simulate the pre-upgrade resources table: financial binding survives, new settings table is empty.
		const option = await membershipModels.options.findOne({ where: { resourceId: 'third' } });
		await option.update({ amountCents: 777 });
		await membershipModels.site_settings.destroy({ where: { resourceId: 'third' } });
		assert.equal((await request('membership/resource', { site: 'third.test' })).status, 404);
		const imported = await request('membership/sites', { token: 'test-owner', body: { ...input, origin: 'https://third.test' } });
		assert.equal(imported.status, 200);
		assert.equal(imported.body.version, 1);
		assert.equal((await option.reload()).amountCents, 777);
		assert.equal(await membershipModels.options.count({ where: { resourceId: 'third' } }), 2);
		const restored = createMembership(app, await defineMembership(db), { clock: () => now });
		assert.equal((await restored.resolveSite('third.test')).id, 'third');
	});
	it('reuses one identity across sites while isolating sessions, origin and owner privileges', async () => {
		const result = await login('meat');
		meatCookie = result.cookie;
		assert.equal(result.body.reader.id, waveReader.id);
		assert.equal((await request('browser-session', { cookie: waveCookie, site: 'meat' })).body.reader, null);
		assert.equal((await request('browser-session', { cookie: `${waveCookie}; ${waveCookie}` })).body.reader, null);
		assert.equal((await request('browser-session/logout', { cookie: waveCookie, body: {}, headers: { Origin: '' } })).status, 403);
		assert.equal((await request('browser-session', { cookie: meatCookie, site: 'meat' })).body.reader.id, waveReader.id);
		assert.equal((await request('browser-session/logout', { cookie: waveCookie, body: {}, origin: 'https://evil.test' })).status, 403);
		assert.equal((await request('browser-session', { cookie: waveCookie, site: 'unknown.test' })).status, 404);
		assert.equal((await request('browser-session', { cookie: waveCookie, headers: { Origin: 'https://evil.test' } })).status, 403);
		assert.equal((await request('payments/admin/wave/settings', { cookie: waveCookie })).status, 401);
		assert.equal((await request('payments/admin/wave/settings', { token: 'test-other-owner' })).status, 403);
	});
	it('rejects replayed nonce, bad signatures, wrong audience/issuer and expired tokens', async () => {
		for (const changes of [{ aud: 'wrong' }, { iss: 'https://evil.test' }, { exp: 1 }, { email_verified: false }, { nonce: 'wrong' }]) {
			const c = await request('login/google/challenge');
			const r = await request('login/google', { cookie: c.cookies[0].split(';')[0], body: { credential: jwt(c.body.nonce, changes) } });
			assert.equal(r.status, 401);
		}
		const c = await request('login/google/challenge');
		const cookie = c.cookies[0].split(';')[0], credential = jwt(c.body.nonce);
		assert.equal((await request('login/google', { cookie, body: { credential } })).status, 200);
		assert.equal((await request('login/google', { cookie, body: { credential } })).status, 401);
		const bad = await request('login/google/challenge');
		const differentKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
		assert.equal((await request('login/google', { cookie: bad.cookies[0].split(';')[0], body: { credential: jwt(bad.body.nonce, {}, differentKey) } })).status, 401);
	});
	it('serializes concurrent registration and prevents email-based takeover', async () => {
		const results = await Promise.all(Array.from({ length: 4 }, () => login('wave', { sub: 'concurrent-new-reader', email: 'buyer@example.test' })));
		assert.equal(new Set(results.map(result => result.body.reader.id)).size, 1);
		assert.notEqual(results[0].body.reader.id, waveReader.id);
		assert.equal(await identityModels.Identity.count({ where: { subject: 'concurrent-new-reader' } }), 1);
	});
	it('keeps tariffs and invoice snapshots isolated, resumes one invoice and preserves it on RPC outage', async () => {
		const wallet = await request('payments/admin/wave/wallet', { token: 'test-owner', body: { network: 'base', enabled: true, version: 0, xpub: '', pool: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'], assets: ['usdc-base'] } });
		assert.equal(wallet.status, 200, JSON.stringify(wallet.body));
		const option = await membershipModels.options.findOne({ where: { resourceId: 'wave', period: 'month' } });
		const body = { optionId: option.id, assetId: 'usdc-base', idempotencyKey: 'first-payment' };
		const results = await Promise.all([request('payments/crypto/invoices', { cookie: waveCookie, body }), request('payments/crypto/invoices', { cookie: waveCookie, body })]);
		assert.equal(results[0].status, 200, JSON.stringify(results[0].body));
		assert.equal(results[0].body.id, results[1].body.id);
		paidInvoice = results[0].body;
		assert.equal(paidInvoice.amount, '4');
		assert.equal((await request(`payments/crypto/invoices/${paidInvoice.id}`, { cookie: meatCookie, site: 'meat' })).status, 404);
		assert.equal((await request('payments/crypto/invoices', { cookie: waveCookie, body: { ...body, assetId: 'eth-base' } })).status, 409);
		await membership.saveOption('wave', { ...option.toJSON(), amountCents: 900 });
		assert.equal((await paymentModels.invoices.findByPk(paidInvoice.id)).optionSnapshot.amountCents, 400);
		outage = true;
		await payments.engine.run();
		outage = false;
		assert.equal((await paymentModels.crypto_invoices.findByPk(paidInvoice.id)).status, 'pending');
		assert.equal((await membership.entitlement(waveReader.id, 'wave')).active, false);
	});
	it('accumulates confirmed partial payments and grants exactly one period under concurrent scans', async () => {
		const snapshot = (await paymentModels.crypto_invoices.findByPk(paidInvoice.id)).snapshot;
		const transfer = (key, amountAtomic) => ({ key, txid: '0x' + key.padStart(64, '0'), atomic: amountAtomic, confirmed: true, timestamp: now.getTime() + 1000, ...{ network: snapshot.network } });
		transfers.set(paidInvoice.address, [transfer('a', '1000000')]);
		now = new Date(now.getTime() + 31000);
		await payments.engine.run();
		assert.equal((await payments.engine.read('wave', waveReader.id, paidInvoice.id)).status, 'underpaid');
		transfers.set(paidInvoice.address, [transfer('a', '1000000'), transfer('b', '3000000')]);
		now = new Date(now.getTime() + 31000);
		await Promise.all([payments.engine.run(), payments.engine.run()]);
		assert.equal((await payments.engine.read('wave', waveReader.id, paidInvoice.id)).status, 'paid');
		assert.equal(await membershipModels.periods.count({ where: { invoiceId: paidInvoice.id } }), 1);
		assert.equal((await membership.entitlement(waveReader.id, 'wave')).active, true);
		assert.equal((await membership.entitlement(waveReader.id, 'meat')).active, false);
	});
	it('projects real group posts without leaking full URLs or arbitrary properties to guests', async () => {
		const row = await membership.resource('wave');
		const post = await models.Post.create({ groupId: Number(row.groupId), userId: owner.id, status: 'published', publishedAt: now, localId: 1,
			propertiesJson: JSON.stringify({ membership: { title: 'Paid set', description: 'Public teaser', previewCount: 1, free: false,
					pageUrl: 'https://eraofwave.com/ipfs/bafyprivate/', previewMedia: [{ url: 'https://eraofwave.com/ipfs/bafypreview' }], secret: 'never-export' } }) });
		publicationContents.set(String(post.id), [{id: 997, storageId: 'public-preview', mimeType: 'image/png', postsContents: {isPrivate: false}},
			{id: 996, storageId: 'private-image', mimeType: 'image/png', postsContents: {isPrivate: true}}]);
		const guest = await request('membership/feed');
		assert.equal(guest.status, 200);
		assert.equal(guest.body.posts[0].locked, true);
		assert.deepEqual(guest.body.posts[0].previews, ['/ipfs/public-preview']);
		assert.equal(guest.body.posts[0].pageUrl, undefined);
		assert(!JSON.stringify(guest.body).includes('bafyprivate'));
		assert(!JSON.stringify(guest.body).includes('never-export'));
		assert.equal((await request('membership/feed', { cookie: waveCookie })).body.posts[0].pageUrl, `/api/v1/membership/site/posts/${post.id}/`);
		assert.equal((await request(`membership/posts/${post.id}`, { site: 'meat' })).status, 404);
		assert.equal((await request('membership/feed?limit=Infinity&offset=Infinity')).status, 200);
	});
	it('keeps access until manual refund completion and revokes only the paid invoice period', async () => {
		const result = await request('membership/refunds', { cookie: waveCookie, body: { invoiceId: paidInvoice.id, idempotencyKey: 'refund-request', reason: 'Please refund' } });
		assert.equal(result.status, 200, JSON.stringify(result.body));
		const decision = await request(`membership/admin/wave/refunds/${result.body.id}/decision`, { token: 'test-owner', body: { decision: 'approve', reason: 'Approved' } });
		assert.equal(decision.body.status, 'action_required');
		assert.equal((await membership.entitlement(waveReader.id, 'wave')).active, true);
		const complete = await request(`membership/admin/wave/refunds/${result.body.id}/complete`, { token: 'test-owner', body: { txid: '0x' + 'f'.repeat(64) } });
		assert.equal(complete.status, 200, JSON.stringify(complete.body));
		assert.equal((await membership.entitlement(waveReader.id, 'wave')).active, false);
		assert.equal((await request('membership/feed', { cookie: waveCookie })).body.posts[0].locked, true);
		assert.equal(await paymentModels.crypto_transactions.count(), 0);
	});
	it('allows only the authenticated creator to edit their own payout default', async () => {
		assert.equal((await request('user/payments/payout', { cookie: waveCookie })).status, 401);
		assert.equal((await request('user/payments/payout', {token: 'test-reader'})).status, 403);
		assert.equal((await request('user/payments/payout', {token: 'test-reader', body: {payout: '0x' + 'a'.repeat(40), version: 0}})).status, 403);
		assert.equal((await request('user/payments/payout', { token: 'test-owner' })).body.version, 0);
		const payout = '0x' + 'a'.repeat(40);
		const saved = await request('user/payments/payout', { token: 'test-owner', body: { payout, version: 0 } });
		assert.equal(saved.status, 200, JSON.stringify(saved.body));
		assert.equal((await request('user/payments/payout', { token: 'test-other-owner' })).body.payout, '');
		assert.equal((await request(`user/payments/payout?userId=${otherOwner.id}`, { token: 'test-owner' })).body.payout, payout);
		assert.equal((await request('user/payments/payout', { token: 'test-owner', body: { payout, version: 1, userId: otherOwner.id } })).status, 400);
		const setting = await request('payments/admin/wave/settings', { token: 'test-owner' });
		assert.equal(setting.body.automation.payout, payout);
		assert.equal(setting.body.automation.payoutSource, 'owner');
		assert.equal((await request('payments/admin/meat/treasury', { token: 'test-owner', body: { inherit: true, version: 0 } })).status, 403);
	});
	it('expires access and sessions, supports logout, and preserves calendar anchors', async () => {
		const future = new Date(now.getTime() + 60000);
		await membershipModels.periods.create({ id: randomUUID(), readerId: waveReader.id, resourceId: 'wave', invoiceId: randomUUID(), anchorDay: now.getUTCDate(), startsAt: now, endsAt: future, revoked: false });
		assert.equal((await membership.entitlement(waveReader.id, 'wave')).active, true);
		now = future;
		assert.equal((await membership.entitlement(waveReader.id, 'wave')).active, false);
		assert.equal(periodEnd(new Date('2026-01-31T12:00:00Z'), 'month').toISOString(), '2026-02-28T12:00:00.000Z');
		assert.equal(periodEnd(new Date('2026-02-28T12:00:00Z'), 'month', 31).toISOString(), '2026-03-31T12:00:00.000Z');
		assert.equal(periodEnd(new Date('2026-01-31T12:00:00Z'), 'halfyear').toISOString(), '2026-07-31T12:00:00.000Z');
		await request('browser-session/logout', { cookie: waveCookie, body: {} });
		assert.equal((await request('browser-session', { cookie: waveCookie })).body.reader, null);
		now = new Date(now.getTime() + 31 * 86400000);
		assert.equal((await request('browser-session', { cookie: meatCookie, site: 'meat' })).body.reader, null);
	});

	it('publishes immutable public/full IPFS snapshots and retains obtained snapshots after expiry and updates', async () => {
		now = new Date();
		const files = new Map(), directories = new Map(), snapshots = new Map();
		let failAfter = Infinity;
		const put = async data => {
			if (--failAfter <= 0) {
				throw new Error('fake_storage_outage');
			}
			const value = Buffer.from(data), id = CID.createV1(0x55, await sha256.digest(value)).toString();
			files.set(id, value); return {id};
		};
		app.ms.storage = {
			node: {files: {rm: async path => {
				for (const key of directories.keys()) {
					if (key === path || key.startsWith(path + '/')) {
						directories.delete(key);
					}
				}
			}}},
			getFileStream: async path => {
				const [root, ...parts] = path.split('/');
				return Readable.from([files.get(snapshots.get(root)?.[parts.join('/')])]);
			},
			saveFileByData: put,
			getFileStat: async source => {
				const [root, ...leaf] = String(source).split('/');
				return {type: snapshots.has(root) && !leaf.length ? 'directory' : 'file'};
			},
			makeDir: async path => {
				if (!directories.has(path)) {
					directories.set(path, new Map());
				}
			},
			copyFileFromId: async (id, path) => {
				if (Number.isFinite(failAfter) && --failAfter <= 0) {
					throw new Error('fake_storage_outage');
				}
				const parts = path.split('/'), [root, ...leaf] = String(id).split('/');
				const source = leaf.length ? snapshots.get(root)?.[leaf.join('/')] : root;
				directories.get('/' + parts[1]).set(parts.slice(2).join('/'), source);
			},
			getDirectoryId: async path => { const entries = Object.fromEntries(directories.get(path)); const {id} = await put(JSON.stringify(entries)); snapshots.set(id, entries); return id; }
		};
		const readGateway = method => async (req, res) => {
			const [root, ...parts] = req.route.replace('/ipfs/', '').split('/');
			if (!await membership.isStorageIdAllowed(root)) {
				return res.send({}, 423);
			}
			const key = parts.join('/');
			const file = snapshots.has(root) ? snapshots.get(root)?.[!key || key.endsWith('/') ? key + 'index.html' : key] : root;
			const bytes = files.get(file);
			if (!bytes) {
				return res.send({}, 404);
			}
			res.setHeader('Content-Type', 'text/html; charset=utf-8');
			res.setHeader('Cache-Control', 'public, max-age=3600');
			res.stream.end(method === 'HEAD' ? undefined : bytes);
		};
		api.onUnversionGet('/ipfs/*', readGateway('GET'));
		api.onUnversionHead('/ipfs/*', readGateway('HEAD'));
		const iconCid = (await put('PUBLISHED-ICON-BYTES')).id;
		const group = await models.Group.create({name: 'snapshots', creatorId: owner.id, title: 'Snapshots', isPublic: false, isEncrypted: false, isOpen: false});
		await membership.provisionSite(owner.id, {id: 'snapshots', origin: 'https://snapshots.test', groupId: String(group.id), ownerId: owner.id,
			googleClientId: 'existing-google-client', enabled: true, registrationEnabled: true, postsEnabled: true, version: 0,
			links: [{label: 'X', url: 'https://x.com/creator', iconUrl: `/ipfs/${iconCid}`} ]});
		const previewCid = (await put('PUBLIC-PREVIEW-BYTES')).id, fullCid = (await put('FULL-MEDIA-BYTES')).id;
		const previewRoot = (await put('NESTED-PREVIEW-DIRECTORY')).id;
		snapshots.set(previewRoot, {'preview.png': previewCid, 'paid.png': fullCid});
		const metadata = {title: 'Snapshot post', teaser: 'PUBLIC-TEASER', fullText: 'FIRST-PAID-TEXT', free: false, previewMedia: [{url: `https://snapshots.test/ipfs/${previewRoot}/preview.png`}], previewCount: 1};
		const post = await models.Post.create({name: 'snapshots-post', groupId: group.id, userId: owner.id, status: 'published', publishedAt: now,
			propertiesJson: JSON.stringify({membership: metadata})});
		publicationContents.set(String(post.id), [{id: 999, storageId: fullCid, mimeType: 'image/png', name: 'Full picture', postsContents: {isPrivate: true}}, {id: 998, storageId: previewCid, mimeType: 'image/png', name: 'Public picture', postsContents: {isPrivate: false}}]);
		const get = (path, options: any = {}) => request(path, {site: 'snapshots.test', ...options});
		const enqueue = key => request('membership/admin/snapshots/publications', {token: 'test-owner', body: {requestKey: key}});
		const accepted = await enqueue('snapshot-one');
		assert.equal(accepted.status, 200);
		assert.equal((await enqueue('snapshot-one')).body.id, accepted.body.id);
		assert.equal((await request('membership/admin/snapshots/publications', {token: 'test-other-owner', body: {requestKey: 'foreign'}})).status, 403);
		await membership.runPublications();
		assert.equal((await request('membership/admin/snapshots/publication', {token: 'test-owner'})).body.status, 'ready');
		assert(await membership.isStorageIdAllowed(iconCid), 'published icons are retained as snapshot artifacts');
		const iconSelection = await get('membership/site/');
		const iconHtml = (await request(new URL(iconSelection.headers.get('location')).pathname)).body;
		assert(iconHtml.includes(`src="/ipfs/${iconCid}"`));
		assert.equal((await request(`/ipfs/${iconCid}`)).body, 'PUBLISHED-ICON-BYTES');
		const beforeUnrelated = (await membershipModels.resources.findByPk('snapshots')).data.publication;
		const unrelated = await models.Post.create({name: 'unrelated', groupId: 1, userId: owner.id, status: 'published', publishedAt: now});
		await models.Post.update({name: 'unrelated-renamed'}, {where: {id: unrelated.id}});
		await models.Post.destroy({where: {id: unrelated.id}});
		assert.deepEqual((await membershipModels.resources.findByPk('snapshots')).data.publication, beforeUnrelated, 'unrelated bulk edits and deletes never invalidate this site');
		await models.Post.update({name: 'snapshots-post-renamed'}, {where: {id: post.id}});
		assert.equal((await membershipModels.resources.findByPk('snapshots')).data.publication.sourceVersion, beforeUnrelated.sourceVersion + 1, 'targeted bulk edits invalidate the owning resource');
		await membership.runPublications();
		await models.Group.update({title: 'Renamed snapshot site'}, {where: {id: group.id}});
		await membership.runPublications();
		await models.Group.update({description:'Creator profile description'}, {where:{id:group.id}});
		await membership.runPublications();
		const renamedSelection = await get('membership/site/');
		assert((await request(new URL(renamedSelection.headers.get('location')).pathname)).body.includes('Renamed snapshot site'), 'group title changes rebuild static HTML');
		assert((await request(new URL(renamedSelection.headers.get('location')).pathname)).body.includes('Creator profile description'));
		const renamedResource = await membershipModels.resources.findByPk('snapshots');
		const settings = await membership.siteSettings(owner.id, 'snapshots');
		await membership.saveSiteSettings(owner.id, 'snapshots', {version: settings.version, enabled: settings.enabled, registrationEnabled: settings.registrationEnabled, googleClientId: settings.googleClientId, postsEnabled: settings.postsEnabled, coverUrl: 'https://snapshots.test/cover.png'});
		const brandedState = (await membershipModels.resources.findByPk('snapshots')).data.publication;
		assert.equal(brandedState.publicationId, renamedResource.data.publication.publicationId, 'branding keeps the current pair available');
		assert.equal(brandedState.sourceVersion, renamedResource.data.publication.sourceVersion + 1, 'branding requests a new source revision');
		await membership.runPublications();
		const month = await membershipModels.options.findOne({where:{resourceId:'snapshots',period:'month'}});
		const beforeTariff = (await membership.resource('snapshots')).data.publication;
		await membership.saveOption('snapshots',{id:month.id,version:month.version,label:month.label,period:month.period,amountCents:500,enabled:true});
		assert.equal((await membership.resource('snapshots')).data.publication.sourceVersion,beforeTariff.sourceVersion+1);
		await membership.runPublications();
		const client = await get('membership/site/client.js');
		assert.equal(client.status, 200);
		assert.equal(client.headers.get('content-type'), 'application/javascript; charset=utf-8');
		assert.equal(client.headers.get('x-content-type-options'), 'nosniff');
		assert.equal(client.body, readFileSync(new URL('../app/modules/staticSiteGenerator/site/public/membership.js', import.meta.url), 'utf8'));
		const publicSelection = await get('membership/site/');
		assert.equal(publicSelection.status, 302);
		assert.equal(publicSelection.headers.get('cache-control'), 'private, no-store');
		const publicLocation = publicSelection.headers.get('location');
		const read = async url => get(new URL(url).pathname);
		assert((await read(publicLocation)).body.includes('PUBLIC-TEASER'));
		assert.equal((await get('membership/site/view?x=1')).headers.get('location'), 'view/?x=1');
		const stable = await get('membership/site/view/');
		assert.equal(stable.status, 200);
		assert.equal(stable.headers.get('location'), undefined);
		assert(stable.body.includes('PUBLIC-TEASER'));
		assert(stable.body.includes('rel="canonical" href="https://snapshots.test/"'));
		assert(!stable.body.includes('FIRST-PAID-TEXT'));
		assert.equal(stable.headers.get('cache-control'), 'private, no-store');
		assert.equal((await get('membership/site/view/', {method: 'HEAD'})).body, null);
		assert.equal((await get('membership/site/page/0/')).status, 404);
		assert.equal((await get('membership/site/view/page/0/')).status, 404);
		assert.equal((await get('membership/site/view/', {headers: {'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}})).status, 200);
		assert.equal((await get('membership/site/view/', {headers: {'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'cors'}})).status, 403);
		assert.equal((await get('membership/site/view/media/' + 'f'.repeat(64) + '.png')).status, 404);
		assert.equal((await get('membership/site/view/style.css?v=1')).headers.get('content-type'), 'text/css; charset=utf-8');
		assert.equal((await get('membership/site/view/public/client.js?v=1')).headers.get('content-type'), 'application/javascript; charset=utf-8');
		assert((await get('membership/site/view/account/?x=1')).body.includes('Checking your account'));

		assert(!(await read(publicLocation)).body.includes('FIRST-PAID-TEXT'));
		const publicRoot = new URL(publicLocation).pathname.split('/')[2];
		const publicFiles = snapshots.get(publicRoot);
		assert(Object.values(publicFiles).includes(previewCid));
		assert(!Object.values(publicFiles).includes(previewRoot), 'preview publication copies the exact selected leaf, not its paid parent directory');
		assert(!Object.values(publicFiles).includes(fullCid));
		const boundResource = await membershipModels.resources.findByPk('snapshots');
		const savedBinding = JSON.parse(JSON.stringify(boundResource.data));
		const headManifest = await membership.publicationView('snapshots');
		const legacyJob = await membershipModels.publications.create({id:randomUUID(),resourceId:'snapshots',requestKey:'legacy-path-check',status:'ready',manifest:{public:headManifest.public,full:headManifest.full,pageCount:2,posts:headManifest.posts}});
		await boundResource.update({data:{...savedBinding,publication:{...savedBinding.publication,publicationId:legacyJob.id}}});
		assert((await get('membership/site/')).headers.get('location').endsWith('/index.html'));
		assert((await get('membership/site/?page=2')).headers.get('location').endsWith('/page-2.html'));
		assert((await get(`membership/site/posts/${post.id}/`)).headers.get('location').endsWith(`/posts/${post.id}.html`));
		await boundResource.update({data:savedBinding});
		const publicFeed = await get('membership/feed');
		assert(!JSON.stringify(publicFeed.body).includes(previewRoot), 'public API also conceals a selected preview parent CID');
		assert(publicFeed.body.posts[0].previews[0].startsWith(`/ipfs/${publicRoot}/media/`));


		const loginResult = await login('snapshots.test', {sub: 'snapshot-buyer'}), cookie = loginResult.cookie, readerId = loginResult.body.reader.id;
		assert.equal((await get('membership/site/', {cookie})).headers.get('location'), publicLocation);
		await membershipModels.periods.create({id: randomUUID(), resourceId: 'snapshots', readerId, invoiceId: randomUUID(), anchorDay: 1,
			startsAt: new Date(now.getTime() - 1000), endsAt: new Date(now.getTime() + 60000), revoked: false});
		const stranger = await login('snapshots.test', {sub: 'different-site-buyer'});
		await membershipModels.periods.create({id: randomUUID(), resourceId: 'wave', readerId: stranger.body.reader.id, invoiceId: randomUUID(), anchorDay: 1,
			startsAt: new Date(now.getTime() - 1000), endsAt: new Date(now.getTime() + 60000), revoked: false});
		assert.equal((await get('membership/site/', {cookie: stranger.cookie})).headers.get('location'), publicLocation, 'payment for another resource is insufficient');
		const paidLocation = (await get('membership/site/', {cookie})).headers.get('location');
		const fullStable = await get('membership/site/view/', {cookie});
		assert(fullStable.body.includes('FIRST-PAID-TEXT'));
		assert.equal(fullStable.headers.get('x-robots-tag'), 'noindex, nofollow');

		assert.notEqual(paidLocation, publicLocation); assert((await read(paidLocation)).body.includes('FIRST-PAID-TEXT'));
		assert.equal((await get('membership/site/', {cookie, method: 'HEAD'})).headers.get('location'), paidLocation);
		assert.equal((await get('membership/site/', {cookie: meatCookie})).headers.get('location'), publicLocation);
		assert.equal((await get('membership/site/', {headers: {Origin: 'https://foreign.test'}})).status, 403);
		assert.equal((await get('membership/site/', {cookie: '__Host-geesome_session=forged'})).headers.get('location'), publicLocation);
		const oldPost = (await get(`membership/site/posts/${post.id}/`, {cookie})).headers.get('location');
		assert((await read(oldPost)).body.includes('FIRST-PAID-TEXT'));
		assert((await read(oldPost)).body.includes(`../../media/${publicationDigest(fullCid)}.png`));
		assert.equal((await read(new URL(`../../media/${publicationDigest(fullCid)}.png`, oldPost).href)).body, 'FULL-MEDIA-BYTES');
		assert(!(await read(publicLocation)).body.includes(fullCid));


		assert(!(await read(publicLocation)).body.includes(new URL(paidLocation).pathname.split('/')[2]), 'public HTML contains no full root CID');
		await post.update({propertiesJson: JSON.stringify({membership: {...metadata, fullText: 'SECOND-PAID-TEXT'}})});
		await membership.runPublications();
		const newerPaid = (await get('membership/site/', {cookie})).headers.get('location');
		assert.notEqual(newerPaid, paidLocation); assert((await read(newerPaid)).body.includes('SECOND-PAID-TEXT'));
		assert((await read(paidLocation)).body.includes('FIRST-PAID-TEXT'), 'old snapshot does not change with canonical post');
		now = new Date(now.getTime() + 120000);
		const expiredSelection = await get('membership/site/', {cookie, headers: {Range: 'bytes=0-1', 'If-None-Match': '*'}});
		assert.equal(expiredSelection.status, 302); assert.notEqual(expiredSelection.headers.get('location'), newerPaid);
		assert((await read(paidLocation)).body.includes('FIRST-PAID-TEXT'), 'known paid CID remains readable after expiry');
		assert((await read(newerPaid)).body.includes('SECOND-PAID-TEXT'), 'known newer CID is also retained');
		await membershipModels.periods.update({endsAt: new Date(now.getTime() + 60000)}, {where: {resourceId: 'snapshots', readerId}});
		assert.equal((await get('membership/site/', {cookie})).headers.get('location'), newerPaid);
		await membershipModels.periods.update({revoked: true}, {where: {resourceId: 'snapshots', readerId}});
		assert.notEqual((await get('membership/site/', {cookie})).headers.get('location'), newerPaid, 'refund/revocation stops new full selection');
		assert.equal((await read(oldPost)).status, 200, 'obtained old post and files remain readable');
		assert.equal((await read(new URL(`../../media/${publicationDigest(fullCid)}.png`, oldPost).href)).body, 'FULL-MEDIA-BYTES');

		const oldHead = (await membershipModels.resources.findByPk('snapshots')).data.publication.publicationId;
		const readyDirectories = [...directories.keys()];
		failAfter = 2;
		await enqueue('fault-half-build'); await membership.runPublications();
		assert.equal((await membershipModels.resources.findByPk('snapshots')).data.publication.publicationId, oldHead, 'partial pair cannot replace current revision');
		assert.deepEqual([...directories.keys()], readyDirectories, 'failed attempt removes only its own staging directories');
		for (let attempt = 0; attempt < 3; attempt++) {
			now = new Date(now.getTime() + 360000);
			await membership.runPublications();
		}
		const retrying = await membershipModels.publications.findOne({where: {resourceId: 'snapshots', requestKey: 'fault-half-build'}});
		assert(retrying.attempts >= 4);
		assert.equal(retrying.status, 'queued', 'temporary outages do not permanently fail a source revision after three attempts');

		failAfter = Infinity;
		now = new Date(now.getTime() + 360000);
		await membership.runPublications();
		assert.equal((await retrying.reload()).status, 'ready', 'storage recovery resumes the existing durable job without another source edit');
		await post.update({propertiesJson: JSON.stringify({membership: {...metadata, hidden: true}})});
		await membership.runPublications();
		assert(!(await read((await get('membership/site/')).headers.get('location'))).body.includes('Snapshot post'));
		assert.equal((await get(`membership/site/posts/${post.id}/`)).status, 404);
		assert.equal((await read(paidLocation)).status, 200, 'hiding/deleting source does not revoke obtained CID');
		await membershipModels.site_settings.update({enabled: false}, {where: {resourceId: 'snapshots'}});
		assert.equal((await get('membership/site/')).status, 404);
		assert.equal((await read(paidLocation)).status, 200, 'site disable stops selection, retains immutable old files');
		const rotating = [];
		for (let index = 0; index < 6; index++) {
			const id = `rotate${index}`;
			const newGroup = await models.Group.create({name: id, creatorId: owner.id, title: id, isPublic: false, isEncrypted: false, isOpen: false});
			await membership.provisionSite(owner.id, {id, origin: `https://${id}.test`, groupId: String(newGroup.id), ownerId: owner.id,
				googleClientId: '', enabled: true, registrationEnabled: false, postsEnabled: true, version: 0});
			const placeholder = await membershipModels.publications.create({id: randomUUID(), resourceId: id, requestKey: 'placeholder', status: 'ready', sourceVersion: 0, manifest: {pages: [], posts: []}});
			await membershipModels.resources.update({data: {publication: {publicationId: placeholder.id, sourceVersion: 0}}}, {where: {id}});
			await membership.invalidateGroup(newGroup.id);
			rotating.push(id);
		}
		for (let index = 0; index < 8; index++) {
			await membership.runPublications();
		}
		for (const id of rotating) {
			const head = await membershipModels.resources.findByPk(id), job = await membershipModels.publications.findByPk(head.data.publication.publicationId);
			assert.equal(job.sourceVersion, 1, 'targeted invalidation queues every changed resource without head scanning');
		}
		const recovered = await membershipModels.publications.create({id: randomUUID(), resourceId: 'rotate0', requestKey: 'recover-lease', status: 'building',
			leaseToken: randomUUID(), leaseUntil: new Date(now.getTime() - 1)});
		const orphan = `/membership-${recovered.id}-${recovered.leaseToken}-public`;
		await app.ms.storage.makeDir(orphan);
		await recovered.update({stagingPaths: [orphan]});
		await membership.runPublications();
		assert(!directories.has(orphan), 'reclaimed crash removes the previous attempt staging directory');
		assert.equal((await recovered.reload()).status, 'ready', 'an expired build lease is recoverable after restart');
		const copyNormally = app.ms.storage.copyFileFromId;
		let releaseWrite, writeStarted;
		const blocked = new Promise(resolve => { writeStarted = resolve; });
		app.ms.storage.copyFileFromId = async (id, path) => {
			if (releaseWrite === undefined) {
				await new Promise(resolve => { releaseWrite = resolve; writeStarted(); });
			}
			return copyNormally(id, path);
		};
		const slow = await membership.enqueuePublication(owner.id, 'rotate0', {requestKey: 'slow-storage'});
		const previousSlowHead = (await membershipModels.resources.findByPk('rotate0')).data.publication.publicationId;
		const work = membership.runPublications();
		try {
			await blocked;
			now = new Date(now.getTime() + 90000);
			await new Promise(resolve => setTimeout(resolve, 60));
			now = new Date(now.getTime() + 60000);
			const leased = await membershipModels.publications.findByPk(slow.id);
			assert(new Date(leased.leaseUntil) > now, 'heartbeat keeps a healthy slow storage build from being reclaimed');
			const changedGroup = await membershipModels.resources.findByPk('rotate0');
			await models.Group.update({title: 'Changed during render'}, {where: {id: changedGroup.groupId}});
		} finally {
			releaseWrite?.();
			await work;
			app.ms.storage.copyFileFromId = copyNormally;
		}
		assert.equal((await membershipModels.publications.findByPk(slow.id)).status, 'queued', 'a source change during build rejects the incomplete revision');
		assert.equal((await membershipModels.resources.findByPk('rotate0')).data.publication.publicationId, previousSlowHead);
		await membership.runPublications();
		const changed = await membershipModels.resources.findByPk('rotate0');
		const rebuilt = await membershipModels.publications.findByPk(changed.data.publication.publicationId);
		assert.equal(rebuilt.sourceVersion, changed.data.publication.sourceVersion);
		assert(files.get(snapshots.get(rebuilt.manifest.public)['index.html']).toString().includes('Changed during render'));

		await membershipModels.publications.update({status: 'failed'}, {where: {status: 'queued'}});
		const serialNormally = membership.serial;
		let commitFinished;
		membership.serial = async (id, work) => {
			let reachedCommit;
			const beforeCommit = new Promise(resolve => { reachedCommit = resolve; });
			commitFinished = serialNormally(id, async (row, transaction) => {
				const result = await work(row, transaction);
				reachedCommit();
				await new Promise(resolve => setTimeout(resolve, 60));
				return result;
			});
			await beforeCommit;
			throw new Error('commit_response_lost_while_transaction_in_flight');
		};
		try {
			const ambiguous = await membership.enqueuePublication(owner.id, 'rotate0', {requestKey: 'ambiguous-commit'});
			await membership.runPublications();
			await commitFinished;
			const committed = await membershipModels.publications.findByPk(ambiguous.id);
			assert.equal(committed.status, 'ready');
			assert.equal(committed.stagingPaths.length, 2);
			for (const directory of committed.stagingPaths) {
				assert(directories.has(directory), 'cleanup waits for an in-flight commit and retains ready directories');
			}
		} finally {
			membership.serial = serialNormally;
		}


	});

	it('builds self-contained immutable snapshot directories on real Kubo without publishing preview siblings', async function () {
		if (!process.env.CREATOR_MEMBERSHIP_TEST_IPFS_URL) {
			this.skip();
		}
		const previous = app.ms.storage;
		const storage = new JsIpfsServiceNode(createKuboClient({url: process.env.CREATOR_MEMBERSHIP_TEST_IPFS_URL}), 'kubo-rpc');
		app.ms.storage = storage;
		try {
			const preview = await storage.saveFileByData('PREVIEW-BYTES', {waitForPin: true});
			const paid = await storage.saveFileByData('PAID-BYTES', {waitForPin: true});
			const publicText = await storage.saveFileByData('PUBLIC ATTACHMENT TEXT');
			const privateText = await storage.saveFileByData('PRIVATE ATTACHMENT TEXT');
			const archive = await storage.saveFileByData('PUBLIC ARCHIVE BYTES');
			const directory = `/source-${randomUUID()}`;
			await storage.makeDir(directory);
			await storage.copyFileFromId(preview.id, directory + '/preview.png');
			await storage.copyFileFromId(paid.id, directory + '/paid.png');
			const originalRoot = await storage.getDirectoryId(directory);
			const galleryUri = await storage.saveFileByData(`/ipfs/${originalRoot}/#/`);
			const extraLinks = await storage.saveFileByData(`# Two resources\r\nipfs://${originalRoot}/manual.pdf#page=2\r\nipfs://${originalRoot}/source.zip\r\n`);
			const group = await models.Group.create({name: 'real-storage', creatorId: owner.id, title: 'Real storage', isPublic: false, isEncrypted: false, isOpen: false});
			await membership.provisionSite(owner.id, {id: 'real-storage', origin: 'https://real-storage.test', groupId: String(group.id), ownerId: owner.id,
				googleClientId: '', enabled: true, registrationEnabled: false, postsEnabled: true, version: 0});
			const metadata = {title: 'Retained gallery', teaser: 'Preview', fullText: 'Old full text', free: false,
				pageUrl: `https://real-storage.test/ipfs/${originalRoot}/`, previewMedia: [{url: `https://real-storage.test/ipfs/${originalRoot}/preview.png`}], previewCount: 1};
			const post = await models.Post.create({name: 'real-gallery', groupId: group.id, userId: owner.id, status: 'published', publishedAt: now, propertiesJson: JSON.stringify({membership: metadata})});
			publicationContents.set(String(post.id), [{id: 2000, storageId: String(preview.id), mimeType: 'image/png', postsContents: {isPrivate: false}}, {id: 2001, storageId: String(paid.id), mimeType: 'image/png', postsContents: {isPrivate: true}}, {id: 2002, storageId: String(publicText.id), mimeType: 'text/plain', postsContents: {isPrivate: false}}, {id: 2003, storageId: String(privateText.id), mimeType: 'text/plain', postsContents: {isPrivate: true}}, {id: 2004, storageId: String(archive.id), mimeType: 'application/zip', name: 'Download archive', postsContents: {isPrivate: false}}, {id: 2005, storageId: String(galleryUri.id), mimeType: 'text/uri-list', postsContents: {isPrivate: true}}, {id: 2006, storageId: String(extraLinks.id), mimeType:'text/uri-list', name:'Resources', postsContents:{isPrivate:true}}]);
			await membership.enqueuePublication(owner.id, 'real-storage', {requestKey: 'real-kubo'});
			await membership.runPublications();
			const status = await membership.publicationStatus(owner.id, 'real-storage');
			assert.equal(status.status, 'ready', JSON.stringify(status));
			const job = await membershipModels.publications.findByPk(status.revision);
			const publicPath = `${job.manifest.public}/index.html`;
			const fullPath = `${job.manifest.full}/index.html`;
			const publicRoot = publicPath.split('/')[0], fullRoot = fullPath.split('/')[0];
			const publicHtml = await storage.getFileDataText(publicPath);
			assert(!publicHtml.includes(originalRoot));
			assert(!publicHtml.includes(String(galleryUri.id)));
			assert((await storage.getFileDataText(fullPath)).includes(`href="/ipfs/${originalRoot}/#/"`));
			assert((await storage.getFileDataText(`${fullRoot}/posts/${post.id}/index.html`)).includes(`href="/ipfs/${originalRoot}/#/"`));
			assert(await membershipModels.publication_artifacts.findByPk(originalRoot));
			assert((await storage.getFileDataText(fullPath)).includes(`/ipfs/${originalRoot}/manual.pdf#page=2`));
			assert((await storage.getFileDataText(fullPath)).includes(`/ipfs/${originalRoot}/source.zip`));
			assert(!publicHtml.includes('manual.pdf'));
			assert(!publicHtml.includes('source.zip'));
			await assert.rejects(() => storage.getFileDataText(`${fullRoot}/media/${publicationDigest(String(galleryUri.id))}.uri`), /not exist|not found|no link/i);
			assert(!publicHtml.includes('Old full text'));
			const previewFiles = [];
			for await (const item of storage.node.ls(`/ipfs/${publicRoot}/media`)) {
				previewFiles.push(item.cid.toString());
			}
			assert.deepEqual(new Set(previewFiles), new Set([String(preview.id), String(publicText.id), String(archive.id)]));
			assert(publicHtml.includes('PUBLIC ATTACHMENT TEXT'));
			assert(!publicHtml.includes('PRIVATE ATTACHMENT TEXT'));
			assert((await storage.getFileDataText(`${fullRoot}/posts/${post.id}/index.html`)).includes('PRIVATE ATTACHMENT TEXT'));
			assert.equal(job.manifest.posts[String(post.id)].length, 1, 'feed thumbnails include image attachments only');
			const directories = [];
			for await (const entry of storage.node.ls(`/ipfs/${fullRoot}`)) {
				directories.push(entry.name);
			}
			assert(!directories.includes('sets'), 'all exports derive from attachments without a legacy gallery directory');
			assert.equal(await storage.getFileDataText(`${fullRoot}/media/${publicationDigest(String(paid.id))}.png`), 'PAID-BYTES');
			assert.equal(await storage.getFileDataText(`${publicRoot}/media/${publicationDigest(String(archive.id))}.zip`), 'PUBLIC ARCHIVE BYTES');
			assert((await storage.getFileDataText(fullPath)).includes('Old full text'));
			await post.update({propertiesJson: JSON.stringify({membership: {...metadata, fullText: 'New full text'}})});
			for (let attempt = 0; attempt < 10; attempt++) {
				await membership.runPublications();
				const active = await membershipModels.resources.findByPk('real-storage');
				if (active.data.publication.publicationId !== status.revision) {
					break;
				}
			}
			const current = await membership.publicationStatus(owner.id, 'real-storage');
			const newJob = await membershipModels.publications.findByPk(current.revision);
			assert.notEqual(newJob.manifest.full, job.manifest.full, JSON.stringify(current));
			assert((await storage.getFileDataText(fullPath)).includes('Old full text'));
			assert.equal(await storage.getFileDataText(`${fullRoot}/media/${publicationDigest(String(paid.id))}.png`), 'PAID-BYTES');
			assert.equal(await storage.getFileDataText(`${publicRoot}/media/${publicationDigest(String(archive.id))}.zip`), 'PUBLIC ARCHIVE BYTES');
			assert.equal(await membership.isStorageIdAllowed(fullRoot), true);
		} finally {
			app.ms.storage = previous;
		}
	});


	it('persists per-post attachment visibility, preserves it across edits, and upgrades legacy rows conservatively', async () => {
		const groupModule = createGroupModule(app, models);
		const publicGroup = await models.Group.create({name: 'visibility-public', creatorId: owner.id, isPublic: true});
		const privateGroup = await models.Group.create({name: 'visibility-private', creatorId: owner.id, isPublic: false});
		const first = await models.Post.create({groupId: publicGroup.id, userId: owner.id, status: 'published'});
		const second = await models.Post.create({groupId: privateGroup.id, userId: owner.id, status: 'published'});
		const shared = await models.Content.create({userId: owner.id, mimeType: 'image/png', storageId: 'shared-visibility-content'});
		const extra = await models.Content.create({userId: owner.id, mimeType: 'image/png', storageId: 'extra-visibility-content'});
		await groupModule.setPostContents(first.id, [{id: shared.id, isPrivate: false}]);
		await groupModule.setPostContents(second.id, [{id: shared.id, isPrivate: true}, {id: extra.id}]);
		assert.equal((await models.PostsContents.findOne({where: {postId: first.id, contentId: shared.id}})).isPrivate, false);
		assert.equal((await models.PostsContents.findOne({where: {postId: second.id, contentId: shared.id}})).isPrivate, true);
		assert.equal((await models.PostsContents.findOne({where: {postId: second.id, contentId: extra.id}})).isPrivate, true, 'unmarked attachments in a private group default private');
		await groupModule.setPostContents(second.id, [{id: extra.id}, {id: shared.id, isPrivate: false}]);
		await groupModule.setPostContents(second.id, [{id: extra.id}, {id: shared.id}]);
		assert.equal((await models.PostsContents.findOne({where: {postId: second.id, contentId: shared.id}})).isPrivate, false, 'ordinary edits preserve the saved attachment policy');
		assert.throws(() => groupModule.resolveContentForPostData({isPrivate: 'false'} as any, shared, 'owner' as any), (error: any) => error.status === 400 && error.code === 'attachment_visibility_invalid');
		await db.query('ALTER TABLE "postsContents" DROP COLUMN "isPrivate"');
		const migration = createRequire(import.meta.url)('../app/modules/group/migrations/20261027000000-add-post-attachment-visibility.cjs');
		await migration.up(db.getQueryInterface());
		assert.equal((await models.PostsContents.findOne({where: {postId: first.id}})).isPrivate, false);
		assert.equal((await models.PostsContents.findOne({where: {postId: second.id}})).isPrivate, true);
		await models.PostsContents.update({isPrivate: false}, {where: {postId: second.id}});
		await migration.up(db.getQueryInterface());
		assert.equal((await models.PostsContents.findOne({where: {postId: second.id}})).isPrivate, false, 'a repeated migration never resets explicit public choices');
	});

});
describe('creator module input boundaries', () => {
	it('rejects Google login when the configured site has no client ID', async () => {
		const app = { config: {}, ms: { database: { sequelize: {} } } };
		const google = createGoogleAuthorization(app, {});
		await assert.rejects(google.challenge({ headers: {} }, { id: 'wave' }), /google_login_not_configured/);
	});
	it('rejects unconfigured sites', async () => {
		const app = { ms: { membership: { resolveSite: async () => null } } };
		await assert.rejects(configuredSite(app, { headers: { host: 'eraofwave.com' } }), /membership_site_not_found/);
	});

});
