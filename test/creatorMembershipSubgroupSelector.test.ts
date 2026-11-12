import assert from 'node:assert/strict';
import registerPublicationApi from '../app/modules/membership/publicationApi.js';
import {CID} from 'multiformats/cid';
import {sha256} from 'multiformats/hashes/sha2';
import {createPublicationDelivery} from '../app/modules/membership/publication.js';
import {canonicalMembershipPublicationInventory, assemblyCapability} from '../app/modules/staticSiteGenerator/membershipPublicationInventory.js';
import {siteProblem} from '../app/modules/api/browserSession.js';

function fixture() {
	const routes = new Map<string, Function>(), registrations: string[] = [], selections: any[] = [];
	const api = Object.fromEntries(['onGet', 'onHead', 'onAuthorizedGet', 'onAuthorizedPost'].map(name => [name, (path, handler) => {
		const key = `${name} ${path}`;
		registrations.push(key);
		routes.set(key, handler);
	}]));
	const forbidden = () => {throw new Error('Public subgroup selection must not consult reader authentication or full snapshots.');};
	const module = {
		resolveSite: async host => host === 'creator.test' ? {id: 'creator', origin: 'https://creator.test'} : null,
		currentSubgroupSnapshot: async (...args) => {
			selections.push(args);
			if (args[1] !== 'feed' || !['', 'page/2/', 'posts/17/'].includes(args[2])) {
				siteProblem(404, 'subgroup_not_found');
			}
			return `https://creator.test/ipfs/public-parent-cid/${args[1]}/${args[2]}`;
		},
		currentSnapshot: forbidden,
		guestSnapshotSelection: forbidden
	};
	registerPublicationApi({ms: {api, membership: module, googleAuthorization: {reader: forbidden}}}, module);
	async function request(method = 'GET', suffix = '', params = {}, headers = {}) {
		const path = 'membership/site/:alias' + suffix;
		const response: any = {headers: {}, ended: false, status: null, body: undefined};
		const res = {
			setHeader: (key, value) => {response.headers[key] = value;},
			writeHead: status => {response.status = status;},
			sendWithStatus: (body, status) => {response.body = body;response.status = status;},
			stream: {end: () => {response.ended = true;}}
		};
		await routes.get(`${method === 'HEAD' ? 'onHead' : 'onGet'} ${path}`)({
			headers: {host: 'creator.test', ...headers}, params: {alias: 'feed', ...params},
			stream: {method}, route: path, query: {}, requestId: 'selector-test'
		}, res);
		return response;
	}
	return {request, registrations, selections};
}

describe('public subgroup snapshot selector API', () => {
	it('redirects GET and HEAD section, page and post routes to the public parent CID even with reader credentials', async () => {
		const f = fixture();
		for (const method of ['GET', 'HEAD']) {
			for (const [route, params, suffix] of [
				['', {}, ''],
				['/page/:subgroupPage', {subgroupPage: '2'}, 'page/2/'],
				['/posts/:subgroupPost', {subgroupPost: '17'}, 'posts/17/']
			] as const) {
				const response = await f.request(method, route, params, {
					cookie: '__Host-geesome_session=reader-session', authorization: 'Bearer reader', origin: 'https://creator.test'
				});
				assert.equal(response.status, 302);
				assert.equal(response.headers.Location, `https://creator.test/ipfs/public-parent-cid/feed/${suffix}`);
				assert.equal(response.headers['Cache-Control'], 'private, no-store');
				assert.equal(response.headers.Vary, 'Cookie, Host');
				assert.equal(response.ended, true);
				assert.equal(response.body, undefined);
				assert.deepEqual(f.selections.at(-1), ['creator', 'feed', suffix]);
			}
		}
	});
	it('rejects malformed or reserved aliases and malformed numeric page/post suffixes before selection', async () => {
		const f = fixture();
		for (const alias of ['Feed', '../feed', 'feed/path', '', 'account', 'posts', 'x'.repeat(65)]) {
			const response = await f.request('GET', '', {alias});
			assert.equal(response.status, 404);
			assert.equal(response.body.code, 'subgroup_not_found');
			assert.equal(response.headers.Location, undefined);
		}
		for (const [route, key] of [['/page/:subgroupPage', 'subgroupPage'], ['/posts/:subgroupPost', 'subgroupPost']]) {
			for (const value of ['0', '-1', '01', '1.5', '../1', '1/2', '']) {
				const response = await f.request('HEAD', route, {[key]: value});
				assert.equal(response.status, 404);
				assert.equal(response.body.code, 'subgroup_not_found');
				assert.equal(response.headers['Cache-Control'], 'private, no-store');
				assert.equal(response.headers.Location, undefined);
			}
		}
		assert.equal(f.selections.length, 0);
	});
	it('passes unknown aliases and ungenerated numeric paths to authoritative selection without redirecting', async () => {
		const f = fixture();
		for (const [route, params] of [['', {alias: 'news'}], ['/page/:subgroupPage', {subgroupPage: '99'}], ['/posts/:subgroupPost', {subgroupPost: '99'}]] as const) {
			const response = await f.request('GET', route, params);
			assert.equal(response.status, 404);
			assert.equal(response.body.code, 'subgroup_not_found');
			assert.equal(response.headers.Location, undefined);
		}
	});
	it('blocks cross-site API fetches but allows external GET/HEAD document navigation and still rejects wrong Origin', async () => {
		const f = fixture();
		const denied = await f.request('GET', '', {}, {'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty'});
		assert.equal(denied.status, 403);
		assert.equal(denied.body.code, 'origin_invalid');
		assert.equal(f.selections.length, 0);
		for (const method of ['GET', 'HEAD']) {
			const response = await f.request(method, '', {}, {'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document'});
			assert.equal(response.status, 302);
		}
		const wrongOrigin = await f.request('GET', '', {}, {origin: 'https://external.test', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document'});
		assert.equal(wrongOrigin.status, 403);
		assert.equal(wrongOrigin.body.code, 'origin_invalid');
		assert.equal(f.selections.length, 2);
	});
	it('keeps concrete account/page/post/client routes ahead of the dynamic alias route', () => {
		const {registrations} = fixture();
		for (const method of ['onGet', 'onHead']) {
			const aliasIndex = registrations.indexOf(`${method} membership/site/:alias`);
			for (const path of ['membership/site', 'membership/site/account', 'membership/site/page/:page', 'membership/site/posts/:post']) {
				assert(registrations.indexOf(`${method} ${path}`) < aliasIndex);
			}
		}
		assert(registrations.indexOf('onGet membership/site/client.js') < registrations.indexOf('onGet membership/site/:alias'));
	});
});

function deliveryFixture(manifest) {
	const row: any = {id: 'creator', ownerId: 7, domain: 'creator.test', postsEnabled: true, data: {publication: {publicationId: 'publication'}}};
	const job: any = {status: 'ready', resourceId: row.id, manifest};
	const forbidden = () => {throw new Error('Public subgroup selection must not check reader entitlement.');};
	const membership = {clock: () => new Date(), resource: async () => row, owner: async () => row, entitlement: forbidden};
	const delivery = createPublicationDelivery({ms: {database: {models: {}, sequelize: {}}}}, {publications: {findByPk: async () => job}}, membership);
	return {delivery, row, job};
}

describe('authoritative public subgroup snapshot selection', () => {
	let manifest: any, publicRoot: string;
	before(async () => {
		const cid = async text => CID.createV1(0x55, await sha256.digest(Buffer.from(text))).toString();
		publicRoot = await cid('public parent');
		const childRoot = await cid('public child'), fileCid = await cid('file');
		const subgroups = {feed: {subgroupId: 8, root: childRoot, paths: ['index.html', 'page/2/index.html', 'posts/17/index.html']}};
		const inventory = canonicalMembershipPublicationInventory([{path: 'index.html', cid: fileCid, kind: 'file'}, {path: 'feed', cid: childRoot, kind: 'opaque-subtree'}], subgroups);
		manifest = {version: 2, public: publicRoot, full: await cid('private parent'), subgroups,
			files: {public: {'index.html': {cid: fileCid}}}, media: {public: []},
			assembly: {public: assemblyCapability('creator', 'public', publicRoot, inventory)}};
	});
	it('selects only declared generated paths beneath the verified public parent root', async () => {
		const f = deliveryFixture(structuredClone(manifest));
		try {
			for (const suffix of ['', 'page/2/', 'posts/17/']) {
				assert.equal(await f.delivery.currentSubgroupSnapshot('creator', 'feed', suffix), `https://creator.test/ipfs/${publicRoot}/feed/${suffix}`);
			}
			for (const [alias, suffix] of [['news', ''], ['feed', 'page/99/'], ['feed', 'posts/99/'], ['../feed', ''], ['feed', '../'], ['feed', 'page/01/'], ['feed', 'posts/0/']]) {
				await assert.rejects(f.delivery.currentSubgroupSnapshot('creator', alias, suffix), {status: 404, code: 'subgroup_not_found'});
			}
		} finally {
			await f.delivery.stop();
		}
	});
	it('refuses missing, unready, cross-resource, disabled or unverified public snapshots even if full exists', async () => {
		const mutations = [
			f => {f.row.postsEnabled = false;},
			f => {f.job.status = 'building';},
			f => {f.job.resourceId = 'another';},
			f => {delete f.job.manifest.assembly.public;},
			f => {f.job.manifest.assembly.full = {...f.job.manifest.assembly.public, variant: 'full', root: f.job.manifest.full};delete f.job.manifest.assembly.public;},
			f => {f.job.manifest.assembly.public.root = f.job.manifest.full;},
			f => {delete f.job.manifest.subgroups.feed;},
			f => {f.job.manifest.files.public = {};}
		];
		for (const mutate of mutations) {
			const f = deliveryFixture(structuredClone(manifest));
			try {
				mutate(f);
				await assert.rejects(f.delivery.currentSubgroupSnapshot('creator', 'feed'), {status: 404, code: 'subgroup_not_found'});
			} finally {
				await f.delivery.stop();
			}
		}
	});
});
