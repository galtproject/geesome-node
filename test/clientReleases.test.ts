import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {Readable} from 'node:stream';
import {AsyncLocalStorage} from 'node:async_hooks';
import {Sequelize} from 'sequelize';
import apiModule from '../app/modules/api/index.js';
import registerApi from '../app/modules/clientReleases/api.js';
import createModel from '../app/modules/clientReleases/models.js';
import {getModule, verifyArtifact, releaseReferenceSource} from '../app/modules/clientReleases/index.js';
import {releasePublicKey, verifyReleaseEnvelope, compareReleaseVersions} from '../app/modules/clientReleases/manifest.js';
import {countDerivedStorageIdReferences} from '../app/modules/database/storageReferenceHelpers.js';
import {stopStorageFence} from '../app/storageLifecycle.js';
import {normalizeStorageId} from '../app/storageIdentity.js';

const pair = generateKeyPairSync('ed25519');
const key = releasePublicKey(pair.publicKey.export({type: 'spki', format: 'pem'}).toString());
const bytes = Buffer.from('MZ test installer bytes');
const cid = 'QmYwAPJzv5CZsnAzt8auVZRnGi6Rc1Bhm1NYEG6KzGyf8a';
const make = (overrides = {}) => ({schemaVersion: 1, version: '1.0.0', platform: 'windows-x64', cid,
    sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, ...overrides});
function envelope(value = make()) {
    const data = Buffer.from(JSON.stringify(value));
    return {manifest: data.toString('base64'), signature: sign(null, data, pair.privateKey).toString('base64')};
}
const storage = () => ({getFileStream: async () => Readable.from([bytes]), addPin: async () => undefined});
function records() {
    const rows: any[] = [];
    let queue = Promise.resolve();
    return {
        rows,
        sequelize: {
            query: async () => undefined,
            transaction: (run) => {
                const promise = queue.then(() => run({}));
                queue = promise.catch(() => undefined);
                return promise;
            }
        },
        findOne: async () => rows.find(row => row.stable),
        findByPk: async version => rows.find(row => row.version === version),
        update: async values => rows.filter(row => row.stable).forEach(row => Object.assign(row, values)),
        create: async value => {
            const row = {...value, update: async values => Object.assign(row, values)};
            rows.push(row);
            return row;
        }
    };
}
function service(store = records(), options: any = {}) {
    const app = {ms: {storage: storage()}, checkUserCan: async id => {
        if (id !== 1) {
            throw Object.assign(new Error('not_permitted'), {status: 403});
        }
    }};
    return {app, store, module: getModule(app, store, key, {fence: run => run(), ...options})};
}

describe('client release trust and storage', () => {
    it('verifies exact manifest bytes and compares SemVer numerically', () => {
        assert.deepEqual(verifyReleaseEnvelope(envelope(), key), make());
        assert.equal(compareReleaseVersions('1.10.0', '1.9.9'), 1);
        assert.equal(compareReleaseVersions('2.0.0', '2.0.0'), 0);
    });
    it('rejects altered bytes, wrong key, noncanonical base64 and unknown envelope fields', () => {
        const valid = envelope();
        assert.throws(() => verifyReleaseEnvelope({...valid, manifest: envelope(make({version: '1.1.0'})).manifest}, key));
        assert.throws(() => verifyReleaseEnvelope(valid, generateKeyPairSync('ed25519').publicKey));
        assert.throws(() => verifyReleaseEnvelope({...valid, manifest: valid.manifest + '\n'}, key));
        assert.throws(() => verifyReleaseEnvelope({...valid, command: 'run'}, key));
        assert.throws(() => verifyReleaseEnvelope({...valid, manifest: 'A'.repeat(17000)}, key));
        assert.throws(() => releasePublicKey(generateKeyPairSync('rsa', {modulusLength: 2048}).publicKey.export({type: 'spki', format: 'pem'}).toString()));
    });
    it('rejects unsupported versions, schema, platforms, sizes, hashes, CIDs and metadata instructions', () => {
        for (const change of [{version: '01.0.0'}, {version: '1.0.0-beta'}, {version: '1.0.0+build'},
            {version: '9007199254740992.0.0'}, {schemaVersion: 2}, {platform: 'windows-arm64'}, {size: 0},
            {size: 536870913}, {sha256: 'f'}, {cid: '../bad'}, {cid: 'notacid'}, {command: 'run'}]) {
            assert.throws(() => verifyReleaseEnvelope(envelope(make(change)), key), JSON.stringify(change));
        }
    });
    it('streams exact bytes and rejects corrupt, truncated, excessive or missing artifacts', async () => {
        await verifyArtifact(storage(), make());
        for (const source of [Buffer.from('bad'), bytes.subarray(0, -1), Buffer.concat([bytes, bytes])]) {
            await assert.rejects(verifyArtifact({getFileStream: async () => Readable.from([source])}, make()));
        }
        await assert.rejects(verifyArtifact({getFileStream: async () => { throw new Error('missing'); }}, make()), /artifact unavailable/);
    });
    it('bounds stalled stream creation and iteration even when the adapter ignores cancellation', async () => {
        await assert.rejects(verifyArtifact({getFileStream: async () => new Promise(() => {})}, make(), {timeoutMs: 15}), /artifact unavailable/);
        const stalled = new Readable({read() {}});
        await assert.rejects(verifyArtifact({getFileStream: async () => stalled}, make(), {timeoutMs: 15}), /artifact unavailable/);
        assert.equal(stalled.destroyed, true);
    });
    it('requires administrator publication, keeps failures from changing stable and survives module recreation', async () => {
        const {module, app, store} = service();
        await assert.rejects(module.stable(), /not published/);
        await assert.rejects(module.publish(2, envelope()), /not_permitted/);
        await module.publish(1, envelope());
        const old = await module.stable();
        app.ms.storage.getFileStream = async () => Readable.from([Buffer.from('bad')]);
        await assert.rejects(module.publish(1, envelope(make({version: '1.1.0'}))));
        assert.deepEqual(await module.stable(), old);
        assert.deepEqual(await service(store).module.stable(), old);
        assert.equal(store.rows.length, 1);
    });
    it('is idempotent, rejects version substitution and downgrade, and serializes concurrent publication', async () => {
        const {module, store} = service();
        const first = envelope();
        await module.publish(1, first);
        await module.publish(1, first);
        assert.equal(store.rows.length, 1);
        // Different exact signed JSON under the same version is a conflict even with identical semantics.
        const raw = Buffer.from(JSON.stringify(make(), null, 2));
        await assert.rejects(module.publish(1, {manifest: raw.toString('base64'), signature: sign(null, raw, pair.privateKey).toString('base64')}), /version conflict/);
        const newer = envelope(make({version: '2.0.0'}));
        const older = envelope(make({version: '1.5.0'}));
        await Promise.allSettled([module.publish(1, newer), module.publish(1, older)]);
        assert.deepEqual(await module.stable(), newer);
        await assert.rejects(module.publish(1, first), /downgrade/);
        assert.equal(store.rows.filter(row => row.stable).length, 1);
    });
    it('does not advertise old-key manifests after configured key changes', async () => {
        const {module, store, app} = service();
        await module.publish(1, envelope());
        const replacement = getModule(app, store, generateKeyPairSync('ed25519').publicKey, {fence: run => run()});
        await assert.rejects(replacement.stable(), /signature invalid/);
    });
});

describe('client release public discovery and API', function () {
    this.timeout(10000);
    let api;
    let origin;
    let context = new AsyncLocalStorage<any>();
    before(async () => {
        const {app, module} = service();
        const object: any = app;
        object.config = {port: 0, apiConfig: {publicUrl: 'https://node.example/prefix', publicBasePath: '/proxy/api/v1'}};
        object.ms.database = {getUsersCount: async () => 1};
        object.ms.storage.remoteNodeAddressList = async () => [];
        object.ms.communicator = {nodeAddressList: async () => []};
        object.ms.clientReleases = module;
        object.getUserByApiToken = async token => token === 'expired' ? {} : ({user: {id: 1}, apiKey: {allowed: token === 'admin'}});
        object.runWithApiKey = (value, run) => context.run(value, run);
        object.checkUserCan = async () => {
            if (!context.getStore()?.allowed) {
                throw new Error('not_permitted');
            }
        };
        api = await apiModule(object);
        object.ms.api = api;
        registerApi(object, module);
        origin = `http://127.0.0.1:${api.port}`;
    });
    after(() => api?.stop());
    it('advertises absolute prefixed stable/guide links without a key', async () => {
        const found = await (await fetch(`${origin}/.well-known/geesome`)).json();
        assert.deepEqual(found.capabilities.clientReleases, {schemaVersion: 1, platforms: ['windows-x64'],
            stableUrl: 'https://node.example/prefix/proxy/api/v1/client-releases/stable/windows-x64',
            installGuideUrl: 'https://node.example/prefix/proxy/api/v1/client-releases/install'});
        const root = await (await fetch(`${origin}/v1`)).json();
        assert.deepEqual(root.publicDiscovery.capabilities.clientReleases, found.capabilities.clientReleases);
    });
    it('serves public install instructions before publication and exposes no-release state', async () => {
        const guide = await fetch(`${origin}/v1/client-releases/install`);
        assert.equal(guide.status, 200);
        assert.match(guide.headers.get('content-type') || '', /text\/markdown/);
        const text = await guide.text();
        assert.match(text, /localhost:7347/);
        assert.match(text, /separate trusted channel/);
        assert.match(text, /first-install bootstrap authority/);
        assert.equal((await fetch(`${origin}/v1/client-releases/stable/windows-x64`)).status, 404);
    });
    it('denies absent, expired and restricted keys; publishes publicly with administrator permission', async () => {
        const path = `${origin}/v1/admin/client-releases/stable/windows-x64`;
        for (const token of ['', 'expired', 'upload-only']) {
            const response = await fetch(path, {method: 'POST', headers: {'content-type': 'application/json', ...(token ? {authorization: `Bearer ${token}`} : {})}, body: JSON.stringify(envelope())});
            assert.ok([401, 403].includes(response.status), `${token}: ${response.status}`);
        }
        const published = await fetch(path, {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer admin'}, body: JSON.stringify(envelope())});
        assert.equal(published.status, 200, await published.text());
        const response = await fetch(`${origin}/v1/client-releases/stable/windows-x64`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), envelope());
    });
});

// Optional real PostgreSQL fixture. Use a disposable database, never a production URL.
if (process.env.CLIENT_RELEASE_TEST_DATABASE_URL) {
    describe('client release PostgreSQL persistence', function () {
        this.timeout(15000);
        let sequelize;
        let Release;
        before(async () => {
            sequelize = new Sequelize(process.env.CLIENT_RELEASE_TEST_DATABASE_URL!, {logging: false});
            Release = await createModel(sequelize);
            await Release.destroy({where: {}});
        });
        after(async () => sequelize?.close());
        it('serializes first and concurrent promotions and persists a stable record across module recreation', async () => {
            const app = {ms: {storage: storage()}, checkUserCan: async () => undefined};
            const module = getModule(app, Release, key, {fence: run => run()});
            await Promise.allSettled([module.publish(1, envelope(make({version: '1.0.0'}))), module.publish(1, envelope(make({version: '2.0.0'})))]);
            assert.equal(verifyReleaseEnvelope(await module.stable(), key).version, '2.0.0');
            assert.equal(await Release.count({where: {stable: true}}), 1);
            assert.equal(verifyReleaseEnvelope(await getModule(app, Release, key).stable(), key).version, '2.0.0');
            await assert.rejects(module.publish(1, envelope(make({version: '1.0.0'}))), /downgrade/);
            await module.publish(1, envelope(make({version: '2.0.0'})));
            assert.equal(await Release.count({where: {stable: true}}), 1);
        });
        it('registerable release CID references block ordinary cleanup even without live Content rows', async () => {
            const count = await countDerivedStorageIdReferences({}, sequelize, cid, {}, [releaseReferenceSource(Release)]);
            assert.ok(count > 0);
            assert.equal(await countDerivedStorageIdReferences({}, sequelize, normalizeStorageId(cid), {}, [releaseReferenceSource(Release)]), count);
        });
        if (process.env.CLIENT_RELEASE_TEST_KUBO_URL) {
            it('pins and serves exact installer bytes through real Kubo under the PostgreSQL storage fence', async () => {
                const {create} = await import('kubo-rpc-client');
                const kubo = create({url: process.env.CLIENT_RELEASE_TEST_KUBO_URL});
                const added = await kubo.add(bytes, {pin: false});
                const actualCid = added.cid.toString();
                const app: any = {ms: {database: {sequelize}, storage: {
                    getFileStream: async (storageId, options) => Readable.from(kubo.cat(storageId, options)),
                    addPin: storageId => kubo.pin.add(storageId)
                }}, checkUserCan: async () => undefined};
                try {
                    const value = envelope(make({version: '3.0.0', cid: actualCid}));
                    await getModule(app, Release, key).publish(1, value);
                    assert.deepEqual(await getModule(app, Release, key).stable(), value);
                    const gateway = await fetch(`${process.env.CLIENT_RELEASE_TEST_GATEWAY_URL}/ipfs/${actualCid}`);
                    assert.equal(gateway.status, 200);
                    assert.deepEqual(Buffer.from(await gateway.arrayBuffer()), bytes);
                    const pinned = [];
                    for await (const pin of kubo.pin.ls({paths: [actualCid]})) {
                        pinned.push(pin);
                    }
                    assert.equal(pinned.length, 1);
                    assert.equal(await countDerivedStorageIdReferences({}, sequelize, actualCid, {}, [releaseReferenceSource(Release)]), 1);
                } finally {
                    await stopStorageFence(app);
                }
            });
        }
    });
}
