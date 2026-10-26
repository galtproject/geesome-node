import assert from 'node:assert/strict';
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
	let db, app, identityModels, membershipModels, paymentModels, models, google, membership, payments, owner, otherOwner;
	let api, base;
	let now = new Date();
	const transfers = new Map<string, any[]>();
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
	async function request(path, { site = 'wave', cookie = '', body, token, origin, headers = {} }: any = {}) {
		const host = site === 'meat' ? 'eraofmeat.com' : site === 'wave' ? 'eraofwave.com' : site;
		return new Promise<any>((resolve, reject) => {
			const req = httpRequest(`${base}/v1/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: {
					Host: host, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin || `https://${host}` }),
					...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers
				} }, response => {
				let text = '';
				response.setEncoding('utf8');
				response.on('data', chunk => { text += chunk; });
				response.on('end', () => resolve({ status: response.statusCode, body: text ? JSON.parse(text) : null,
					cookies: response.headers['set-cookie'] || [], headers: { get: key => response.headers[key.toLowerCase()] } }));
			});
			req.on('error', reject);
			req.end(body === undefined ? undefined : JSON.stringify(body));
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
		await models.CorePermission.create({ userId: otherOwner.id, name: CorePermissionName.UserGroupManagement, isActive: true });
		const wave = await models.Group.create({ name: 'wave', creatorId: owner.id, title: 'Era Of Wave', isPublic: false, isEncrypted: false, isOpen: false });
		const meat = await models.Group.create({ name: 'meat', creatorId: otherOwner.id, title: 'Era Of Meat', isPublic: false, isEncrypted: false, isOpen: false });
		const sites = [{ id: 'wave', origin: 'https://eraofwave.com', groupId: wave.id, ownerId: owner.id }, { id: 'meat', origin: 'https://eraofmeat.com', groupId: meat.id, ownerId: otherOwner.id }]
			.map(site => ({ ...site, googleClientId: 'existing-google-client', postsEnabled: true, registrationEnabled: true }));
		app = { config: { domain: 'localhost', apiConfig: {}, googleAuthorizationConfig: { enabled: true }, paymentsConfig: { worker: false }, membershipConfig: { enabled: true, sites } }, ms: { database: { sequelize: db, models } },
			checkModules(names) {
				for (const name of names) {
					assert(this.ms[name]);
				}
			},
			async checkUserCan(userId, permission) {
				if (!await models.CorePermission.findOne({ where: { userId, name: permission, isActive: true } })) {
					throw new Error('not_permitted');
				}
			},
			runWithApiKey: (_key, callback) => callback(),
			getUserByApiToken: async (token) => ({ user: token === 'test-owner' ? owner : token === 'test-other-owner' ? otherOwner : token === 'test-reader' ? await models.User.findByPk(waveReader.userId) : null, apiKey: { permissions: '[]' } }) };
		// Group adapters use real production models; no IPFS publication is involved.
		app.ms.group = {
			getLocalGroup: async (userId, id) => {
				const group = await models.Group.findByPk(id);
				assert.equal(group.creatorId, userId);
				return group;
			},
			getGroupPosts: async (groupId, filters, pagination) => ({ list: await models.Post.findAll({ where: { groupId, isDeleted: false, status: filters.status }, order: [['publishedAt', 'DESC'], ['id', 'DESC']], limit: pagination.limit, offset: pagination.offset }) }),
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
		membership = createMembership(app, membershipModels, { clock: () => now });
		app.ms.membership = membership;
		await membership.bootstrap();
		payments.configureLedger({ models: membership.models, resource: membership.resource, serial: membership.serial,
			grantPaidInvoice: membership.grantPaidInvoice, clock: () => now, fail: siteProblem });
		api = await createApi(app, { host: '127.0.0.1', port: 23000 + Math.floor(Math.random() * 10000), registerRoutes: (_app, module) => {
				app.ms.api = module;
				registerGoogle(app, google);
				registerPayments(app, payments);
				registerMembership(app, membership);
				module.onAuthorizedPost('test/upload', async (_req, res) => res.send({ ok: true }), { storageReadOnly: true });
			} });
		base = `http://127.0.0.1:${api.port}`;
	});
	after(async () => {
		await api?.stop();
		await payments?.stop();
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
		const guest = await request('membership/feed');
		assert.equal(guest.status, 200);
		assert.equal(guest.body.posts[0].locked, true);
		assert.equal(guest.body.posts[0].pageUrl, undefined);
		assert(!JSON.stringify(guest.body).includes('bafyprivate'));
		assert(!JSON.stringify(guest.body).includes('never-export'));
		assert.equal((await request('membership/feed', { cookie: waveCookie })).body.posts[0].pageUrl, 'https://eraofwave.com/ipfs/bafyprivate/');
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
});
describe('creator module input boundaries', () => {
	it('rejects disabled sites', () => {
		const app = { config: { membershipConfig: { enabled: false, sites: [] } } };
		assert.throws(() => configuredSite(app, { headers: { host: 'eraofwave.com' } }), /membership_site_not_found/);
	});
});
