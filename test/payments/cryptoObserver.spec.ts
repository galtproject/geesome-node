import test from 'node:test';
import assert from 'node:assert/strict';
import { createCryptoObserver, verifiedNativeTrace } from '../../app/modules/payments/cryptoObserver.js';
import { cryptoAsset } from '../../app/modules/payments/cryptoAssets.js';
const address = '0x' + '1'.repeat(40), sender = '0x' + '2'.repeat(40), txid = '0x' + '3'.repeat(64), blockHash = '0x' + '4'.repeat(64);
const now = Math.floor(Date.now() / 1000), topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const json = (v: any) => new Response(JSON.stringify(v));
function evmFixture(options: any = {}) {
	const calls: string[] = [];
	const fetcher = async (url: any, init: any = {}) => {
		if (String(url).includes('blockscout')) {
			return json({ items: options.emptyHistory ? [] : [{ transaction_hash: txid, to: { hash: address }, token: { address_hash: cryptoAsset('usdc-base').contract }, value: '999999999999999999999999' }], next_page_params: null });
		}
		const body = JSON.parse(init.body), method = body.method;
		calls.push(method);
		let result: any;
		if (method === 'eth_chainId') {
			result = options.chainId || '0x2105';
		}
		else if (method === 'eth_getBlockByNumber') {
			result = options.noFinal && body.params[0] === 'finalized' ? null : { number: body.params[0] === 'finalized' ? (options.finalHeight || '0x64') : '0x64', hash: options.reorg && calls.filter(c => c === 'eth_getBlockByNumber').length > 3 ? '0x' + '5'.repeat(64) : blockHash, timestamp: '0x' + now.toString(16) };
		}
		else if (method === 'eth_getTransactionReceipt') {
			result = options.missingReceipt ? null : { transactionHash: txid, status: options.failed ? '0x0' : '0x1', blockNumber: '0x64', blockHash, logs: [{ address: options.wrongContract ? '0x' + '6'.repeat(40) : cryptoAsset('usdc-base').contract, topics: [topic, '0x' + '0'.repeat(64), '0x' + '0'.repeat(24) + address.slice(2)], data: '0x' + (5000000n).toString(16).padStart(64, '0'), logIndex: '0x0', transactionHash: txid, blockHash }] };
		}
		else if (method === 'eth_getTransactionByHash') {
			result = { hash: txid, blockHash, to: address, from: sender, value: '0x5' };
		}
		else if (method === 'debug_traceTransaction') {
			if (options.noTrace) {
				return json({ error: { message: 'method unavailable' } });
			}
			result = { type: 'CALL', from: sender, to: address, value: '0x5', calls: [{ type: 'CALL', to: address, value: '0x7' }, { type: 'CALL', to: address, value: '0x100', error: 'execution reverted', calls: [{ type: 'CALL', to: address, value: '0x100' }] }, { type: 'DELEGATECALL', to: address, value: '0x5' }] };
		}
		else {
			throw Error('unexpected ' + method);
		}
		return json({ result });
	};
	return { observer: createCryptoObserver({ DIRECT_CRYPTO_BASE_RPC: 'https://rpc.base.test', DIRECT_CRYPTO_BASE_INDEXER: 'https://base.blockscout.test' } as any, fetcher as any, { requestIntervalMs: 0 }), calls };
}
const snapshot = (assetId = 'usdc-base', startBlock = '99') => ({ assetId, createdAt: (now - 10) * 1000, startBlock });
test('token receipt proves official contract, recipient, exact value and finality; duplicate candidates dedup', async () => {
	const { observer } = evmFixture();
	const out = await observer.scan(snapshot(), address);
	assert.equal(out.length, 1);
	assert.equal(out[0].atomic, '5000000');
	assert.equal(out[0].confirmed, true);
	assert.equal(out[0].blockHeight, '100');
	assert.equal((await evmFixture({ wrongContract: true }).observer.scan(snapshot(), address)).length, 0);
	assert.equal((await evmFixture({ failed: true }).observer.scan(snapshot(), address)).length, 0);
	assert.equal((await evmFixture({ finalHeight: '0x63' }).observer.scan(snapshot(), address))[0].confirmed, false);
	assert.equal((await observer.scan(snapshot('usdc-base', '100'), address)).length, 0);
});
test('wrong chain, missing finalized block and canonical reorg fail closed', async () => {
	await assert.rejects(evmFixture({ chainId: '0x1' }).observer.scan(snapshot(), address), /crypto_network_invalid/);
	await assert.rejects(evmFixture({ noFinal: true }).observer.scan(snapshot(), address), /crypto_finality_unavailable/);
	await assert.rejects(evmFixture({ reorg: true }).observer.scan(snapshot(), address), /crypto_chain_reorg/);
});
test('native internal transfers derive only from complete RPC trace; root counted once', async () => {
	const { observer, calls } = evmFixture();
	const out = await observer.scan(snapshot('eth-base'), address);
	assert.deepEqual(out.map(t => t.atomic), ['5', '7']);
	assert.equal(out.filter(t => t.key.endsWith(':native')).length, 1);
	assert.equal(calls.filter(c => c === 'debug_traceTransaction').length, 1);
	await assert.rejects(evmFixture({ noTrace: true }).observer.scan(snapshot('eth-base'), address), /crypto_network_unavailable/);
});
test('trace reverted ancestors and delegate/static contexts never produce payments', () => {
	assert.deepEqual(verifiedNativeTrace({ type: 'CALL', to: sender, value: '0x0', calls: [{ type: 'CALL', error: 'revert', calls: [{ type: 'CALL', to: address, value: '0xff' }] }, { type: 'STATICCALL', to: address, value: '0xff' }] }, address), []);
	assert.throws(() => verifiedNativeTrace({ type: 'garbage' }, address), /crypto_trace_invalid/);
});
test('rate source preserves exact decimals, rejects stale/future/zero data and caches only bounded lifetime', async (t) => {
	t.mock.timers.enable({ apis: ['Date'], now: now * 1000 });
	const price = (usd: any, date = now) => createCryptoObserver({}, (async () => json({ ethereum: { usd, last_updated_at: date } })) as any, { requestIntervalMs: 0 });
	assert.equal(await price(3000.123456789012).quote('eth-ethereum'), '3000.123456789012');
	const market = createCryptoObserver({}, (async () => json({ 'usd-coin': { usd: 0.98, last_updated_at: now }, tether: { usd: 1.02, last_updated_at: now } })) as any, { requestIntervalMs: 0 });
	assert.equal(await market.quote('usdc-base'), '0.98');
	assert.equal(await market.quote('usdt-tron'), '1.02');
	await assert.rejects(price(3000, now - 301).quote('eth-base'), /crypto_quote_unavailable/);
	await assert.rejects(price(3000, now + 301).quote('eth-base'), /crypto_quote_unavailable/);
	await assert.rejects(price(0).quote('eth-base'), /crypto_quote_unavailable/);
	await assert.rejects(price(1e-13).quote('eth-base'), /crypto_quote_unavailable/);
	let requests = 0;
	const cached = createCryptoObserver({}, (async () => {
		requests++;
		return json({ ethereum: { usd: requests, last_updated_at: Math.floor(Date.now() / 1000) } });
	}) as any, { requestIntervalMs: 0 });
	assert.equal(await cached.quote('eth-base'), '1');
	t.mock.timers.tick(59000);
	assert.equal(await cached.quote('eth-base'), '1');
	assert.equal(requests, 1);
	t.mock.timers.tick(1001);
	assert.equal(await cached.quote('eth-base'), '2');
	assert.equal(requests, 2);
});
test('Bitcoin candidates verified from tx outputs, mainnet genesis and best-chain six confirmations', async () => {
	const btc = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', id = 'a'.repeat(64);
	const tx = { txid: id, status: { confirmed: true, block_height: 100, block_hash: 'b'.repeat(64), block_time: now }, vout: [{ scriptpubkey_address: btc, value: 8334 }] };
	const fixture = (tip = 105, best = true, genesis = true) => createCryptoObserver({}, (async (url: any) => {
		const path = new URL(String(url)).pathname;
		if (path === '/api/block-height/0') {
			return new Response(genesis ? '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f' : 'bad');
		}
		if (path === '/api/blocks/tip/height') {
			return json(tip);
		}
		if (path.includes('/address/')) {
			return json([{ ...tx, vout: [{ scriptpubkey_address: btc, value: 999999 }] }]);
		}
		if (path.endsWith('/status')) {
			return json({ in_best_chain: best, height: 100 });
		}
		return json(tx);
	}) as any, { requestIntervalMs: 0 });
	assert.equal((await fixture().scan(snapshot('btc-bitcoin'), btc))[0].atomic, '8334');
	assert.equal((await fixture(104).scan(snapshot('btc-bitcoin'), btc))[0].confirmed, false);
	assert.equal((await fixture(105, false).scan(snapshot('btc-bitcoin'), btc))[0].confirmed, false);
	await assert.rejects(fixture(105, true, false).scan(snapshot('btc-bitcoin'), btc), /crypto_network_invalid/);
});
test('TRON requires solidified successful tx, block inclusion and official USDT log proof', async () => {
	const recipient = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', id = 'a'.repeat(64), contractHex = 'a614f803b6fd780986a42c78ec9c7f77e6ded13c';
	const fixture = (failed = false, include = true) => createCryptoObserver({}, (async (url: any, init: any = {}) => {
		const path = new URL(String(url)).pathname;
		if (path.endsWith('/getblockbynum') && JSON.parse(init.body).num === 0) {
			return json({ blockID: '00000000000000001ebf88508a03865c71d452e25f4d51194196a1d22b6653dc' });
		}
		if (path.endsWith('/getaccount')) {
			return json({ address: recipient, type: 'Contract' });
		}
		if (path.endsWith('/getnowblock')) {
			return json({ block_header: { raw_data: { number: 101 } } });
		}
		if (path.includes('/v1/')) {
			return json({ data: [{ to: recipient, token_info: { address: recipient }, type: 'Transfer', transaction_id: id }], meta: {} });
		}
		if (path.endsWith('/gettransactionbyid')) {
			return json({ txID: id, ret: [{ contractRet: failed ? 'REVERT' : 'SUCCESS' }] });
		}
		if (path.endsWith('/getblockbynum')) {
			return json({ transactions: include ? [{ txID: id }] : [] });
		}
		return json({ id, blockNumber: 100, blockTimeStamp: now * 1000, receipt: { result: 'SUCCESS' }, log: [{ address: contractHex, topics: [topic.slice(2), '0'.repeat(64), '0'.repeat(24) + contractHex], data: '5000000'.padStart(64, '0') }] });
	}) as any, { requestIntervalMs: 0 });
	assert.equal((await fixture().scan(snapshot('usdt-tron'), recipient)).length, 1);
	assert.equal((await fixture(true).scan(snapshot('usdt-tron'), recipient)).length, 0);
	assert.equal((await fixture(false, false).scan(snapshot('usdt-tron'), recipient)).length, 0);
});
test('known transfer is reverified when indexer history disappears and missing receipt revokes observation', async () => {
	assert.equal((await evmFixture({ emptyHistory: true }).observer.scan(snapshot(), address)).length, 0);
	const recovered = await evmFixture({ emptyHistory: true }).observer.scan(snapshot(), address, [txid]);
	assert.equal(recovered.length, 1);
	assert.equal(recovered[0].atomic, '5000000');
	assert.equal((await evmFixture({ emptyHistory: true, missingReceipt: true }).observer.scan(snapshot(), address, [txid])).length, 0);
	await assert.rejects(evmFixture().observer.scan(snapshot(), address, new Array(201).fill(txid)), /crypto_history_limit/);
});
test('pathological history is bounded by the scan request budget', async () => {
	let i = 0;
	const observer = createCryptoObserver({ DIRECT_CRYPTO_BASE_RPC: 'https://rpc.base.test' }, (async (url: any, init: any = {}) => {
		if (String(url).includes('blockscout')) {
			return json({ items: Array.from({ length: 100 }, () => ({ transaction_hash: '0x' + (++i).toString(16).padStart(64, '0'), to: { hash: address }, token: { address_hash: cryptoAsset('usdc-base').contract } })), next_page_params: null });
		}
		const request = JSON.parse(init.body);
		if (request.method === 'eth_chainId') {
			return json({ result: '0x2105' });
		}
		if (request.method === 'eth_getBlockByNumber') {
			return json({ result: { number: '0x64', hash: blockHash, timestamp: '0x' + now.toString(16) } });
		}
		if (request.method === 'eth_getTransactionReceipt') {
			return json({ result: { transactionHash: request.params[0], status: '0x1', blockNumber: '0x64', blockHash, logs: [] } });
		}
		throw Error('unexpected');
	}) as any, { requestIntervalMs: 0 });
	await assert.rejects(observer.scan(snapshot(), address), /crypto_scan_budget_exceeded/);
});
test('per-provider spacing limits bursts and concurrent quote refresh shares a single request', async () => {
	const starts: number[] = [];
	const observer = createCryptoObserver({ DIRECT_CRYPTO_BASE_RPC: 'https://rpc.base.test' }, (async () => { starts.push(Date.now()); return json({ result: '0x2105' }); }) as any, { requestIntervalMs: 20 });
	await Promise.all([observer.check('base'), observer.check('base'), observer.check('base')].map(p => p.catch(() => { })));
	assert.equal(starts.length, 6);
	for (let i = 1; i < starts.length; i++)
		assert.ok(starts[i] - starts[i - 1] >= 10);
	let count = 0;
	const price = createCryptoObserver({}, (async () => { count++; await new Promise(r => setTimeout(r, 10)); return json({ ethereum: { usd: 3000, last_updated_at: now } }); }) as any, { requestIntervalMs: 0 });
	await Promise.all(Array.from({ length: 30 }, () => price.quote('eth-base')));
	assert.equal(count, 1);
});
test('overdue provider timers retain spacing between actual starts', async (t) => {
	t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: now * 1000 });
	const starts: number[] = [];
	const observer = createCryptoObserver({ DIRECT_CRYPTO_BASE_RPC: 'https://rpc.base.test' }, (async () => {
		starts.push(Date.now());
		return json({ result: '0x2105' });
	}) as any, { requestIntervalMs: 20 });
	const pending = Promise.all(Array.from({ length: 3 }, () => observer.check('base').catch(() => { })));
	const flush = async () => { for (let i = 0; i < 100; i++)
		await Promise.resolve(); };
	await flush();
	assert.equal(starts.length, 1);
	// A blocked event loop makes all previously scheduled timers overdue together.
	t.mock.timers.tick(1000);
	await flush();
	assert.equal(starts.length, 2);
	for (let i = 0; i < 4; i++) {
		t.mock.timers.tick(20);
		await flush();
	}
	await pending;
	assert.equal(starts.length, 6);
	for (let i = 1; i < starts.length; i++)
		assert.ok(starts[i] - starts[i - 1] >= 20);
});
