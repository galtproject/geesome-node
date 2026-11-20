import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {createServer} from 'node:http';
import clientReleases, {getModule} from '../app/modules/clientReleases/index.js';
import {configuredReleaseKey, officialReleasePublicKey} from '../app/modules/clientReleases/trust.js';
import {verifyReleaseEnvelope} from '../app/modules/clientReleases/manifest.js';
import {importClientRelease} from '../app/modules/clientReleases/import.js';
import {Readable} from 'node:stream';

const pair = generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({type: 'spki', format: 'pem'}).toString();
const bytes = Buffer.from('MZ signed mirrored installer');
const cid = 'QmYwAPJzv5CZsnAzt8auVZRnGi6Rc1Bhm1NYEG6KzGyf8a';
function envelope(version = '1.2.0') {
	const data = Buffer.from(JSON.stringify({schemaVersion: 1, version, platform: 'windows-x64', cid,
		sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length}));
	return {manifest: data.toString('base64'), signature: sign(null, data, pair.privateKey).toString('base64')};
}

function fixture(options: any = {}) {
	let target = options.current || null;
	const selected = options.envelope || envelope();
	const calls: any[] = [];
	const response = (data, status = 200) => Response.json(data, {status});
	const fetchImpl = async (address, settings: any = {}) => {
		const url = new URL(address);
		calls.push({url: url.href, settings});
		assert.equal(settings.redirect, 'error');
		if (settings.method !== 'POST') {
			assert.equal(settings.headers?.authorization, undefined, 'public/source requests must not receive the operator key');
		}
		if (url.pathname === '/.well-known/geesome') {
			if (options.prefixFallback) {
				return response({}, 404);
			}
		}
		if (url.pathname.endsWith('/.well-known/geesome')) {
			return response({apiBaseUrl: `${url.origin}/prefix/v1`, capabilities: {clientReleases: {
				schemaVersion: 1, platforms: ['windows-x64'], stableUrl: options.foreign && url.hostname === 'target.example'
					? 'https://foreign.example/v1/client-releases/stable/windows-x64'
					: `${url.origin}/prefix/v1/client-releases/stable/windows-x64`
			}}});
		}
		if (url.hostname === 'source.example') {
			return options.noSource ? response({}, 404) : response(selected);
		}
		if (settings.method === 'POST') {
			assert.equal(url.href, 'https://target.example/prefix/v1/admin/client-releases/stable/windows-x64');
			assert.equal(settings.headers.authorization, 'Bearer target-secret');
			assert.deepEqual(JSON.parse(settings.body), selected);
			if (options.reject) {
				return response({error: 'unavailable'}, 400);
			}
			target = JSON.parse(settings.body);
			return response(target);
		}
		return target ? response(target) : response({}, 404);
	};
	return {calls, selected, target: () => target, run: (extra = {}) => importClientRelease({source: 'https://source.example',
		node: 'https://target.example', apiKey: 'target-secret', trust: {publicKey}, fetchImpl, ...extra})};
}

describe('client release default trust and import', () => {
	it('bundles the same reviewed publisher fingerprint as the official client', () => {
		const key = configuredReleaseKey();
		assert.equal(key.asymmetricKeyType, 'ed25519');
		assert.equal(createHash('sha256').update(key.export({type: 'spki', format: 'der'})).digest('hex'),
			'76f028c3cb38aab0e4db1348435ab3ac48638f02b828d435200d050d2c62c144');
		assert.match(officialReleasePublicKey, /BEGIN PUBLIC KEY/);
		assert.deepEqual(configuredReleaseKey({publicKey: ''}).export({type: 'spki', format: 'der'}), key.export({type: 'spki', format: 'der'}));
	});
	it('supports explicit disable/custom trust and fails closed on malformed overrides', () => {
		assert.equal(configuredReleaseKey({enabled: false, publicKey: 'invalid'}), null);
		assert.deepEqual(verifyReleaseEnvelope(envelope(), configuredReleaseKey({publicKey})).version, '1.2.0');
		assert.throws(() => configuredReleaseKey({publicKey: 'not a PEM key'}), /public_key_invalid/);
		assert.throws(() => verifyReleaseEnvelope(envelope(), configuredReleaseKey()), /signature/);
	});
	it('enables actual module routes/models with no manual PEM and creates nothing when disabled', async () => {
		let definitions = 0;
		let routes = 0;
		const app: any = {config: {}, checkModules() {}, ms: {database: {
			sequelize: {define() { definitions++; return {sync: async () => {}}; }}, registerStorageIdReferenceSource() {}
		}, api: {onGet() { routes++; }, onAuthorizedPost() { routes++; }}}};
		assert.equal((await clientReleases(app)).enabled, true);
		assert.equal(definitions, 1);
		assert.equal(routes, 3);
		assert.equal((await clientReleases({config: {clientReleasesConfig: {enabled: false}}})).enabled, false);
	});
	it('imports an unchanged signed envelope using the destination key only once', async () => {
		const f = fixture({prefixFallback: true});
		assert.deepEqual(await f.run(), {version: '1.2.0', cid, alreadyPublished: false});
		assert.deepEqual(f.target(), f.selected);
		assert.equal(f.calls.filter(call => call.settings.method === 'POST').length, 1);
		assert.equal(f.calls.filter(call => call.url.endsWith('/api/.well-known/geesome')).length, 2);
		assert.equal((await f.run()).alreadyPublished, true);
		assert.equal(f.calls.filter(call => call.settings.method === 'POST').length, 1, 'repeat import does not write');
	});
	it('rejects unsigned/untrusted/oversized source data before any destination write', async () => {
		for (const data of [{...envelope(), signature: Buffer.alloc(64).toString('base64')}, {...envelope(), command: 'run'},
			{manifest: 'A'.repeat(20000), signature: 'AAAA'}]) {
			const f = fixture({envelope: data});
			await assert.rejects(f.run());
			assert.equal(f.calls.some(call => call.settings.method === 'POST'), false);
		}
		const f = fixture();
		await assert.rejects(f.run({trust: {}}), /signature/);
		assert.equal(f.calls.some(call => call.settings.method === 'POST'), false);
	});
	it('rejects foreign discovery and missing releases without leaking a key', async () => {
		await assert.rejects(fixture({foreign: true}).run(), /trusted HTTPS/);
		await assert.rejects(fixture({noSource: true}).run(), /No stable Windows/);
		await assert.rejects(fixture().run({source: 'http://source.example'}), /trusted HTTPS/);
		await assert.rejects(fixture().run({apiKey: ''}), /administrator API key/);
		await assert.rejects(fixture().run({trust: {enabled: false}}), /disabled/);
	});
	it('preserves a newer/conflicting stable release and does not promote on failed import', async () => {
		await assert.rejects(fixture({current: envelope('2.0.0')}).run(), /newer stable/);
		const changed = envelope();
		const data = JSON.parse(Buffer.from(changed.manifest, 'base64').toString());
		data.sha256 = '0'.repeat(64);
		const encoded = Buffer.from(JSON.stringify(data));
		const f = fixture({current: {manifest: encoded.toString('base64'), signature: sign(null, encoded, pair.privateKey).toString('base64')}});
		await assert.rejects(f.run(), /different descriptor/);
		assert.equal(f.calls.some(call => call.settings.method === 'POST'), false);
		const rejected = fixture({current: envelope('1.0.0'), reject: true});
		await assert.rejects(rejected.run(), /refused client release import/);
		assert.deepEqual(rejected.target(), envelope('1.0.0'));
	});
	it('works across actual source/target HTTP and the existing byte verification/pin path', async () => {
		let state = null;
		let pins = 0;
		const selected = envelope();
		const origins = {};
		const records: any = {sequelize: {query: async () => {}, transaction: run => run({})},
			findOne: async () => state, findByPk: async () => state,
			update: async () => {}, create: async row => { state = row; }};
		const module = getModule({checkUserCan: async id => assert.equal(id, 1), ms: {storage: {
			getFileStream: async hash => { assert.equal(hash, cid); return Readable.from([bytes]); },
			addPin: async hash => { assert.equal(hash, cid); pins++; }
		}}}, records, configuredReleaseKey({publicKey}), {fence: run => run()});
		const servers = ['source', 'target'].map(role => createServer(async (req, res) => {
			res.setHeader('content-type', 'application/json');
			try {
				if (req.url === '/.well-known/geesome') {
					assert.equal(req.headers.authorization, undefined);
					res.end(JSON.stringify({apiBaseUrl: origins[role]+'/v1', capabilities: {clientReleases: {
						schemaVersion: 1, platforms: ['windows-x64'], stableUrl: origins[role]+'/v1/client-releases/stable/windows-x64'
					}}}));
				} else if (req.method === 'POST') {
					assert.equal(role, 'target');
					assert.equal(req.url, '/v1/admin/client-releases/stable/windows-x64');
					assert.equal(req.headers.authorization, 'Bearer target-secret');
					const chunks = [];
					for await (const chunk of req) { chunks.push(chunk); }
					res.end(JSON.stringify(await module.publish(1, JSON.parse(Buffer.concat(chunks).toString()))));
				} else {
					assert.equal(req.headers.authorization, undefined);
					res.end(JSON.stringify(role === 'source' ? selected : await module.stable()));
				}
			} catch (error) {
				res.statusCode = error.status || 500;
				res.end(JSON.stringify({error: error.message}));
			}
		}));
		await Promise.all(servers.map(server => new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))));
		['source', 'target'].forEach((role, index) => { origins[role] = `http://127.0.0.1:${(servers[index].address() as any).port}`; });
		try {
			const imported = await importClientRelease({source: origins['source'], node: origins['target'], apiKey: 'target-secret', trust: {publicKey}});
			assert.equal(imported.alreadyPublished, false);
			assert.equal(pins, 1);
			assert.deepEqual(state.envelope, selected);
			assert.equal((await importClientRelease({source: origins['source'], node: origins['target'], apiKey: 'target-secret', trust: {publicKey}})).alreadyPublished, true);
			assert.equal(pins, 1);
		} finally {
			await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
		}
	});
});
