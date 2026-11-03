import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import {createMembershipService} from './sqlHarness.js';
import {createCryptoBalanceObserver} from '../../app/modules/payments/cryptoBalanceObserver.js';
import {cryptoAsset} from '../../app/modules/payments/cryptoAssets.js';
import {quantity} from '../../app/modules/payments/cryptoRpcValues.js';

const url = process.env.CREATOR_MEMBERSHIP_TEST_DATABASE_URL;
const env = {DIRECT_CRYPTO_SEED_PHRASE: 'test test test test test test test test test test test junk', DIRECT_CRYPTO_CONFIG: '{"networks":["base"]}'};
async function fixture(work) {
	assert.equal(new URL(url!).pathname, '/geesome_membership_test');
	const db = new Sequelize(url!, {logging: false, pool: {max: 10}});
	let height = 100n, finalized = 100n, now = new Date('2026-11-03T12:00:00Z');
	const epoch = now.getTime(), balances = new Map<string, Map<bigint, bigint>>(), nonces = new Map<string, Map<bigint, bigint>>();
	let reorg = false, outage = false;
	const at = (map, h) => [...(map || new Map())].filter(([n]) => n <= h).sort((a, b) => a[0] < b[0] ? 1 : -1)[0]?.[1] || 0n;
	const hash = h => '0x' + (h + (reorg && h === 100n ? 100000n : 0n)).toString(16).padStart(64, '0');
	const rpc = async (_network, method, params) => {
		if (outage) {
			throw Error('fake provider offline');
		}
		if (method === 'eth_getBlockByNumber') {
			const h = params[0] === 'latest' ? height : params[0] === 'finalized' ? finalized : BigInt(params[0]);
			return {number: quantity(h), hash: hash(h), timestamp: quantity(BigInt(epoch / 1000) + h - 100n)};
		}
		if (method === 'eth_call') {
			const address = '0x' + params[0].data.slice(-40).toLowerCase();
			return quantity(at(balances.get(address), BigInt(params[1])));
		}
		if (method === 'eth_getBalance') {
			return '0x0';
		}
		if (method === 'eth_getTransactionCount') {
			return quantity(at(nonces.get(params[0].toLowerCase()), BigInt(params[1])));
		}
		throw Error('Unexpected test RPC ' + method);
	};
	const balance = createCryptoBalanceObserver(rpc, async () => true);
	const observer = {check: async () => true, boundary: async () => ({height: String(height)}), quote: async () => '2000', scanBalances: balance.scan, scan: async () => {throw Error('No explorer');}};
	const start = (selectedObserver = observer) => createMembershipService({sequelize: db, env, clock: () => now, cryptoObserver: selectedObserver, cryptoAdapter: {fees: async () => {throw Error('mock-fees-unavailable');}, balance: async () => 0n}});
	let service = await start();
	try {
		await service.seedSites();
		for (const id of ['wave', 'meat']) {
			await (await service.resource(id)).update({postsEnabled: true});
			await service.directCrypto.treasury.save(id, {payout: '0x' + 'a'.repeat(40), version: 0});
		}
		const reader = randomUUID();
		const invoice = async (resource = 'wave', who = reader, assetId = 'usdc-base') => {
			const option = await service.models.options.findOne({where: {resourceId: resource, period: 'month'}});
			return service.directCrypto.invoice(resource, who, {optionId: option.id, assetId, idempotencyKey: randomUUID()});
		};
		await work({db, get service() {return service;}, reader, invoice, balances, nonces, observer,
			async restart() {service = await start();},
			async restartLegacy(scan) {service = await start({...observer, scanBalances: undefined, scan});},
			async collection(address, amount) {
				height++; finalized = height; now = new Date(epoch + Number(height - 100n) * 1000);
				const key = address.toLowerCase(), map = balances.get(key)!;
				map.set(height, at(map, height) - amount);
				const counts = nonces.get(key) || new Map();
				const nonce = at(counts, height); counts.set(height, nonce + 1n); nonces.set(key, counts);
				const txHash = hash(height + 10000n), contract = cryptoAsset('usdc-base').contract;
				await service.models.crypto_transactions.create({id: 'collection:' + txHash, network: 'base', hash: txHash, sender: address, nonce: String(nonce), raw: '0x00', state: 'confirmed', data: {request: {to: contract, value: '0'}, balanceReceipt: {transactionHash: txHash, blockNumber: quantity(height), blockHash: hash(height), status: '0x1', logs: [{address: contract, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', '0x' + address.slice(2).padStart(64, '0'), '0x' + 'a'.repeat(40).padStart(64, '0')], data: '0x' + amount.toString(16).padStart(64, '0')}]}}});
			}, setReorg(value) {reorg = value;}, setOutage(value) {outage = value;},
			advance(seconds = 20, final = true) {height += BigInt(seconds); now = new Date(epoch + Number(height - 100n) * 1000); if (final) {finalized = height;}},
			finalize() {finalized = height;},
			deposit(address, amount) {const key = address.toLowerCase(), map = balances.get(key) || new Map(); map.set(height, at(map, height) + amount); balances.set(key, map);},
			async scan(created) {return service.directCrypto.rescan('wave', created.id);}});
	}
	finally {
		await db.close();
	}
}

test('address credit: paid then deposit, reopen with partial credit, top up, restart and never consume twice', {skip: !url}, async () => fixture(async f => {
	const first = await f.invoice();
	assert.equal(first.reusableAddress, true);
	f.advance(); f.deposit(first.address, 4000000n);
	assert.equal((await f.scan(first)).status, 'paid');
	const original = await f.service.models.crypto_invoices.findByPk(first.id);
	assert.equal(original.snapshot.collectionAtomic, '4000000');
	f.advance(); f.deposit(first.address, 1000000n);
	const historical = await f.scan(first);
	assert.equal(historical.status, 'paid');
	assert.equal(historical.received, '4');
	assert.equal(historical.availableCredit, '1');
	assert.equal(await f.service.models.periods.count(), 1);
	await f.restart();
	const second = await f.invoice();
	assert.equal(second.address, first.address);
	assert.equal(second.status, 'underpaid');
	assert.equal(second.received, '1');
	f.advance(); f.deposit(first.address, 3000000n);
	assert.equal((await f.scan(second)).status, 'paid');
	assert.equal((await f.scan(first)).availableCredit, '0');
	assert.equal((await original.reload()).snapshot.collectionAtomic, '4000000');
	assert.equal((await f.service.models.crypto_invoices.findByPk(second.id)).snapshot.collectionAtomic, '4000000');
	const third = await f.invoice();
	assert.equal(third.received, '0');
	await Promise.all([f.scan(third), f.scan(third)]);
	assert.equal(await f.service.models.periods.count(), 2);
	assert.equal(await f.service.models.crypto_credits.count(), 2);
	const account = await f.service.models.crypto_accounts.findByPk(original.snapshot.accountLedgerId);
	assert.equal(account.receivedAtomic, account.consumedAtomic);
}));

test('address credit: expired quote, later deposit beyond old monitoring, fresh quote applies longer tariff and excess', {skip: !url}, async () => fixture(async f => {
	const first = await f.invoice();
	f.advance(20 * 86400); f.deposit(first.address, 22000000n);
	assert.equal((await f.scan(first)).status, 'late_payment');
	assert.equal(await f.service.models.periods.count(), 0);
	const replacement = await f.invoice();
	assert.equal(replacement.status, 'paid');
	assert.equal(replacement.received, '22');
	assert.equal(replacement.credit.period, 'halfyear');
	assert(replacement.credit.extraDays > 0);
	assert.equal(await f.service.models.periods.count(), 1);
	await assert.rejects(f.service.directCrypto.review('wave', first.id), /crypto_invoice_replaced/);
	assert.equal((await f.service.directCrypto.reviews('wave')).invoices.some(row => row.id === first.id), false);
	await Promise.all([f.scan(replacement), f.scan(first)]);
	assert.equal(await f.service.models.periods.count(), 1);
}));

test('address credit: staggered finality across paid, unopened address observation and reader/resource/asset isolation', {skip: !url}, async () => fixture(async f => {
	const first = await f.invoice();
	f.advance(); f.deposit(first.address, 4000000n);
	f.advance(10, false); f.deposit(first.address, 4000000n);
	assert.equal((await f.scan(first)).status, 'paid');
	f.finalize(); f.advance(3600);
	await f.service.directCrypto.run();
	const paid = await f.service.directCrypto.read('wave', f.reader, first.id);
	assert.equal(paid.availableCredit, '4');
	const other = await f.invoice('wave', randomUUID());
	const meat = await f.invoice('meat');
	const eth = await f.invoice('wave', f.reader, 'eth-base');
	assert.equal(other.received, '0'); assert.equal(meat.received, '0'); assert.equal(eth.received, '0');
	const next = await f.invoice();
	assert.equal(next.status, 'paid');
	assert.equal(next.received, '4');
	assert.equal(await f.service.models.periods.count(), 2);
}));

test('address credit: canonical failures preserve funds and prevent settlement until reverified', {skip: !url}, async () => fixture(async f => {
	const first = await f.invoice();
	f.advance(); f.deposit(first.address, 2000000n);
	assert.equal((await f.scan(first)).received, '2');
	f.setReorg(true); f.advance(); f.deposit(first.address, 2000000n);
	const failed = await f.scan(first);
	assert.equal(failed.lastError, 'crypto_balance_reorg');
	assert.equal(failed.received, '2');
	assert.equal(await f.service.models.periods.count(), 0);
	f.setReorg(false);
	assert.equal((await f.scan(first)).status, 'paid');
	assert.equal(await f.service.models.crypto_credits.count(), 1);
}));

test('address credit: malformed historical account backs off without stopping healthy observations', {skip: !url}, async () => fixture(async f => {
	const bad = await f.invoice(), healthy = await f.invoice('wave', randomUUID());
	const row = await f.service.models.crypto_invoices.findByPk(bad.id);
	const {accountLedgerId, startBlock, ...snapshot} = row.snapshot;
	await f.service.models.crypto_accounts.destroy({where: {id: accountLedgerId}});
	await row.update({snapshot});
	f.advance(); f.deposit(healthy.address, 4000000n);
	await f.service.directCrypto.run();
	assert.equal((await row.reload()).lastError, 'crypto_balance_history_ambiguous');
	assert.equal((await f.scan(healthy)).status, 'paid');
}));

test('address credit: collection uses immutable per-invoice amounts and swept funds never hide unused credit', {skip: !url}, async () => fixture(async f => {
	const first = await f.invoice();
	f.advance(); f.deposit(first.address, 4000000n);
	await f.scan(first);
	f.advance(); f.deposit(first.address, 3000000n);
	await f.scan(first);
	await f.service.directCrypto.treasury.run();
	const original = await f.service.models.crypto_collections.findByPk(first.id);
	assert.equal(original.data.amount, '4000000', 'do not collect the later unused deposit with the old job');
	await original.update({state: 'complete'});
	await f.collection(first.address, 4000000n);
	assert.equal((await f.scan(first)).availableCredit, '3');
	const next = await f.invoice();
	assert.equal(next.received, '3');
	f.advance(); f.deposit(first.address, 1000000n);
	assert.equal((await f.scan(next)).status, 'paid');
	await f.service.directCrypto.treasury.run();
	assert.equal((await f.service.models.crypto_collections.findByPk(next.id)).data.amount, '4000000');
	assert.equal((await original.reload()).state, 'complete');
	assert.equal(original.data.amount, '4000000');
	assert.equal((await f.scan(next)).availableCredit, '0');
}));

test('address credit: migration consumes historical paid amounts exactly once using real old-engine settlement', {skip: !url}, async () => fixture(async f => {
	await f.restartLegacy(async snapshot => [{key: 'base:legacy', txid: '0x' + 'c'.repeat(64), atomic: '4000000', confirmed: true, timestamp: snapshot.createdAt + 1000, blockHeight: '120'}]);
	const old = await f.invoice();
	f.advance(); f.deposit(old.address, 4000000n);
	assert.equal((await f.scan(old)).status, 'paid');
	assert.equal(await f.service.models.crypto_accounts.count(), 0);
	await f.collection(old.address, 4000000n);
	f.advance(); f.deposit(old.address, 4000000n);
	await f.restart();
	const next = await f.invoice();
	assert.equal(next.status, 'paid');
	assert.equal(next.received, '4');
	assert.equal(await f.service.models.periods.count(), 2);
	assert.equal(await f.service.models.crypto_credits.count(), 1);
	const account = await f.service.models.crypto_accounts.findByPk((await f.service.models.crypto_invoices.findByPk(next.id)).snapshot.accountLedgerId);
	assert.equal(account.snapshot.legacyConsumedAtomic, '4000000');
	assert.equal(account.receivedAtomic, '8000000');
	assert.equal(account.consumedAtomic, '8000000');
}));

test('address credit: an old scan paused during bootstrap cannot grant the same funds again', {skip: !url}, async () => fixture(async f => {
	let entered!: () => void, release!: () => void;
	const enteredScan = new Promise<void>(done => {entered = done;});
	const paused = new Promise<void>(done => {release = done;});
	await f.restartLegacy(async snapshot => {
		entered(); await paused;
		return [{key: 'base:legacy-race', txid: '0x' + 'd'.repeat(64), atomic: '4000000', confirmed: true, timestamp: snapshot.createdAt + 1000, blockHeight: '120'}];
	});
	const old = await f.invoice();
	f.advance(); f.deposit(old.address, 4000000n);
	const oldScan = f.scan(old);
	await enteredScan;
	await f.restart();
	await f.service.directCrypto.reconcile('wave', f.reader, old.id);
	release(); await oldScan;
	const next = await f.invoice();
	assert.equal(next.received, '0');
	assert.equal(await f.service.models.periods.count(), 1);
	assert.equal(await f.service.models.crypto_credits.count(), 1);
}));

test('address credit: reader reconciliation is atomically spaced and respects provider-error backoff', {skip: !url}, async () => fixture(async f => {
	const first = await f.invoice();
	let calls = 0;
	const original = f.observer.scanBalances;
	f.observer.scanBalances = async (...args) => {calls++; return original(...args);};
	try {
		const reconcile = () => f.service.directCrypto.reconcile('wave', f.reader, first.id);
		await Promise.all(Array.from({length: 6}, reconcile));
		assert.equal(calls, 0);
		f.advance();
		await Promise.all(Array.from({length: 6}, reconcile));
		assert.equal(calls, 1);
		f.advance(); f.setOutage(true);
		assert.equal((await reconcile()).lastError, 'crypto_network_unavailable');
		await Promise.all(Array.from({length: 6}, reconcile));
		assert.equal(calls, 2);
	}
	finally {
		f.observer.scanBalances = original;
	}
}));
