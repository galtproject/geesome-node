import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transaction, Interface } from 'ethers-v6';
import { automationConfig } from '../../app/modules/payments/cryptoAutomationConfig.js';
import { managedWallet } from '../../app/modules/payments/cryptoManagedWallet.js';
import { usdCents } from '../../app/modules/payments/cryptoAmounts.js';
import { createCryptoRpc } from '../../app/modules/payments/cryptoRpc.js';
import { createEvmAdapter } from '../../app/modules/payments/cryptoEvm.js';
import { validateSwapCalldata } from '../../app/modules/payments/cryptoSwap.js';
const seed = 'test test test test test test test test test test test junk';
const env = { DIRECT_CRYPTO_SEED_PHRASE: seed };
test('managed account reserves service zero, derives persistent public-compatible reader addresses and rejects invalid seed', () => {
	const wallet = managedWallet(env)!;
	assert.equal(wallet.address(0), '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
	assert.equal(wallet.address(1), '0x70997970c51812dc3a010c7d01b50e0d17dc79c8');
	assert.equal(wallet.fingerprint, managedWallet(env)!.fingerprint);
	assert.throws(() => managedWallet({ DIRECT_CRYPTO_SEED_PHRASE: 'secret-invalid-phrase' }), /^Error: crypto_seed_invalid$/);
	assert.throws(() => wallet.address(-1), /crypto_address_index_invalid/);
	assert.equal(managedWallet({}), null);
	assert.throws(() => automationConfig({ DIRECT_CRYPTO_CONFIG: '{"serviceLowCents":500}' }), /crypto_config_invalid/);
	assert.equal(usdCents(1000000000000000n, '2500'), 250n);
});
test('Chainlist cache persists failure order, validates chain before broadcast and survives discovery outage', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'crypto-rpc-'));
	const path = join(dir, 'rpc.json');
	let now = 100000, broken = true, discovery = true;
	const calls: any[] = [];
	const fetcher: any = async (url: string, init: any = {}) => {
		if (url === 'https://chainlist.test/') {
			if (!discovery) {
				throw Error('offline');
			}
			return Response.json([
				{
					chainId: 1,
					rpc: [
						'https://bad.test/',
						'https://good.test/',
						'http://unsafe.test/',
						'https://${API_KEY}.test/',
					],
				},
			]);
		}
		const b = JSON.parse(init.body);
		calls.push([url, b.method]);
		if (url.includes('bad') && broken) {
			throw Error('offline');
		}
		return Response.json({ result: b.method === 'eth_chainId' ? '0x1' : '0x123' });
	};
	const config = {
		...automationConfig({}),
		rpcCacheFile: path,
		chainlistUrl: 'https://chainlist.test/',
	};
	try {
		const rpc = createCryptoRpc({}, fetcher, config, () => now);
		assert.equal(await rpc.call('ethereum', 'eth_blockNumber'), '0x123');
		const saved = JSON.parse(await readFile(path, 'utf8'));
		assert.deepEqual(saved.networks.ethereum.map((e) => e.url), ['https://good.test/', 'https://bad.test/']);
		discovery = false;
		broken = false;
		now += config.rpcRefreshMs + 1;
		assert.equal(await createCryptoRpc({}, fetcher, config, () => now).call('ethereum', 'eth_blockNumber'), '0x123');
		calls.length = 0;
		const wrong: any = async (_url, init) => {
			calls.push(JSON.parse(init.body).method);
			return Response.json({ result: '0x2105' });
		};
		await assert.rejects(createCryptoRpc({ DIRECT_CRYPTO_ETHEREUM_RPC: 'https://wrong.test/' }, wrong, config).call('ethereum', 'eth_sendRawTransaction', ['signed']), /crypto_rpc_unavailable/);
		assert.deepEqual(calls, ['eth_chainId']);
	}
	finally {
		await rm(dir, { recursive: true, force: true });
	}
});
test('adapter signs EIP1559 transactions locally, simulates with gas balance only, estimates Base L1 fees and checks finalized canonical receipts', async () => {
	const methods: any[] = [];
	let canonical = true, success = true, finalized = '0x10';
	const rpc = {
		call: async (_n: string, m: string, p: any[]) => {
			methods.push([m, p]);
			if (m === 'eth_getBlockByNumber') {
				return p[0] === 'latest'
					? { baseFeePerGas: '0xa' }
					: p[0] === 'finalized'
						? { number: finalized }
						: { hash: canonical ? '0x' + '1'.repeat(64) : '0x' + '2'.repeat(64) };
			}
			if (m === 'eth_gasPrice') {
				return '0xc';
			}
			if (m === 'eth_maxPriorityFeePerGas') {
				return '0x2';
			}
			if (m === 'eth_estimateGas') {
				return '0x5208';
			}
			if (m === 'eth_getTransactionCount') {
				return '0x3';
			}
			if (m === 'eth_call') {
				return '0x64';
			}
			if (m === 'eth_getTransactionReceipt') {
				return {
					transactionHash: p[0],
					blockNumber: '0x10',
					blockHash: '0x' + '1'.repeat(64),
					status: success ? '0x1' : '0x0',
				};
			}
			throw Error('unexpected ' + m);
		},
	};
	const adapter = createEvmAdapter(env, { rpc }), signed = await adapter.prepare('base', 1, adapter.transfer(managedWallet(env)!.address(0), 100n));
	const tx = Transaction.from(signed.raw);
	assert.equal(tx.chainId, 8453n);
	assert.equal(tx.nonce, 3);
	assert.equal(tx.from!.toLowerCase(), managedWallet(env)!.address(1));
	assert.equal(tx.maxFeePerGas, 22n);
	assert.equal(BigInt(signed.fee), 26250n * 22n + 125n);
	assert.equal(methods.find(([m]) => m === 'eth_estimateGas')[1][2][signed.sender].balance, '0x' + 'f'.repeat(64));
	assert.equal((await adapter.receipt('base', signed.hash))!.ok, true);
	finalized = '0xf';
	assert.equal(await adapter.receipt('base', signed.hash), null);
	finalized = '0x10';
	canonical = false;
	await assert.rejects(adapter.receipt('base', signed.hash), /crypto_receipt_reorg/);
	canonical = true;
	success = false;
	assert.equal((await adapter.receipt('base', signed.hash))!.ok, false);
});
test('swap resets nonzero allowance and grants only exact amount before requesting a bounded native swap', async () => {
	const iface = new Interface([
		'function approve(address,uint256)',
		'function allowance(address,address) view returns (uint256)',
	]);
	let allowance = 1n;
	const rpc = { call: async () => '0x' + allowance.toString(16) };
	const adapter = createEvmAdapter({ ...env, DIRECT_CRYPTO_ONEINCH_API_KEY: 'fixture' }, { rpc, fetcher: async () => Response.json({ tx: { from: '0x' + '0'.repeat(40) } }) });
	let result = await adapter.swap('base', 'usdc-base', 4000000n);
	assert.equal(result.kind, 'reset');
	assert.equal(iface.decodeFunctionData('approve', result.request.data)[1], 0n);
	allowance = 0n;
	result = await adapter.swap('base', 'usdc-base', 4000000n);
	assert.equal(result.kind, 'approve');
	assert.equal(iface.decodeFunctionData('approve', result.request.data)[1], 4000000n);
	allowance = 4000000n;
	await assert.rejects(adapter.swap('base', 'usdc-base', 4000000n), /crypto_swap_response_invalid/);
});
test('1inch calldata binds source, full amount, native output, service recipient and minimum return for generic and optimized routes', async () => {
	const signatures = (await import('node:module')).createRequire(import.meta.url)('../../app/modules/payments/config/oneinch-v6-swap-abi.json');
	const iface = new Interface(signatures), wallet = managedWallet(env)!, from = wallet.address(0), src = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', router = automationConfig({}).oneInchRouter, minimum = 1000000000000000n, amount = 4000000n;
	let calldata = iface.encodeFunctionData('swap', [
		'0x' + '1'.repeat(40),
		[
			src,
			'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
			'0x' + '2'.repeat(40),
			from,
			amount,
			minimum,
			0n,
		],
		'0x',
	]);
	let requestUrl = '';
	const adapter = createEvmAdapter({ ...env, DIRECT_CRYPTO_ONEINCH_API_KEY: 'fixture' }, {
		rpc: { call: async () => '0x' + amount.toString(16) },
		fetcher: async (url: string) => {
			requestUrl = url;
			return Response.json({
				dstAmount: String(minimum),
				tx: { from, to: router, value: '0', data: calldata },
			});
		},
	});
	assert.equal((await adapter.swap('base', 'usdc-base', amount, minimum)).kind, 'swap');
	assert.equal(new URL(requestUrl).searchParams.get('minReturn'), String(minimum));
	assert.equal(new URL(requestUrl).searchParams.has('slippage'), false);
	calldata = iface.encodeFunctionData('unoswapTo', [
		BigInt(from),
		BigInt(src),
		amount,
		minimum,
		(1n << 252n) | 3n,
	]);
	assert.equal((await adapter.swap('base', 'usdc-base', amount, minimum)).kind, 'swap');
	for (const bad of [
		iface.encodeFunctionData('unoswapTo', [
			4n,
			BigInt(src),
			amount,
			minimum,
			(1n << 252n) | 3n,
		]),
		iface.encodeFunctionData('unoswap', [BigInt(src), amount, minimum, 3n]),
		iface.encodeFunctionData('unoswap', [BigInt(src), amount - 1n, minimum, (1n << 252n) | 3n]),
		iface.encodeFunctionData('unoswap', [BigInt(src), amount, minimum - 1n, (1n << 252n) | 3n]),
	]) {
		calldata = bad;
		await assert.rejects(adapter.swap('base', 'usdc-base', amount, minimum), /crypto_swap_calldata_invalid/);
	}
});
// A refactor must preserve these independent bindings before a response can be signed.
test('generic swap rejects altered token, recipient, amount, minimum, output and flags', async () => {
	const signatures = (await import('node:module')).createRequire(import.meta.url)('../../app/modules/payments/config/oneinch-v6-swap-abi.json');
	const iface = new Interface(signatures);
	const from = managedWallet(env)!.address(0);
	const source = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
	const native = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
	const other = '0x' + '1'.repeat(40);
	const amount = 4000000n;
	const minimum = 1000000000000000n;
	const description = [source, native, other, from, amount, minimum, 0n];
	for (const [index, replacement] of [
		[0, other],
		[1, source],
		[3, other],
		[4, amount - 1n],
		[5, minimum - 1n],
		[6, 1n],
	] as const) {
		const altered = [...description];
		altered[index] = replacement;
		const data = iface.encodeFunctionData('swap', [other, altered, '0x']);
		assert.throws(() => validateSwapCalldata(data, source, from, amount, minimum), /crypto_swap_calldata_invalid/);
	}
	const permit2 = iface.encodeFunctionData('unoswap', [
		BigInt(source) | (1n << 160n),
		amount,
		minimum,
		(1n << 252n) | 3n,
	]);
	assert.throws(() => validateSwapCalldata(permit2, source, from, amount, minimum), /crypto_swap_calldata_invalid/);
});
