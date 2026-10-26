import test from 'node:test';
import assert from 'node:assert/strict';
import { createCryptoBalanceObserver } from '../../app/modules/payments/cryptoBalanceObserver.js';
import { quantity } from '../../app/modules/payments/cryptoRpcValues.js';
import { cryptoAsset } from '../../app/modules/payments/cryptoAssets.js';
const address = '0x' + '1'.repeat(40), service = '0x' + '2'.repeat(40), payout = '0x' + '3'.repeat(40);
const epoch = Date.parse('2026-10-17T00:00:00Z'), blockHash = (h: bigint) => '0x' + h.toString(16).padStart(64, '0');
function fixture(assetId = 'usdc-base') {
	let latest = 110n, finalized = 105n, reorg = false, pruned = false;
	const balances = new Map<bigint, bigint>([[100n, 0n], [105n, 2n], [110n, 5n]]), nonces = new Map<bigint, bigint>(), receipts = new Map<string, any>(), calls: string[] = [];
	const at = (map: Map<bigint, bigint>, h: bigint) => [...map].filter(([b]) => b <= h).sort((a, b) => a[0] < b[0] ? 1 : -1)[0]?.[1] || 0n;
	const reads = new Map<string, number>();
	const rpc = async (_n: string, method: string, params: any[]) => {
		calls.push(method);
		if (method === 'eth_getBlockByNumber') {
			const tag = params[0], h = tag === 'latest' ? latest : tag === 'finalized' ? finalized : BigInt(tag);
			reads.set(String(h), (reads.get(String(h)) || 0) + 1);
			return { number: quantity(h), hash: reorg && h === 110n && (reads.get(String(h)) || 0) > 1 ? blockHash(999n) : blockHash(h), timestamp: quantity(BigInt(epoch / 1000) + h - 100n) };
		}
		if (pruned && ['eth_call', 'eth_getBalance', 'eth_getTransactionCount'].includes(method) && BigInt(params[1]) <= 105n) {
			throw Error('historical_state_pruned');
		}
		if (method === 'eth_call' && params[0].data.startsWith('0x275aedd2')) {
			return quantity(2n);
		}
		if (method === 'eth_call' || method === 'eth_getBalance') {
			return quantity(at(balances, BigInt(params[1])));
		}
		if (method === 'eth_getTransactionCount') {
			return quantity(at(nonces, BigInt(params[1])));
		}
		if (method === 'eth_getTransactionReceipt') {
			return receipts.get(params[0]) || null;
		}
		throw Error('unexpected RPC ' + method);
	};
	const observer = createCryptoBalanceObserver(rpc, async () => true);
	const snapshot = { assetId, managedFingerprint: 'test-wallet', startBlock: '100', createdAt: epoch };
	const context: any = { invoiceId: 'invoice', expiresAt: new Date(epoch + 60000), prior: [], journal: [] };
	return { observer, snapshot, context, balances, nonces, receipts, calls, setFinal: (n: bigint) => { finalized = n; }, setLatest: (n: bigint) => { latest = n; }, reorg: () => { reorg = true; }, prune: () => { pruned = true; } };
}
const receipt = (id: number, height: number, status = 1) => ({ transactionHash: blockHash(BigInt(id)), blockHash: blockHash(BigInt(height)), blockNumber: quantity(height), status: quantity(status), gasUsed: '0x7', effectiveGasPrice: '0x1', l1Fee: '0x3', operatorFeeScalar: '0x1', operatorFeeConstant: '0x0', logs: [] });
const journal = (id: number, sender: string, to: string, value: string, r: any) => ({ id: String(id), hash: blockHash(BigInt(id)), sender, data: { request: { to, value }, balanceReceipt: r } });
test('balance observations separate latest/finalized deposits and survive repeated scans/restarts without duplicate increments', async () => {
	const f = fixture(), one = await f.observer.scan(f.snapshot, address, f.context);
	assert.deepEqual(one.transfers.map(t => [t.atomic, t.confirmed]), [['2', true], ['3', false]]);
	assert.ok(one.transfers.every(t => t.txid === ''));
	f.context.prior = one.transfers.filter(t => t.confirmed);
	f.context.checkpoint = one.checkpoint;
	f.setFinal(110n);
	const two = await f.observer.scan(f.snapshot, address, f.context);
	assert.deepEqual(two.transfers.map(t => t.atomic), ['2', '3']);
	f.context.prior = two.transfers;
	f.context.checkpoint = two.checkpoint;
	const repeat = await f.observer.scan(f.snapshot, address, f.context);
	assert.deepEqual(repeat.transfers, two.transfers);
	assert.equal(repeat.checkpoint.received, '5');
	assert.ok(!f.calls.some(c => /trace|logs|history/i.test(c)));
});
test('persisted baseline and expiry checkpoints avoid repeating pruned historical state queries', async () => {
	const f = fixture();
	f.setFinal(110n);
	f.context.expiresAt = new Date(epoch + 5000);
	const one = await f.observer.scan(f.snapshot, address, f.context);
	f.context.checkpoint = one.checkpoint;
	f.context.prior = one.transfers;
	f.prune();
	f.setLatest(115n);
	f.setFinal(115n);
	const restored = await f.observer.scan(f.snapshot, address, f.context);
	assert.equal(restored.checkpoint.received, '5');
	assert.deepEqual(restored.transfers, one.transfers);
});
test('an existing balance is excluded and the invoice end block excludes newer deposits', async () => {
	const f = fixture();
	f.balances.set(100n, 10n);
	f.balances.set(105n, 12n);
	f.balances.set(110n, 15n);
	f.setFinal(110n);
	const result = await f.observer.scan({ ...f.snapshot, endBlock: '105' }, address, f.context);
	assert.deepEqual(result.transfers.map(t => t.atomic), ['2']);
	assert.equal(result.checkpoint.received, '2');
	const empty = fixture();
	empty.balances.set(100n, 5n);
	empty.balances.set(105n, 5n);
	assert.equal((await empty.observer.scan(empty.snapshot, address, empty.context)).transfers.length, 0);
});
test('expiry splits finalized deposits using historical balances, including a late first scan', async () => {
	const f = fixture();
	f.setFinal(110n);
	f.context.expiresAt = new Date(epoch + 5000);
	const result = await f.observer.scan(f.snapshot, address, f.context);
	assert.deepEqual(result.transfers.map(t => [t.atomic, t.timestamp]), [['2', epoch + 5000], ['3', epoch + 10000]]);
});
test('no unfinalized observation grants access', async () => {
	const f = fixture();
	f.setFinal(99n);
	const result = await f.observer.scan(f.snapshot, address, f.context);
	assert.deepEqual(result.transfers.map(t => [t.atomic, t.confirmed]), [['5', false]]);
	assert.equal(result.checkpoint.confirmed, null);
});
test('native accounting excludes own gas funding and restores collection value plus actual Base execution/L1/operator fees', async () => {
	const f = fixture('eth-base');
	f.setFinal(110n);
	f.balances.clear();
	f.balances.set(100n, 100n);
	f.balances.set(110n, 108n);
	f.nonces.set(110n, 1n);
	f.context.journal = [journal(1, service, address, '10', receipt(1, 102)), journal(2, address, payout, '40', receipt(2, 104))];
	const result = await f.observer.scan(f.snapshot, address, f.context);
	assert.equal(result.checkpoint.received, '50');
	f.balances.set(110n, 58n);
	assert.equal((await f.observer.scan(f.snapshot, address, f.context)).checkpoint.received, '0');
	const failed = fixture('eth-base');
	failed.setFinal(110n);
	failed.balances.clear();
	failed.balances.set(100n, 100n);
	failed.balances.set(110n, 138n);
	failed.nonces.set(110n, 1n);
	failed.context.journal = [journal(2, address, payout, '40', receipt(2, 104, 0))];
	assert.equal((await failed.observer.scan(failed.snapshot, address, failed.context)).checkpoint.received, '50');
	delete f.context.journal[1].data.balanceReceipt.l1Fee;
	await assert.rejects(f.observer.scan(f.snapshot, address, f.context), /crypto_rpc_response_invalid/);
});
test('Ethereum and Arbitrum native corrections use the receipt execution fee without Base-specific additions', async () => {
	for (const asset of ['eth-ethereum', 'eth-arbitrum']) {
		const f = fixture(asset);
		f.setFinal(110n);
		f.balances.clear();
		f.balances.set(100n, 100n);
		f.balances.set(110n, 103n);
		f.nonces.set(110n, 1n);
		f.context.journal = [journal(2, address, payout, '40', receipt(2, 104))];
		assert.equal((await f.observer.scan(f.snapshot, address, f.context)).checkpoint.received, '50');
	}
});
test('token collection between balance checks cannot hide a new deposit or consume it again', async () => {
	const f = fixture();
	f.setFinal(110n);
	f.balances.clear();
	f.balances.set(100n, 5n);
	f.balances.set(110n, 5n);
	f.nonces.set(110n, 1n);
	const r = receipt(2, 104);
	r.logs = [{ address: cryptoAsset('usdc-base').contract, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', '0x' + address.slice(2).padStart(64, '0'), '0x' + payout.slice(2).padStart(64, '0')], data: '0x' + (5n).toString(16).padStart(64, '0') }] as any;
	f.context.journal = [journal(2, address, cryptoAsset('usdc-base').contract!, '0', r)];
	assert.equal((await f.observer.scan(f.snapshot, address, f.context)).checkpoint.received, '5');
});
test('old finalized journal receipts are cached once and do not repeatedly query transaction history', async () => {
	const f = fixture(), r = receipt(1, 90), tx = journal(1, service, address, '10', null);
	f.context.journal = [tx];
	f.receipts.set(tx.hash, r);
	const first = await f.observer.scan(f.snapshot, address, f.context);
	assert.equal(first.receipts.length, 1);
	tx.data.balanceReceipt = first.receipts[0].receipt;
	f.context.prior = first.transfers.filter(t => t.confirmed);
	f.context.checkpoint = first.checkpoint;
	f.receipts.clear();
	await f.observer.scan(f.snapshot, address, f.context);
	assert.equal(f.calls.filter(c => c === 'eth_getTransactionReceipt').length, 1);
});
test('unknown outgoing nonces and unresolved internal incoming transfers fail closed', async () => {
	const f = fixture();
	f.nonces.set(110n, 1n);
	await assert.rejects(f.observer.scan(f.snapshot, address, f.context), /crypto_balance_outgoing_untracked/);
	const native = fixture('eth-base');
	native.context.journal = [journal(3, service, address, '10', null)];
	await assert.rejects(native.observer.scan(native.snapshot, address, native.context), /crypto_balance_internal_pending/);
});
test('canonical anchor changes and decreasing confirmed balance preserve history by rejecting the scan', async () => {
	const f = fixture();
	f.reorg();
	await assert.rejects(f.observer.scan(f.snapshot, address, f.context), /crypto_balance_reorg/);
	const regression = fixture();
	regression.context.prior = [{ key: 'old', txid: '', atomic: '3', confirmed: true, timestamp: epoch + 4000, blockHeight: '104' }];
	await assert.rejects(regression.observer.scan(regression.snapshot, address, regression.context), /crypto_balance_regressed/);
});
