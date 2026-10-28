import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { automationConfig } from '../../app/modules/payments/cryptoAutomationConfig.js';
import { createCryptoRpc } from '../../app/modules/payments/cryptoRpc.js';
const timestamp = 100000;
const networks = ['ethereum', 'base'] as const;
const chainIds = { ethereum: '0x1', base: '0x2105' };
async function fixture() {
	const directory = await mkdtemp(join(tmpdir(), 'crypto-rpc-shared-'));
	const path = join(directory, 'rpc.json');
	const cache = {
		updatedAt: timestamp,
		networks: Object.fromEntries(networks.map((network) => [
			network,
			[
				{ url: `https://bad.${network}.test/`, retryAt: 0 },
				{ url: `https://good.${network}.test/`, retryAt: 0 },
			],
		])),
	};
	await writeFile(path, JSON.stringify(cache));
	return {
		directory,
		path,
		config: { ...automationConfig({}), rpcCacheFile: path },
		saved: async () => JSON.parse(await readFile(path, 'utf8')),
		cleanup: async () => rm(directory, { recursive: true, force: true }),
	};
}
test('RPC instances share endpoint cooldown/order but retain their own fetch transport', async () => {
	const context = await fixture();
	const calls: string[][] = [[], []];
	let broken = false;
	const transport = (instance: number): typeof fetch => async (url, init) => {
		const endpoint = String(url);
		calls[instance].push(endpoint);
		if (endpoint.includes('bad.') && broken) {
			throw Error('offline');
		}
		const { method } = JSON.parse(String(init?.body));
		return Response.json({ result: method === 'eth_chainId' ? '0x1' : instance });
	};
	try {
		const first = createCryptoRpc({}, transport(0), context.config, () => timestamp);
		const second = createCryptoRpc({}, transport(1), context.config, () => timestamp);
		await first.call('ethereum', 'eth_chainId');
		await second.call('ethereum', 'eth_chainId');
		calls[0].length = 0;
		calls[1].length = 0;
		broken = true;
		assert.equal(await first.call('ethereum', 'eth_blockNumber'), 0);
		assert.equal(await second.call('ethereum', 'eth_blockNumber'), 1);
		assert.deepEqual(calls[1], ['https://good.ethereum.test/', 'https://good.ethereum.test/']);
		const saved = await context.saved();
		assert.equal(saved.networks.ethereum[1].url, 'https://bad.ethereum.test/');
		assert.equal(saved.networks.ethereum[1].retryAt, timestamp + context.config.rpcFailureCooldownMs);
	}
	finally {
		await context.cleanup();
	}
});
test('concurrent instances preserve failures in different networks and recognize equivalent paths', async () => {
	const context = await fixture();
	const fetcher: typeof fetch = async (url, init) => {
		const endpoint = String(url);
		if (endpoint.includes('bad.')) {
			throw Error('offline');
		}
		const network = endpoint.includes('.base.') ? 'base' : 'ethereum';
		const { method } = JSON.parse(String(init?.body));
		return Response.json({ result: method === 'eth_chainId' ? chainIds[network] : '0x42' });
	};
	try {
		const first = createCryptoRpc({}, fetcher, context.config, () => timestamp);
		const second = createCryptoRpc({}, fetcher, {
			...context.config,
			rpcCacheFile: relative(process.cwd(), context.path),
		}, () => timestamp);
		await Promise.all([
			first.call('ethereum', 'eth_blockNumber'),
			second.call('base', 'eth_blockNumber'),
		]);
		const saved = await context.saved();
		for (const network of networks) {
			assert.deepEqual(saved.networks[network], [
				{ url: `https://good.${network}.test/`, retryAt: 0 },
				{
					url: `https://bad.${network}.test/`,
					retryAt: timestamp + context.config.rpcFailureCooldownMs,
				},
			]);
		}
	}
	finally {
		await context.cleanup();
	}
});
test('failed discovery does not poison the shared queue and cached endpoints survive outages', async () => {
	const context = await fixture();
	let available = false;
	let discoveries = 0;
	const config = {
		...context.config,
		rpcCacheFile: join(context.directory, 'new.json'),
		chainlistUrl: 'https://chainlist.test/',
	};
	const fetcher: typeof fetch = async (url) => {
		if (String(url) === config.chainlistUrl) {
			discoveries++;
			if (!available) {
				throw Error('offline');
			}
			return Response.json([{ chainId: 1, rpc: ['https://good.ethereum.test/'] }]);
		}
		return Response.json({ result: '0x1' });
	};
	try {
		const first = createCryptoRpc({}, fetcher, config, () => timestamp);
		const second = createCryptoRpc({}, fetcher, config, () => timestamp);
		await assert.rejects(first.call('ethereum', 'eth_chainId'), /crypto_rpc_discovery_unavailable/);
		available = true;
		assert.equal(await second.call('ethereum', 'eth_chainId'), '0x1');
		available = false;
		const later = createCryptoRpc({}, fetcher, config, () => timestamp + config.rpcRefreshMs + 1);
		assert.equal(await later.call('ethereum', 'eth_chainId'), '0x1');
		assert.equal(discoveries, 3);
	}
	finally {
		await context.cleanup();
	}
});
test('a failed cache write does not poison later persistence', async () => {
	const context = await fixture();
	let recoverWrites = false;
	const fetcher: typeof fetch = async (url, init) => {
		const endpoint = String(url);
		if (endpoint.includes('bad.')) {
			if (!recoverWrites) {
				await rm(context.directory, { recursive: true, force: true });
			}
			throw Error('offline');
		}
		const { method } = JSON.parse(String(init?.body));
		return Response.json({ result: method === 'eth_chainId' ? '0x2105' : '0x42' });
	};
	try {
		const rpc = createCryptoRpc({}, fetcher, context.config, () => timestamp);
		await assert.rejects(rpc.call('ethereum', 'eth_blockNumber'), /ENOENT/);
		recoverWrites = true;
		await mkdir(context.directory);
		assert.equal(await rpc.call('base', 'eth_blockNumber'), '0x42');
		const saved = await context.saved();
		assert.ok(saved.networks.ethereum[1].retryAt > timestamp);
		assert.ok(saved.networks.base[1].retryAt > timestamp);
	}
	finally {
		await context.cleanup();
	}
});
test('explicit RPC bypasses discovery and rejects wrong chain before broadcasting', async () => {
	const context = await fixture();
	const methods: string[] = [];
	const fetcher: typeof fetch = async (url, init) => {
		assert.equal(String(url), 'https://explicit.test/');
		methods.push(JSON.parse(String(init?.body)).method);
		return Response.json({ result: '0x2105' });
	};
	try {
		const before = await readFile(context.path, 'utf8');
		const rpc = createCryptoRpc({ DIRECT_CRYPTO_ETHEREUM_RPC: 'https://explicit.test/' }, fetcher, context.config, () => timestamp);
		await assert.rejects(rpc.call('ethereum', 'eth_sendRawTransaction', ['signed']), /crypto_rpc_unavailable/);
		assert.deepEqual(methods, ['eth_chainId']);
		assert.equal(await readFile(context.path, 'utf8'), before);
	}
	finally {
		await context.cleanup();
	}
});
test('relative cache paths resolve at construction and distinguish different working directories', async () => {
	const first = await fixture();
	const second = await fixture();
	const originalDirectory = process.cwd();
	const calls: string[] = [];
	const fetcher: typeof fetch = async (url) => {
		calls.push(String(url));
		if (String(url).includes('bad.')) {
			throw Error('offline');
		}
		return Response.json({ result: '0x1' });
	};
	try {
		process.chdir(first.directory);
		const firstRpc = createCryptoRpc({}, fetcher, { ...first.config, rpcCacheFile: 'rpc.json' }, () => timestamp);
		process.chdir(second.directory);
		const secondRpc = createCryptoRpc({}, fetcher, { ...second.config, rpcCacheFile: 'rpc.json' }, () => timestamp);
		process.chdir(originalDirectory);
		await firstRpc.call('ethereum', 'eth_chainId');
		calls.length = 0;
		await secondRpc.call('ethereum', 'eth_chainId');
		assert.equal(calls[0], 'https://bad.ethereum.test/');
		assert.ok((await first.saved()).networks.ethereum[1].retryAt > timestamp);
		assert.ok((await second.saved()).networks.ethereum[1].retryAt > timestamp);
	}
	finally {
		process.chdir(originalDirectory);
		await first.cleanup();
		await second.cleanup();
	}
});
test('concurrent callers share one expired-cache discovery attempt during an outage', async () => {
	const context = await fixture();
	const config = { ...context.config, chainlistUrl: 'https://chainlist.test/' };
	const expiredAt = timestamp + config.rpcRefreshMs + 1;
	let discoveries = 0;
	let finishDiscovery!: () => void;
	let discoveryStarted!: () => void;
	const discoveryPending = new Promise<void>((resolve) => {
		finishDiscovery = resolve;
	});
	const started = new Promise<void>((resolve) => {
		discoveryStarted = resolve;
	});
	const fetcher: typeof fetch = async (url, init) => {
		if (String(url) === config.chainlistUrl) {
			discoveries++;
			discoveryStarted();
			await discoveryPending;
			throw Error('offline');
		}
		const { method } = JSON.parse(String(init?.body));
		return Response.json({ result: method === 'eth_chainId' ? '0x1' : '0x42' });
	};
	try {
		const first = createCryptoRpc({}, fetcher, config, () => expiredAt);
		const second = createCryptoRpc({}, fetcher, config, () => expiredAt);
		const results = Promise.all(Array.from({ length: 5 }, (_, index) => (index % 2 ? first : second).call('ethereum', 'eth_blockNumber')));
		await started;
		assert.equal(discoveries, 1);
		finishDiscovery();
		assert.deepEqual(await results, Array(5).fill('0x42'));
		assert.equal(discoveries, 1);
	}
	finally {
		finishDiscovery();
		await context.cleanup();
	}
});
test('default RPC search reaches the tenth endpoint and stops before the eleventh', async () => {
	assert.equal(automationConfig({}).rpcMaxAttempts, 10);
	const context = await fixture();
	const tried: number[] = [];
	let allBroken = false;
	const entries = Array.from({ length: 12 }, (_, i) => ({ url: `https://node-${i}.test/`, retryAt: 0 }));
	await writeFile(context.path, JSON.stringify({ updatedAt: timestamp, networks: { base: entries } }));
	const fetcher: typeof fetch = async (url, init) => {
		const index = Number(new URL(String(url)).hostname.split('.')[0].slice(5));
		const method = JSON.parse(String(init?.body)).method;
		if (method === 'eth_chainId') {
			tried.push(index);
		}
		if (allBroken || index !== 9) {
			return new Response('', { status: 503 });
		}
		return Response.json({ result: method === 'eth_chainId' ? '0x2105' : '0x42' });
	};
	try {
		let time = timestamp;
		const rpc = createCryptoRpc({}, fetcher, context.config, () => time);
		assert.equal(await rpc.call('base', 'eth_blockNumber'), '0x42');
		assert.deepEqual(tried, Array.from({ length: 10 }, (_, i) => i));
		tried.length = 0;
		assert.equal(await rpc.call('base', 'eth_blockNumber'), '0x42');
		assert.deepEqual(tried, [9]);
		tried.length = 0;
		allBroken = true;
		time += context.config.rpcFailureCooldownMs + 1;
		await assert.rejects(rpc.call('base', 'eth_blockNumber'), /crypto_rpc_unavailable/);
		assert.equal(tried.length, 10);
		assert.equal(tried[0], 9, 'known working endpoint is first');
		assert.deepEqual(tried, [9, 10, 11, 0, 1, 2, 3, 4, 5, 6], 'only ten candidates are attempted in the current priority order');
	}
	finally {
		await context.cleanup();
	}
});
test('working list is memory-only, preferred across instances, evicts failures and learns recovered endpoints', async () => {
	const context = await fixture();
	let time = timestamp, brokenGood = false;
	const calls: string[] = [];
	const initial = { updatedAt: timestamp, networks: { ethereum: [
		{ url: 'https://bad.ethereum.test/', retryAt: timestamp + 1 },
		{ url: 'https://good.ethereum.test/', retryAt: 0 },
	] } };
	await writeFile(context.path, JSON.stringify(initial));
	const fetcher: typeof fetch = async (url, init) => {
		const endpoint = String(url);
		calls.push(endpoint);
		if (brokenGood && endpoint.includes('good.')) {
			return new Response('', { status: 429 });
		}
		const method = JSON.parse(String(init?.body)).method;
		return Response.json({ result: method === 'eth_chainId' ? '0x1' : '0x42' });
	};
	try {
		const first = createCryptoRpc({}, fetcher, context.config, () => time);
		await first.call('ethereum', 'eth_blockNumber');
		assert.deepEqual(await context.saved(), initial, 'learning a working endpoint does not write to disk');
		time += 2;
		calls.length = 0;
		const second = createCryptoRpc({}, fetcher, context.config, () => time);
		await second.call('ethereum', 'eth_blockNumber');
		assert.deepEqual(calls, Array(2).fill('https://good.ethereum.test/'), 'working node stays first after another cooldown expires');
		const freshPath = join(context.directory, 'fresh-process.json');
		await writeFile(freshPath, JSON.stringify(await context.saved()));
		calls.length = 0;
		await createCryptoRpc({}, fetcher, { ...context.config, rpcCacheFile: freshPath }, () => time).call('ethereum', 'eth_blockNumber');
		assert.equal(calls[0], 'https://bad.ethereum.test/', 'fresh state cannot recover the memory-only preference from disk');
		calls.length = 0;
		brokenGood = true;
		await first.call('ethereum', 'eth_blockNumber');
		assert.deepEqual(calls, ['https://good.ethereum.test/', 'https://bad.ethereum.test/', 'https://bad.ethereum.test/']);
		assert.equal((await context.saved()).networks.ethereum[1].retryAt, time + context.config.rpcFailureCooldownMs);
		brokenGood = false;
		time += context.config.rpcFailureCooldownMs + 1;
		calls.length = 0;
		await second.call('ethereum', 'eth_blockNumber');
		assert.deepEqual(calls, Array(2).fill('https://bad.ethereum.test/'), 'failed former preferred node is no longer preferred after recovery');
		assert.deepEqual(Object.keys(await context.saved()).sort(), ['networks', 'updatedAt']);
	}
	finally {
		await context.cleanup();
	}
});
test('discovery refresh removes withdrawn working nodes and keeps networks isolated', async () => {
	const context = await fixture();
	let time = timestamp;
	const calls: string[] = [];
	const initial = { updatedAt: timestamp, networks: { ethereum: [
		{ url: 'https://unknown.ethereum.test/', retryAt: timestamp + 1 },
		{ url: 'https://working.ethereum.test/', retryAt: 0 },
	], base: [{ url: 'https://base.test/', retryAt: 0 }] } };
	await writeFile(context.path, JSON.stringify(initial));
	const fetcher: typeof fetch = async (url, init) => {
		const endpoint = String(url);
		calls.push(endpoint);
		if (endpoint === context.config.chainlistUrl) {
			return Response.json([{ chainId: 1, rpc: ['https://replacement.ethereum.test/'] }, { chainId: 8453, rpc: ['https://base.test/'] }]);
		}
		const method = JSON.parse(String(init?.body)).method;
		return Response.json({ result: method === 'eth_chainId' ? (endpoint.includes('base.test') ? '0x2105' : '0x1') : '0x42' });
	};
	try {
		const rpc = createCryptoRpc({}, fetcher, context.config, () => time);
		await rpc.call('ethereum', 'eth_blockNumber');
		calls.length = 0;
		await rpc.call('base', 'eth_blockNumber');
		assert.deepEqual(calls, Array(2).fill('https://base.test/'));
		time += context.config.rpcRefreshMs + 1;
		calls.length = 0;
		await rpc.call('ethereum', 'eth_blockNumber');
		assert.deepEqual(calls, [context.config.chainlistUrl, 'https://replacement.ethereum.test/', 'https://replacement.ethereum.test/']);
	}
	finally {
		await context.cleanup();
	}
});
