import { createCryptoBalanceObserver, type BalanceContext } from './cryptoBalanceObserver.js';
import { createCryptoRpc } from './cryptoRpc.js';
import { cryptoAsset, cryptoNetworks, type CryptoNetwork } from './cryptoAssets.js';
import { readBoundedText } from './boundedResponse.js';
import { base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { AsyncLocalStorage } from 'node:async_hooks';
export type ChainTransfer = {
	key: string;
	txid: string;
	atomic: string;
	confirmed: boolean;
	timestamp: number;
	blockHeight?: string;
};
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const endpointDefaults = { ethereum: 'https://ethereum-rpc.publicnode.com', arbitrum: 'https://arb1.arbitrum.io/rpc', base: 'https://mainnet.base.org', tron: 'https://api.trongrid.io', bitcoin: 'https://mempool.space/api' };
const indexers = { ethereum: 'https://eth.blockscout.com', arbitrum: 'https://arbitrum.blockscout.com', base: 'https://base.blockscout.com' };
const integer = (value: unknown) => {
	if ((typeof value === 'number' && !Number.isSafeInteger(value)) || !/^\d+$/.test(String(value))) {
		throw Error('crypto_chain_response_invalid');
	}
	return BigInt(String(value));
};
const hex = (value: unknown, bytes?: number) => {
	if (typeof value !== 'string' || !(bytes ? new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, 'i') : /^0x[0-9a-f]+$/i).test(value)) {
		throw Error('crypto_chain_response_invalid');
	}
	return value.toLowerCase();
};
const time = (value: unknown) => {
	const v = Number(integer(value));
	if (!Number.isSafeInteger(v) || v <= 0) {
		throw Error('crypto_chain_response_invalid');
	}
	return v;
};
const tronAddress = (value: string) => {
	if (!/^(41)?[0-9a-f]{40}$/i.test(value)) {
		throw Error('crypto_chain_response_invalid');
	}
	return base58check(sha256).encode(Uint8Array.from(Buffer.from('41' + value.slice(-40), 'hex')));
};
// A callTracer response is execution evidence; indexer internal rows are only
// candidates. Reverted ancestors discard every descendant. DELEGATECALL and
// STATICCALL values do not move currency and must never count as payments.
export function verifiedNativeTrace(trace: any, address: string): {
	path: string;
	atomic: string;
}[] {
	const out: {
		path: string;
		atomic: string;
	}[] = [];
	let nodes = 0;
	function visit(call: any, path: string, depth: number) {
		if (++nodes > 20000 || depth > 256 || !call || typeof call !== 'object') {
			throw Error('crypto_trace_invalid');
		}
		if (call.error || call.revertReason) {
			return;
		}
		const type = String(call.type).toUpperCase();
		if (!['CALL', 'CALLCODE', 'DELEGATECALL', 'STATICCALL', 'CREATE', 'CREATE2', 'SELFDESTRUCT'].includes(type)) {
			throw Error('crypto_trace_invalid');
		}
		if (['CALL', 'CREATE', 'CREATE2', 'SELFDESTRUCT'].includes(type) && call.to && hex(call.to, 20) === address.toLowerCase()) {
			const amount = BigInt(hex(call.value ?? '0x0'));
			if (amount > 0n) {
				out.push({ path, atomic: amount.toString() });
			}
		}
		if (call.calls !== undefined && !Array.isArray(call.calls)) {
			throw Error('crypto_trace_invalid');
		}
		for (const [i, child] of (call.calls || []).entries())
			visit(child, path ? `${path}.${i}` : String(i), depth + 1);
	}
	visit(trace, '', 0);
	return out;
}
export function createCryptoObserver(env: NodeJS.ProcessEnv = process.env, fetcher = fetch, options: {
	requestIntervalMs?: number;
} = {}) {
	const pool = createCryptoRpc(env, ((url, init) => request(url, init)) as typeof fetch);
	const scanBudget = new AsyncLocalStorage<{
		until: number;
		requests: number;
	}>();
	const nextRequest = new Map<string, number>();
	const startQueues = new Map<string, Promise<void>>();
	const lastStart = new Map<string, number>();
	const interval = options.requestIntervalMs ?? 100; // <=10 requests/sec/provider per instance
	if (!Number.isInteger(interval) || interval < 0 || interval > 1000) {
		throw Error('crypto_observer_options_invalid');
	}
	async function request(url: string, init: RequestInit = {}) {
		const budget = scanBudget.getStore();
		if (budget && (++budget.requests > 250 || Date.now() >= budget.until)) {
			throw Error('crypto_scan_budget_exceeded');
		}
		const origin = new URL(url).origin, now = Date.now();
		const scheduled = Math.max(now, nextRequest.get(origin) || 0);
		if (scheduled - now > 12000 || (budget && scheduled >= budget.until)) {
			throw Error('crypto_rate_limited');
		}
		nextRequest.set(origin, scheduled + interval);
		// Serialize starts, not response completion. Overdue timers must not release a burst.
		const previous = startQueues.get(origin) || Promise.resolve();
		let release!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		startQueues.set(origin, gate);
		await previous;
		try {
			let wait: number;
			while ((wait = (lastStart.get(origin) ?? -Infinity) + interval - Date.now()) > 0) {
				if (wait > 12000 || (budget && Date.now() + wait >= budget.until)) {
					throw Error('crypto_rate_limited');
				}
				await new Promise(resolve => setTimeout(resolve, wait));
			}
			if (budget && Date.now() >= budget.until) {
				throw Error('crypto_scan_budget_exceeded');
			}
			const remaining = budget ? Math.min(12000, budget.until - Date.now()) : 12000;
			lastStart.set(origin, Date.now());
			return fetcher(url, { ...init, signal: AbortSignal.timeout(Math.max(1, remaining)) });
		}
		finally {
			release();
			if (startQueues.get(origin) === gate) {
				startQueues.delete(origin);
			}
		}
	}
	async function json(url: string, body?: any, headers: any = {}, preservePrice = false) {
		const r = await request(url, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(12000), headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
		if (!r.ok) {
			throw Error('crypto_network_unavailable');
		}
		const source = await readBoundedText(r, { limitBytes: 2 * 1024 * 1024, timeoutMs: 12000 });
		// Preserve the source decimal rate, rather than round through a JS double.
		return JSON.parse(preservePrice ? source.replace(/("usd"\s*:\s*)(\d+(?:\.\d+)?)(?=\s*[,}])/g, '$1"$2"') : source);
	}
	const endpoint = (n: CryptoNetwork) => (env[`DIRECT_CRYPTO_${n.toUpperCase()}_RPC`] || endpointDefaults[n]).replace(/\/$/, '');
	const tronHeaders = env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': env.TRONGRID_API_KEY } : {};
	async function rpc(n: CryptoNetwork, method: string, params: any[]) {
		if (['ethereum', 'arbitrum', 'base'].includes(n) && !env[`DIRECT_CRYPTO_${n.toUpperCase()}_RPC`]) {
			return pool.call(n as any, method, params);
		}
		const v = await json(endpoint(n), { jsonrpc: '2.0', id: 1, method, params });
		if (v.error || v.result === undefined) {
			throw Error('crypto_network_unavailable');
		}
		return v.result;
	}
	async function check(n: CryptoNetwork) {
		if (n === 'bitcoin') {
			// Esplora must identify Bitcoin mainnet, not merely report any chain tip.
			const genesis = await request(endpoint(n) + '/block-height/0', { redirect: 'error', signal: AbortSignal.timeout(12000) });
			if (!genesis.ok || (await readBoundedText(genesis, { limitBytes: 128, timeoutMs: 12000 })).trim() !== '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f') {
				throw Error('crypto_network_invalid');
			}
			if (time(await json(endpoint(n) + '/blocks/tip/height')) < 1) {
				throw Error('crypto_network_invalid');
			}
		}
		else if (n === 'tron') {
			// TIP-474 publishes the mainnet genesis ID; verify network identity
			// independently of token ticker or contract account history.
			const genesis = await json(endpoint(n) + '/walletsolidity/getblockbynum', { num: 0 }, tronHeaders);
			if (genesis.blockID !== '00000000000000001ebf88508a03865c71d452e25f4d51194196a1d22b6653dc') {
				throw Error('crypto_network_invalid');
			}
			const contract = await json(endpoint(n) + '/walletsolidity/getaccount', { address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', visible: true }, tronHeaders);
			if (contract.address !== 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' || contract.type !== 'Contract') {
				throw Error('crypto_network_invalid');
			}
			const v = await json(endpoint(n) + '/walletsolidity/getnowblock', {}, tronHeaders);
			time(v.block_header?.raw_data?.number);
		}
		else {
			if (BigInt(hex(await rpc(n, 'eth_chainId', []))) !== BigInt(cryptoNetworks[n].chainId!)) {
				throw Error('crypto_network_invalid');
			}
			const block = await rpc(n, 'eth_getBlockByNumber', ['finalized', false]);
			if (!block) {
				throw Error('crypto_finality_unavailable');
			}
			hex(block.number);
			hex(block.hash, 32);
		}
		return true;
	}
	async function boundary(n: CryptoNetwork) {
		await check(n);
		if (n === 'bitcoin') {
			const height = time(await json(endpoint(n) + '/blocks/tip/height'));
			const r = await request(endpoint(n) + `/block-height/${height}`, { redirect: 'error', signal: AbortSignal.timeout(12000) });
			if (!r.ok) {
				throw Error('crypto_network_unavailable');
			}
			const hash = (await readBoundedText(r, { limitBytes: 128, timeoutMs: 12000 })).trim();
			if (!/^[0-9a-f]{64}$/i.test(hash)) {
				throw Error('crypto_chain_response_invalid');
			}
			const block = await json(endpoint(n) + '/block/' + hash);
			return { height: String(height), timestamp: time(block.timestamp) * 1000 };
		}
		if (n === 'tron') {
			const block = await json(endpoint(n) + '/wallet/getnowblock', {}, tronHeaders);
			return { height: integer(block.block_header?.raw_data?.number).toString(), timestamp: time(block.block_header?.raw_data?.timestamp) };
		}
		const block = await rpc(n, 'eth_getBlockByNumber', ['latest', false]);
		return { height: BigInt(hex(block.number)).toString(), timestamp: Number(BigInt(hex(block.timestamp))) * 1000 };
	}
	async function pages(url: string) {
		const out: any[] = [];
		let next: any = null;
		for (let page = 0; page < 20; page++) {
			const u = new URL(url);
			if (next) {
				for (const [k, v] of Object.entries(next))
					u.searchParams.set(k, String(v));
			}
			const data = await json(u.href);
			if (!Array.isArray(data.items)) {
				throw Error('crypto_indexer_invalid');
			}
			out.push(...data.items);
			if (!data.next_page_params) {
				return out;
			}
			next = data.next_page_params;
		}
		throw Error('crypto_history_limit');
	}
	async function scanWithinBudget(snapshot: any, address: string, knownTxids: string[]): Promise<ChainTransfer[]> {
		const asset = cryptoAsset(snapshot.assetId), n = asset.network, out: ChainTransfer[] = [];
		await check(n);
		const boundary = time(snapshot.createdAt) - 300000;
		const startBlock = snapshot.startBlock === undefined ? null : integer(snapshot.startBlock);
		const dedup = () => [...new Map(out.filter(t => BigInt(t.atomic) > 0n).map(t => [t.key, t])).values()];
		if (n === 'bitcoin') {
			const tip = time(await json(endpoint(n) + '/blocks/tip/height'));
			let suffix = '', done = false;
			for (let page = 0; page < 20 && !done; page++) {
				let rows = await json(`${endpoint(n)}/address/${encodeURIComponent(address)}/txs${suffix}`);
				if (!Array.isArray(rows)) {
					throw Error('crypto_chain_response_invalid');
				}
				const pageLength = rows.length;
				if (page === 0) {
					rows = [...new Map([...knownTxids.map(txid => ({ txid })), ...rows].map(row => [row.txid, row])).values()];
				}
				for (const candidate of rows) {
					if (!/^[a-f0-9]{64}$/i.test(candidate.txid)) {
						throw Error('crypto_chain_response_invalid');
					}
					// Verify each candidate using the transaction endpoint; history rows
					// never suffice to attest value or confirmations.
					const tx = await json(`${endpoint(n)}/tx/${candidate.txid}`);
					if (tx.txid !== candidate.txid || !Array.isArray(tx.vout)) {
						throw Error('crypto_chain_response_invalid');
					}
					let confirmed = false, timestamp = 0;
					if (tx.status?.confirmed === true) {
						const height = Number(integer(tx.status.block_height));
						timestamp = time(tx.status.block_time) * 1000;
						if (timestamp < boundary || (startBlock !== null && BigInt(height) <= startBlock)) {
							done = true;
							continue;
						}
						const status = await json(`${endpoint(n)}/block/${tx.status.block_hash}/status`);
						confirmed = status.in_best_chain === true && status.height === height && height <= tip && tip - height + 1 >= 6;
					}
					for (const [vout, v] of tx.vout.entries())
						if (v.scriptpubkey_address === address) {
							out.push({ key: `bitcoin:${tx.txid}:${vout}`, txid: tx.txid, atomic: integer(v.value).toString(), confirmed, timestamp, ...(tx.status?.confirmed === true ? { blockHeight: String(tx.status.block_height) } : {}) });
						}
				}
				if (pageLength < 25 || done) {
					break;
				}
				suffix = '/chain/' + rows.at(-1).txid;
				if (page === 19) {
					throw Error('crypto_history_limit');
				}
			}
			return dedup();
		}
		if (n === 'tron') {
			let fingerprint = '';
			const visited = new Set<string>();
			for (let page = 0; page < 20; page++) {
				const query = new URLSearchParams({ only_confirmed: 'true', only_to: 'true', contract_address: asset.contract!, limit: '200', min_timestamp: String(boundary), ...(fingerprint ? { fingerprint } : {}) });
				const data = await json(`${endpoint(n)}/v1/accounts/${address}/transactions/trc20?${query}`, undefined, tronHeaders);
				if (!Array.isArray(data.data)) {
					throw Error('crypto_chain_response_invalid');
				}
				if (page === 0) {
					data.data.unshift(...knownTxids.map(transaction_id => ({ transaction_id, to: address, token_info: { address: asset.contract }, type: 'Transfer' })));
				}
				for (const item of data.data) {
					if (item.to !== address || item.token_info?.address !== asset.contract || item.type !== 'Transfer') {
						continue;
					}
					if (!/^[0-9a-f]{64}$/i.test(item.transaction_id)) {
						throw Error('crypto_chain_response_invalid');
					}
					if (visited.has(item.transaction_id)) {
						continue;
					}
					visited.add(item.transaction_id);
					const tx = await json(endpoint(n) + '/walletsolidity/gettransactionbyid', { value: item.transaction_id }, tronHeaders);
					const receipt = await json(endpoint(n) + '/walletsolidity/gettransactioninfobyid', { value: item.transaction_id }, tronHeaders);
					if (tx.txID !== item.transaction_id || tx.ret?.[0]?.contractRet !== 'SUCCESS' || receipt.id !== item.transaction_id || receipt.result === 'FAILED' || receipt.receipt?.result !== 'SUCCESS') {
						continue;
					}
					const timestamp = time(receipt.blockTimeStamp);
					if (timestamp < boundary || (startBlock !== null && integer(receipt.blockNumber) <= startBlock)) {
						continue;
					}
					const solid = await json(endpoint(n) + '/walletsolidity/getblockbynum', { num: Number(integer(receipt.blockNumber)) }, tronHeaders);
					if (!Array.isArray(solid.transactions) || !solid.transactions.some((t: any) => t.txID === receipt.id)) {
						continue;
					}
					for (const [index, log] of (receipt.log || []).entries()) {
						if (tronAddress(String(log.address)) !== asset.contract || !Array.isArray(log.topics) || log.topics.length !== 3 || String(log.topics[0]).toLowerCase() !== transferTopic.slice(2)) {
							continue;
						}
						if (!/^[0-9a-f]{64}$/i.test(log.topics[2]) || !/^0{24}/.test(log.topics[2]) || !/^[0-9a-f]{64}$/i.test(log.data)) {
							throw Error('crypto_chain_response_invalid');
						}
						if (tronAddress(log.topics[2].slice(-40)) !== address) {
							continue;
						}
						out.push({ key: `tron:${receipt.id}:${index}`, txid: receipt.id, atomic: BigInt('0x' + log.data).toString(), confirmed: true, timestamp, blockHeight: integer(receipt.blockNumber).toString() });
					}
				}
				fingerprint = data.meta?.fingerprint || '';
				if (!fingerprint) {
					return dedup();
				}
			}
			throw Error('crypto_history_limit');
		}
		const finalized = await rpc(n, 'eth_getBlockByNumber', ['finalized', false]), finalHeight = BigInt(hex(finalized.number));
		const base = env[`DIRECT_CRYPTO_${n.toUpperCase()}_INDEXER`] || indexers[n];
		const paths = asset.contract ? ['token-transfers'] : ['transactions', 'internal-transactions'];
		const candidates = new Map<string, boolean>(knownTxids.map(id => [hex(id, 32), !asset.contract]));
		for (const path of paths)
			for (const item of await pages(`${base}/api/v2/addresses/${address}/${path}?filter=to`)) {
				if (String(item.to?.hash || item.to).toLowerCase() !== address.toLowerCase()) {
					continue;
				}
				if (asset.contract && String(item.token?.address_hash).toLowerCase() !== asset.contract) {
					continue;
				}
				const hash = hex(item.transaction_hash || item.hash, 32);
				candidates.set(hash, (candidates.get(hash) || false) || path === 'internal-transactions');
			}
		for (const [hash, internal] of candidates) {
			const receipt = await rpc(n, 'eth_getTransactionReceipt', [hash]);
			if (!receipt || BigInt(hex(receipt.status)) !== 1n) {
				continue;
			}
			if (hex(receipt.transactionHash, 32) !== hash) {
				throw Error('crypto_chain_response_invalid');
			}
			const height = BigInt(hex(receipt.blockNumber)), block = await rpc(n, 'eth_getBlockByNumber', [receipt.blockNumber, false]);
			if (!block || hex(block.hash, 32) !== hex(receipt.blockHash, 32) || BigInt(hex(block.number)) !== height) {
				continue;
			}
			const timestamp = Number(BigInt(hex(block.timestamp))) * 1000;
			if (!Number.isSafeInteger(timestamp) || timestamp < boundary || (startBlock !== null && height <= startBlock)) {
				continue;
			}
			const confirmed = height <= finalHeight;
			if (asset.contract) {
				for (const log of receipt.logs || []) {
					if (log.removed === true || String(log.address).toLowerCase() !== asset.contract || !Array.isArray(log.topics) || log.topics.length !== 3 || String(log.topics[0]).toLowerCase() !== transferTopic) {
						continue;
					}
					const recipient = hex(log.topics[2], 32);
					if (!recipient.startsWith('0x' + '0'.repeat(24)) || '0x' + recipient.slice(-40) !== address.toLowerCase()) {
						continue;
					}
					if (hex(log.transactionHash, 32) !== hash || hex(log.blockHash, 32) !== hex(receipt.blockHash, 32)) {
						throw Error('crypto_chain_response_invalid');
					}
					out.push({ key: `${n}:${hash}:${BigInt(hex(log.logIndex))}`, txid: hash, atomic: BigInt(hex(log.data, 32)).toString(), confirmed, timestamp, blockHeight: height.toString() });
				}
			}
			else {
				const tx = await rpc(n, 'eth_getTransactionByHash', [hash]);
				if (!tx || hex(tx.hash, 32) !== hash || hex(tx.blockHash, 32) !== hex(receipt.blockHash, 32)) {
					throw Error('crypto_chain_response_invalid');
				}
				if (internal) {
					const trace = await rpc(n, 'debug_traceTransaction', [hash, { tracer: 'callTracer', timeout: '10s', tracerConfig: { onlyTopCall: false } }]);
					if (String(trace.from).toLowerCase() !== String(tx.from).toLowerCase() || String(trace.to).toLowerCase() !== String(tx.to).toLowerCase() || BigInt(hex(trace.value ?? '0x0')) !== BigInt(hex(tx.value))) {
						throw Error('crypto_trace_invalid');
					}
					for (const transfer of verifiedNativeTrace(trace, address))
						out.push({ key: `${n}:${hash}:${transfer.path ? 'internal:' + transfer.path : 'native'}`, txid: hash, atomic: transfer.atomic, confirmed, timestamp, blockHeight: height.toString() });
				}
				else if (String(tx.to).toLowerCase() === address.toLowerCase()) {
					out.push({ key: `${n}:${hash}:native`, txid: hash, atomic: BigInt(hex(tx.value)).toString(), confirmed, timestamp, blockHeight: height.toString() });
				}
			}
			// A reorg during trace/log verification invalidates this entire scan.
			const current = await rpc(n, 'eth_getBlockByNumber', [receipt.blockNumber, false]);
			if (!current || hex(current.hash, 32) !== hex(receipt.blockHash, 32)) {
				throw Error('crypto_chain_reorg');
			}
		}
		return dedup();
	}
	async function scan(snapshot: any, address: string, knownTxids: string[] = []) {
		if (!Array.isArray(knownTxids) || knownTxids.length > 200) {
			throw Error('crypto_history_limit');
		}
		return scanBudget.run({ until: Date.now() + 45000, requests: 0 }, () => scanWithinBudget(snapshot, address, [...new Set(knownTxids)]));
	}
	let cache: {
		until: number;
		prices: any;
	} | null = null;
	let quoteRefresh: Promise<void> | null = null;
	async function quote(assetId: string) {
		const a = cryptoAsset(assetId);
		if (!cache || cache.until < Date.now()) {
			quoteRefresh ||= (async () => {
				const prices = await json(env.DIRECT_CRYPTO_PRICE_URL || 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,tether,usd-coin&vs_currencies=usd&include_last_updated_at=true', undefined, {}, true);
				cache = { until: Date.now() + 60000, prices };
			})().finally(() => { quoteRefresh = null; });
			await quoteRefresh;
		}
		const row = cache!.prices[a.rateId];
		if (!row || typeof row.usd !== 'string' || !/^\d{1,16}(\.\d{1,12})?$/.test(row.usd) || BigInt(row.usd.replace('.', '')) <= 0n || !Number.isSafeInteger(row.last_updated_at) || Math.abs(Date.now() / 1000 - row.last_updated_at) > 300) {
			throw Error('crypto_quote_unavailable');
		}
		return row.usd;
	}
	const balances = createCryptoBalanceObserver(rpc, check);
	const scanBalances = (snapshot: any, address: string, context: BalanceContext) => scanBudget.run({ until: Date.now() + 45000, requests: 0 }, () => balances.scan(snapshot, address, context));
	return { scan, quote, check, boundary, scanBalances };
}
