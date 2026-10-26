import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { cryptoNetworks } from './cryptoAssets.js';
import { readBoundedText } from './boundedResponse.js';
import { automationConfig, type EvmNetwork, evmNetworks } from './cryptoAutomationConfig.js';
type Entry = {
	url: string;
	retryAt: number;
};
type Cache = {
	updatedAt: number;
	networks: Record<string, Entry[]>;
};
type CacheState = {
	cache: Cache;
	loaded: boolean;
	queue: Promise<void>;
	refreshInFlight: Promise<void> | null;
};
// One process owns each resolved cache path. Separate processes need separate cache files.
const cacheStates = new Map<string, CacheState>();
function cacheState(path: string) {
	let state = cacheStates.get(path);
	if (!state) {
		state = {
			cache: { updatedAt: 0, networks: {} },
			loaded: false,
			queue: Promise.resolve(),
			refreshInFlight: null,
		};
		cacheStates.set(path, state);
	}
	return state;
}
function serialize<T>(state: CacheState, operation: () => Promise<T>): Promise<T> {
	const pending = state.queue.then(operation);
	// Failed reads/writes must not prevent subsequent callers from using the cache.
	state.queue = pending.then(() => undefined, () => undefined);
	return pending;
}
const safeEndpoint = (value: unknown) => {
	try {
		const u = new URL(String(value));
		return u.protocol === 'https:' && !u.username && !u.password && !u.href.includes('${')
			? u.href
			: null;
	}
	catch {
		return null;
	}
};
export function createCryptoRpc(env: NodeJS.ProcessEnv = process.env, fetcher = fetch, config = automationConfig(env), now = Date.now) {
	const cachePath = resolve(config.rpcCacheFile);
	const state = cacheState(cachePath);
	const cache = state.cache;
	async function persist() {
		const temporary = cachePath + '.' + randomUUID() + '.tmp';
		await writeFile(temporary, JSON.stringify(cache), { mode: 0o600 });
		await rename(temporary, cachePath);
	}
	async function json(url: string, init: RequestInit = {}, limit = 2 * 1024 * 1024) {
		const response = await fetcher(url, {
			...init,
			redirect: 'error',
			signal: AbortSignal.timeout(config.rpcTimeoutMs),
		});
		if (!response.ok) {
			throw Error('crypto_rpc_unavailable');
		}
		return JSON.parse(await readBoundedText(response, { limitBytes: limit, timeoutMs: config.rpcTimeoutMs }));
	}
	async function refresh() {
		if (!state.loaded) {
			state.loaded = true;
			try {
				const saved = JSON.parse(await readFile(cachePath, 'utf8'));
				if (saved &&
					Number.isSafeInteger(saved.updatedAt) &&
					saved.networks &&
					typeof saved.networks === 'object') {
					cache.updatedAt = saved.updatedAt;
					for (const n of evmNetworks)
						cache.networks[n] = (Array.isArray(saved.networks[n]) ? saved.networks[n] : [])
							.slice(0, 100)
							.filter((e) => safeEndpoint(e.url) && Number.isSafeInteger(e.retryAt));
				}
			}
			catch {
				/* First startup or corrupt public cache: refresh from Chainlist. */
			}
		}
		if (cache.updatedAt && now() - cache.updatedAt < config.rpcRefreshMs) {
			return;
		}
		try {
			const rows = await json(config.chainlistUrl, {}, 16 * 1024 * 1024);
			if (!Array.isArray(rows)) {
				throw Error();
			}
			for (const n of evmNetworks) {
				const row = rows.find((r) => Number(r.chainId) === cryptoNetworks[n].chainId);
				const urls = [
					...new Set<string>((row?.rpc || [])
						.map((r) => safeEndpoint(typeof r === 'string' ? r : r.url))
						.filter(Boolean)),
				].slice(0, 100);
				const old = cache.networks[n] || [];
				if (!urls.length) {
					continue;
				}
				cache.networks[n] = [
					...old.filter((e) => urls.includes(e.url)),
					...urls
						.filter((url) => !old.some((e) => e.url === url))
						.map((url) => ({ url, retryAt: 0 })),
				];
			}
			cache.updatedAt = now();
			await persist();
		}
		catch {
			if (!Object.values(cache.networks).some((rows) => rows.length)) {
				throw Error('crypto_rpc_discovery_unavailable');
			}
		}
	}
	async function call(network: EvmNetwork, method: string, params: unknown[] = []) {
		const configured = env[`DIRECT_CRYPTO_${network.toUpperCase()}_RPC`];
		if (!configured) {
			// Share even a failed discovery attempt across simultaneous callers. Otherwise
			// an outage makes each queued caller wait for its own discovery timeout.
			state.refreshInFlight ||= serialize(state, refresh).finally(() => {
				state.refreshInFlight = null;
			});
			await state.refreshInFlight;
		}
		const candidates = configured
			? [{ url: configured, retryAt: 0 }]
			: (cache.networks[network] || [])
				.filter((entry) => entry.retryAt <= now())
				.map((entry) => ({ ...entry }));
		for (const entry of candidates.slice(0, config.rpcMaxAttempts)) {
			try {
				// A reachable endpoint for a different chain must never receive a signed transfer.
				const chain = await json(entry.url, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						method: 'eth_chainId',
						params: [],
					}),
				});
				if (!/^0x[0-9a-f]+$/i.test(chain.result) ||
					BigInt(chain.result) !== BigInt(cryptoNetworks[network].chainId)) {
					throw Error();
				}
				const result = method === 'eth_chainId'
					? chain
					: await json(entry.url, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
					});
				if (result.error || result.result === undefined) {
					throw Error();
				}
				return result.result;
			}
			catch (error) {
				if (['crypto_scan_budget_exceeded', 'crypto_rate_limited'].includes((error as Error)?.message)) {
					throw error;
				}
				if (!configured) {
					await serialize(state, async () => {
						const entries = cache.networks[network] || [];
						const current = entries.find((candidate) => candidate.url === entry.url);
						// Discovery may have removed this endpoint while its request was in flight.
						if (!current) {
							return;
						}
						current.retryAt = now() + config.rpcFailureCooldownMs;
						cache.networks[network] = [
							...entries.filter((candidate) => candidate.url !== entry.url),
							current,
						];
						await persist();
					});
				}
			}
		}
		throw Error('crypto_rpc_unavailable');
	}
	return { call };
}
