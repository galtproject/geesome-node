import assert from 'node:assert/strict';
import {CID} from 'multiformats/cid';
import {sha256} from 'multiformats/hashes/sha2';
import {canonicalMembershipPublicationInventory, assemblyCapability, readVerifiedPublicationInventory} from '../app/modules/staticSiteGenerator/membershipPublicationInventory.js';
import {assemblePublicationTree} from '../app/modules/staticSiteGenerator/publicationTreeAssembly.js';

describe('membership complete inventory boundary', () => {
	let cid;
	before(async () => { cid = CID.createV1(0x55, await sha256.digest(Buffer.from('fixture'))).toString(); });
	it('rejects paths outside the managed namespaces and opaque subtree descendants', () => {
		for (const path of ['/index.html', '../index.html', 'posts/../index.html', 'https://host/file', 'media/x/a', 'posts/01/index.html', 'public/secret', 'media/aaa.png']) {
			assert.throws(() => canonicalMembershipPublicationInventory([{path, cid, kind: 'file'}]), /invalid_publication_inventory/);
		}
		assert.throws(() => canonicalMembershipPublicationInventory([{path: 'index.html', cid, kind: 'opaque-subtree'}]), /invalid_publication_inventory/);
		assert.throws(() => canonicalMembershipPublicationInventory([{path: 'index.html', cid, kind: 'file'}, {path: 'index.html', cid, kind: 'file'}]), /invalid_publication_inventory/);
	});
	it('binds the canonical inventory to resource, variant, root, files and media', () => {
		const inventory = canonicalMembershipPublicationInventory([{path: 'index.html', cid, kind: 'file'}]);
		const manifest = {version: 2, public: cid, files: {public: {'index.html': {cid}}}, media: {public: []}, assembly: {public: assemblyCapability('wave', 'public', cid, inventory)}};
		assert.deepEqual(readVerifiedPublicationInventory(manifest, 'wave', 'public'), inventory);
		const jsonbOrder = JSON.parse(JSON.stringify(manifest, (_key, value) => value && !Array.isArray(value) && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value));
		assert.deepEqual(readVerifiedPublicationInventory(jsonbOrder, 'wave', 'public'), inventory, 'Postgres JSONB object ordering never disables cloning');
		assert.equal(readVerifiedPublicationInventory(manifest, 'meat', 'public'), null);
		assert.equal(readVerifiedPublicationInventory(manifest, 'wave', 'full'), null);
		for (const mutate of [m => {delete m.assembly;}, m => {m.assembly.public.version = 99;}, m => {m.assembly.public.root = 'invalid';}, m => {m.assembly.public.inventory.directories.push('secret');}, m => {delete m.files.public['index.html'];}, m => {m.media.public.push('untracked.png');}]) {
			const broken = structuredClone(manifest);
			mutate(broken);
			assert.equal(readVerifiedPublicationInventory(broken, 'wave', 'public'), null);
		}
	});
	it('propagates partial clone failure without mutating or retrying the destination', async () => {
		const calls = [];
		const storage: any = {copyFileFromId: async (...args) => {calls.push(args); throw new Error('partial_clone');}, makeDir: () => assert.fail('no fallback after clone')};
		const inventory = canonicalMembershipPublicationInventory([]);
		await assert.rejects(() => assemblePublicationTree(storage, '/isolated', inventory, inventory, cid, async () => {}, {copies: 0, mkdirs: 0, removes: 0, rootReads: 0}), /partial_clone/);
		assert.deepEqual(calls, [[cid, '/isolated']]);
	});
});
