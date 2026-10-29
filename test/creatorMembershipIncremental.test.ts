import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {create as createKuboClient} from 'kubo-rpc-client';
import JsIpfsServiceNode from 'geesome-libs/src/JsIpfsServiceNode.js';
import {buildMembershipSnapshots} from '../app/modules/staticSiteGenerator/membershipPublication.js';
import {canonicalInventory, assembleMembershipTree} from '../app/modules/staticSiteGenerator/membershipInventory.js';
import {publicationDigest, snapshotCid} from '../app/modules/staticSiteGenerator/membershipProjection.js';

const suite = process.env.CREATOR_MEMBERSHIP_TEST_IPFS_URL ? describe : describe.skip;
suite('incremental snapshot assembly on real Kubo', function () {
	this.timeout(180000);
	let storage, app, source, row, paths, rpc;
	beforeEach(() => {
		storage = new JsIpfsServiceNode(createKuboClient({url: process.env.CREATOR_MEMBERSHIP_TEST_IPFS_URL}), 'kubo-rpc');
		paths = [];
		rpc = [];
		for (const method of ['cp', 'mkdir', 'rm', 'stat']) {
			const original = storage.node.files[method].bind(storage.node.files);
			storage.node.files[method] = async (...args) => {rpc.push({method, args}); return original(...args);};
		}
		row = {id: 'incremental', groupId: '1', domain: 'creator.test', data: {}};
		app = {ms: {storage, group: {forEachHydratedGroupPostBatch: async (_id, _options, fn) => fn({groupPosts: source, refCount: source.length})}}};
	});
	afterEach(async () => {
		for (const path of paths) {
			await storage.node.files.rm(path, {recursive: true}).catch(() => {});
		}
	});
	async function fixture(count) {
		source = [];
		for (let id = 1; id <= count; id++) {
			const preview = await storage.saveFileByData(`preview-${id}`);
			source.push({id, publishedAt: new Date(id), status: 'published', contents: [{storageId: String(preview.id), mimeType: 'image/png', postsContents: {isPrivate: false}}],
				propertiesJson: JSON.stringify({membership: {title: `Post ${id}`, teaser: `Public ${id}`, fullText: `Private ${id}`, free: false}})});
		}
	}
	function edit(index, patch) {
		const post = source[index];
		post.propertiesJson = JSON.stringify({membership: {...JSON.parse(post.propertiesJson).membership, ...patch}});
	}
	async function build(previousManifest = null, assemblyMode = 'incremental') {
		return buildMembershipSnapshots(app, row, 'Creator', {previousManifest, assemblyMode, options: [], description: '', renew: async () => {}, beginDirectory: async variant => {
			const path = `/incremental-${randomUUID()}-${variant}`;
			paths.push(path);
			return path;
		}});
	}
	async function parity(previous) {
		const next = await build(previous.manifest);
		const fresh = await build(previous.manifest, 'full');
		for (const variant of ['public', 'full']) {
			assert.equal(next.manifest[variant], fresh.manifest[variant], `${variant} has identical canonical DAG/bytes`);
			assert.deepEqual(next.manifest.assembly[variant].inventory, fresh.manifest.assembly[variant].inventory);
		}
		assert.deepEqual([...next.artifacts].sort(), [...fresh.artifacts].sort());
		return next;
	}
	it('clones without nesting; no-op and text edits avoid all unchanged-path RPCs', async () => {
		await fixture(46);
		const first = await build();
		rpc.length = 0;
		const replay = await build(first.manifest);
		assert.equal(replay.manifest.public, first.manifest.public);
		assert.equal(replay.manifest.full, first.manifest.full);
		assert.equal(replay.metrics.copies, 2);
		assert.equal(replay.metrics.renders, 0);
		assert.equal(replay.metrics.mkdirs, 0);
		assert.equal(replay.metrics.sourceStats, 0);
		assert.equal(rpc.filter(call => call.method === 'cp').length, 2);
		assert.equal(rpc.filter(call => call.method === 'mkdir').length, 0);
		const changedKey = structuredClone(replay.manifest);
		for (const variant of ['public', 'full']) {
			changedKey.files[variant]['style.css'].key = 'input-key-miss';
		}
		const sameBytes = await build(changedKey);
		assert.equal(sameBytes.metrics.bodySaves, 2);
		assert.equal(sameBytes.metrics.renders, 0);
		assert.equal(sameBytes.metrics.copies, 2, 'input-key miss with same output CID never rewrites the cloned file');
		edit(45, {title: 'Edited newest post'});
		rpc.length = 0;
		const next = await build(replay.manifest);
		assert.equal(next.metrics.renders, 4);
		assert.equal(next.metrics.copies, 6);
		assert.equal(next.metrics.removes, 4);
		assert.equal(next.metrics.mkdirs, 0);
		assert.equal(next.metrics.sourceStats, 0);
		assert.equal(rpc.filter(call => call.method === 'cp').length, 6);
		assert.equal(rpc.filter(call => call.method === 'mkdir').length, 0);
		assert.deepEqual(rpc.filter(call => call.method === 'stat').map(call => call.args[0]).sort(), [`/ipfs/${replay.manifest.public}`, `/ipfs/${replay.manifest.full}`, ...paths.slice(-2)].sort(), 'only two root availability probes and root reads');
		const fresh = await build(replay.manifest, 'full');
		assert.equal(next.manifest.public, fresh.manifest.public);
		assert.equal(next.manifest.full, fresh.manifest.full);
		assert((await storage.getFileDataText(`${first.manifest.public}/posts/46/index.html`)).includes('Post 46'), 'old root retains bytes');
	});
	it('removes stale public media, posts and directories; preserves archive history and empty roots', async () => {
		await fixture(19);
		let current = await build();
		await fixture(20);
		current = await parity(current);
		assert.equal(current.manifest.pageCount, 2, 'pagination boundary adds a canonical archive');
		await fixture(21);
		current = await parity(current);
		row.data.displayTitle = 'Changed branding';
		current = await parity(current);
		const oldRoot = current.manifest.public, oldMedia = current.manifest.media.public[0];
		source[0].contents[0].postsContents.isPrivate = true;
		edit(0, {free: true});
		current = await parity(current);
		assert(!current.manifest.media.public.includes(oldMedia));
		await assert.rejects(() => storage.getFileDataText(`${current.manifest.public}/media/${oldMedia}`), /not exist|not found|no link/i);
		assert(await storage.getFileDataText(`${oldRoot}/media/${oldMedia}`));
		edit(0, {hidden: true});
		current = await parity(current);
		assert(!current.manifest.files.public['posts/1/index.html']);
		await assert.rejects(() => storage.node.ls(`/ipfs/${current.manifest.public}/posts/1`).next(), /not exist|not found|no link/i);
		source = [];
		current = await parity(current);
		for (const variant of ['public', 'full']) {
			for (const directory of ['posts', 'media', 'public', 'page', 'account']) {
				const stat = await storage.node.files.stat(`/ipfs/${current.manifest[variant]}/${directory}`);
				assert.equal(stat.type, 'directory');
			}
		}
	});
	it('falls back before mutation for legacy/invalid/unavailable roots and unsupported adapters; repair bypasses caches', async () => {
		await fixture(2);
		const first = await build();
		for (const mutate of [m => {delete m.assembly;}, m => {m.assembly.public.version = 2;}, m => {m.assembly.full.resourceId = 'foreign';}]) {
			const legacy = structuredClone(first.manifest);
			mutate(legacy);
			const next = await build(legacy);
			assert.equal(next.manifest.public, first.manifest.public);
			assert.equal(next.manifest.full, first.manifest.full);
			assert.equal(next.metrics.renders, 0, 'cache independent of clone eligibility');
		}
		const stat = storage.node.files.stat;
		storage.node.files.stat = async (path, ...args) => {
			if (path === `/ipfs/${first.manifest.public}`) {
				throw Object.assign(new Error('not found'), {code: 'ERR_NOT_FOUND'});
			}
			return stat(path, ...args);
		};
		const unavailable = await build(first.manifest);
		assert.equal(unavailable.metrics.variants.public.mode, 'fresh');
		storage.node.files.stat = stat;
		storage.type = 'other';
		const unsupported = await build(first.manifest);
		assert.equal(unsupported.metrics.variants.full.mode, 'fresh');
		storage.type = 'kubo-rpc';
		const repair = await build(first.manifest, 'repair');
		assert.equal(repair.metrics.hits, 0);
		assert(repair.metrics.sourceStats > 0);
		assert.equal(repair.manifest.public, first.manifest.public);
	});
	it('treats directory media as opaque leaves through file/subtree replacement and removal', async () => {
		const file = snapshotCid((await storage.saveFileByData('leaf')).id);
		const sourcePath = `/incremental-${randomUUID()}`;
		paths.push(sourcePath);
		await storage.makeDir(sourcePath);
		await storage.copyFileFromId(file, `${sourcePath}/private-leaf`);
		const subtree = snapshotCid(await storage.getDirectoryId(sourcePath));
		const name = `media/${publicationDigest(file)}.bin`;
		const make = (cid, kind: any) => canonicalInventory([{path: name, cid, kind}]);
		let previous = null, root;
		for (const desired of [make(file, 'file'), make(subtree, 'opaque-subtree'), make(file, 'file'), canonicalInventory([])]) {
			const directory = `/incremental-${randomUUID()}`;
			paths.push(directory);
			const metrics = {copies: 0, mkdirs: 0, removes: 0, rootReads: 0};
			root = await assembleMembershipTree(storage, directory, desired, previous, root, async () => {}, metrics);
			const freshPath = `/incremental-${randomUUID()}`;
			paths.push(freshPath);
			const fresh = await assembleMembershipTree(storage, freshPath, desired, null, null, async () => {}, metrics);
			assert.equal(root, fresh);
			previous = desired;
		}
		assert.equal(await storage.getFileDataText(`${subtree}/private-leaf`), 'leaf');
	});
});
