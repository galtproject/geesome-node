import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { randomUUID, createHash } from 'node:crypto';
import { createMembershipService } from './sqlHarness.js';
import { managedWallet } from '../../app/modules/payments/cryptoManagedWallet.js';
const url = process.env.CREATOR_MEMBERSHIP_TEST_DATABASE_URL;
const env = { DIRECT_CRYPTO_SEED_PHRASE: 'test test test test test test test test test test test junk', DIRECT_CRYPTO_CONFIG: '{"networks":["base"]}', MEMBERSHIP_WAVE_OWNER: 'alice', MEMBERSHIP_MEAT_OWNER: 'bob' };
test('managed SQL: stable user indexes, invoice boundaries, fee samples, exact reserve routing, ambiguous broadcast/restart and seed binding', { skip: !url }, async () => {
	assert.equal(new URL(url!).pathname, '/geesome_membership_test');
	const db = new Sequelize(url!, { logging: false, pool: { max: 10 } });
	let now = new Date('2026-10-15T12:00:00Z'), block = 100;
	const wallet = managedWallet(env)!, service = wallet.address(0), payout = '0x' + 'a'.repeat(40), native = new Map<string, bigint>(), tokens = new Map<string, bigint>(), nonces = new Map<string, number>(), receipts = new Map<string, any>(), broadcasts = new Map<string, any>();
	const deposits = new Map<string, any[]>();
	let loseResponse = true, holdFinality = false, allowance = false;
	let fee = 1000000000000n, gasPrice = 1000000000n;
	const adapter = {
		balance: async (_n: string, address: string, assetId?: string) => (assetId?.startsWith('usdc') ? tokens : native).get(address) || 0n,
		fees: async () => ({ gasPrice, maxFeePerGas: gasPrice }),
		transfer: (to: string, amount: bigint, contract?: string) => ({ to, amount: String(amount), contract, value: contract ? '0' : String(amount) }),
		prepare: async (_n: string, index: number, request: any) => { const sender = wallet.address(index), nonce = nonces.get(sender) || 0, raw = JSON.stringify({ sender, nonce, request }), hash = '0x' + createHash('sha256').update(raw).digest('hex'); return { sender, nonce: String(nonce), raw, hash, fee: String(fee), request }; },
		receipt: async (_n: string, hash: string) => holdFinality ? null : receipts.get(hash) || null,
		broadcast: async (_n: string, raw: string) => {
			const { sender, nonce, request: r } = JSON.parse(raw), hash = '0x' + createHash('sha256').update(raw).digest('hex');
			if (broadcasts.has(hash)) {
				return hash;
			}
			assert.equal(nonce, nonces.get(sender) || 0);
			nonces.set(sender, nonce + 1);
			broadcasts.set(hash, { sender, r });
			native.set(sender, (native.get(sender) || 0n) - fee);
			let logs: any[] = [];
			if (r.kind === 'approve') {
				allowance = true;
			}
			else if (r.kind === 'swap') {
				const amount = BigInt(r.amount);
				tokens.set(sender, tokens.get(sender)! - amount);
				native.set(sender, (native.get(sender) || 0n) + amount * 1000000000n);
				allowance = false;
			}
			else {
				const amount = BigInt(r.amount);
				const ledger = r.contract ? tokens : native;
				ledger.set(sender, (ledger.get(sender) || 0n) - amount);
				ledger.set(r.to, (ledger.get(r.to) || 0n) + amount);
				if (r.contract) {
					logs = [{ address: r.contract, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', '0x' + sender.slice(2).padStart(64, '0'), '0x' + r.to.slice(2).padStart(64, '0')], data: '0x' + amount.toString(16) }];
				}
			}
			assert.ok((native.get(sender) || 0n) >= 0n);
			receipts.set(hash, { ok: true, receipt: { logs } });
			if (loseResponse) {
				loseResponse = false;
				throw Error('lost response after acceptance');
			}
			return hash;
		},
		swap: async (_n: string, _asset: string, amount: bigint) => allowance ? { kind: 'swap', request: { kind: 'swap', to: service, amount: String(amount) }, expectedOut: String(amount * 1000000000n) } : { kind: 'approve', request: { kind: 'approve', to: service } },
	};
	const observer = { check: async () => true, boundary: async () => ({ height: String(block) }), quote: async (id: string) => id.startsWith('eth') ? '1000' : '1', scan: async (s: any, address: string) => (deposits.get(address) || []).filter(t => (t.assetId || 'usdc-base') === s.assetId && BigInt(t.blockHeight) > BigInt(s.startBlock)) };
	let s: any;
	try {
		const start = async () => createMembershipService({ sequelize: db, env, clock: () => now, cryptoObserver: observer, cryptoAdapter: adapter, resolveClient: async () => null });
		s = await start();
		await s.seedSites();
		const M = s.models;
		for (const id of ['wave', 'meat'])
			await (await s.resource(id)).update({ postsEnabled: true });
		await s.directCrypto.save('wave', { network: 'base', enabled: true, version: 0, xpub: '', pool: ['0x' + 'b'.repeat(40)], assets: ['usdc-base'] });
		const legacyMethods = await s.directCrypto.methods('wave');
		assert.equal(legacyMethods.find(a => a.id === 'usdc-base').available, true);
		assert.equal(legacyMethods.find(a => a.id === 'eth-base').available, false, 'seed alone does not enable unconfigured legacy currencies');
		await Promise.all(['wave', 'meat'].map(id => s.directCrypto.treasury.save(id, { payout, version: 0 })));
		await assert.rejects(s.directCrypto.treasury.save('wave', { payout: service, version: 1 }), /crypto_payout_is_service/);
		const reader = randomUUID(), other = randomUUID();
		await M.readers.bulkCreate([{ id: reader, googleSub: 'reader', email: 'r@example.test', name: 'R' }, { id: other, googleSub: 'other', email: 'o@example.test', name: 'O' }]);
		// Freeze this ledger/collection regression at its original $5 fixture price.
		await M.options.update({ amountCents: 500 }, { where: { period: 'month' } });
		const options = await M.options.findAll();
		const option = (id: string) => options.find(o => o.resourceId === id && o.period === 'month').id;
		const invoice = (r: string, key: string, id = 'wave', assetId = 'usdc-base') => s.directCrypto.invoice(id, r, { optionId: option(id), assetId, idempotencyKey: key });
		const [one, otherInvoice] = await Promise.all([invoice(reader, 'one'), invoice(other, 'other')]);
		assert.deepEqual([one.address, otherInvoice.address].sort(), [wallet.address(1), wallet.address(2)].sort());
		assert.notEqual(one.address, service);
		await assert.rejects(invoice(reader, 'conflict'), /crypto_reader_invoice_pending/);
		await assert.rejects(s.directCrypto.treasury.save('wave', { payout: one.address, version: 1 }), /crypto_payout_is_deposit/);
		deposits.set(one.address, [{ key: 'base:first', txid: 'first', atomic: '5000000', confirmed: true, timestamp: now.getTime() + 1000, blockHeight: '101' }]);
		tokens.set(one.address, 5000000n);
		native.set(one.address, 5000000000000000n);
		native.set(service, 1000000000000000n);
		now = new Date(now.getTime() + 5000);
		await s.directCrypto.run();
		assert.equal((await s.directCrypto.read('wave', reader, one.id)).status, 'paid');
		holdFinality = true;
		for (let i = 0; i < 5; i++)
			await s.directCrypto.treasury.run();
		assert.equal(broadcasts.size, 1);
		assert.equal(tokens.get(payout) || 0n, 0n);
		assert.equal(await M.crypto_transactions.count(), 1);
		s = await start();
		holdFinality = false;
		for (let i = 0; i < 40; i++)
			await Promise.all([s.directCrypto.treasury.run(), s.directCrypto.treasury.run()]);
		const job = await M.crypto_collections.findByPk(one.id);
		assert.equal(job.state, 'done', job.lastError || JSON.stringify(job.data));
		assert.equal(tokens.get(payout), 1000000n);
		assert.equal(tokens.get(service), 0n);
		assert.equal(tokens.get(one.address), 0n);
		assert.equal(native.get(one.address), 5000000000000000n, 'token gas must not consume native subscription funds');
		assert.ok(native.get(service)! > 4000000000000000n);
		assert.equal(await M.crypto_fee_samples.count(), 1);
		assert.equal(await M.periods.count({ where: { invoiceId: one.id } }), 1);
		assert.equal(await M.crypto_transactions.count({ where: { state: 'confirmed' } }), broadcasts.size);
		assert.equal((await s.directCrypto.settings('wave')).automation.payout, payout);
		// Native subscription receipts can bootstrap an empty service wallet without any token swap.
		block = 101;
		const eth = await invoice(other, 'native', 'wave', 'eth-base');
		native.set(service, 0n);
		native.set(eth.address, 5000000000000000n);
		deposits.set(eth.address, [{ assetId: 'eth-base', key: 'base:eth', txid: 'eth', atomic: '5000000000000000', confirmed: true, timestamp: now.getTime() + 1000, blockHeight: '102' }]);
		now = new Date(now.getTime() + 5000);
		await s.directCrypto.run();
		assert.equal((await s.directCrypto.read('wave', other, eth.id)).status, 'paid');
		const beforeSwaps = [...broadcasts.values()].filter(b => b.r.kind === 'swap').length;
		for (let i = 0; i < 20; i++)
			await s.directCrypto.treasury.run();
		assert.equal((await M.crypto_collections.findByPk(eth.id)).state, 'done');
		assert.equal(native.get(service), 4000000000000000n);
		assert.equal(native.get(payout), 1000000000000000n - 2n * fee);
		assert.equal([...broadcasts.values()].filter(b => b.r.kind === 'swap').length, beforeSwaps);
		// Same reader, new resource, same address. New invoice boundary prevents old receipts being reused.
		block = 102;
		const two = await invoice(reader, 'two', 'meat');
		assert.equal(two.address, one.address);
		assert.equal(await M.crypto_hd_accounts.count(), 2);
		await s.directCrypto.run();
		assert.equal((await s.directCrypto.read('meat', reader, two.id)).received, '0');
		now = new Date(now.getTime() + 31 * 60000);
		await s.directCrypto.run();
		assert.equal((await M.crypto_invoices.findByPk(two.id)).status, 'expired');
		block = 103;
		const three = await invoice(reader, 'three');
		assert.equal(three.address, one.address);
		assert.equal((await M.crypto_invoices.findByPk(two.id)).snapshot.endBlock, '103');
		deposits.set(one.address, [{ key: 'base:new', txid: 'new', atomic: '5000000', confirmed: true, timestamp: now.getTime() + 1000, blockHeight: '104' }]);
		now = new Date(now.getTime() + 3601000);
		await s.directCrypto.run();
		assert.equal((await s.directCrypto.read('meat', reader, two.id)).received, '0');
		assert.equal((await s.directCrypto.read('wave', reader, three.id)).status, 'paid');
		// An expensive transfer waits above the retained gas minimum, then becomes eligible at it.
		tokens.set(one.address, 5000000n);
		fee = 1000000000000000n;
		gasPrice = 2000000000n;
		now = new Date(now.getTime() + 3601000);
		const sentBefore = broadcasts.size;
		await s.directCrypto.treasury.run();
		assert.equal((await M.crypto_collections.findByPk(three.id)).state, 'new');
		assert.equal(broadcasts.size, sentBefore);
		gasPrice = 1000000000n;
		now = new Date(now.getTime() + 60000);
		await s.directCrypto.treasury.run();
		assert.equal((await M.crypto_collections.findByPk(three.id)).state, 'reserve');
		const changed = await createMembershipService({ sequelize: db, env: { ...env, DIRECT_CRYPTO_SEED_PHRASE: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about' }, cryptoObserver: observer, cryptoAdapter: adapter, resolveClient: async () => null });
		await assert.rejects(changed.directCrypto.treasury.save('wave', { payout, version: 1 }), /crypto_seed_changed/);
		await M.crypto_invoices.destroy({ where: { id: [two.id, three.id] } });
	}
	finally {
		await db.query('DELETE FROM payments_crypto_invoices WHERE id NOT IN (SELECT MIN(id::text)::uuid FROM payments_crypto_invoices GROUP BY \"addressId\")');
		await db.query('DELETE FROM payments_crypto_collections');
		await db.query('DELETE FROM payments_crypto_transactions');
		await db.close();
	}
});
async function reviewFixture(fn: (f: any) => Promise<void>) {
	assert.equal(new URL(url!).pathname, '/geesome_membership_test');
	const db = new Sequelize(url!, { logging: false, pool: { max: 10 } }), wallet = managedWallet(env)!, service = wallet.address(0), payout = '0x' + 'a'.repeat(40), fee = 1000000000000n;
	let now = new Date('2026-10-15T12:00:00Z'), block = 100, hold = false, failNext = false, priceOutage = false;
	const native = new Map<string, bigint>(), tokens = new Map<string, bigint>(), nonce = new Map<string, number>(), chain = new Map<string, any>(), broadcasts = new Map<string, any>(), events: any[] = [];
	const adapter = {
		fees: async () => ({ gasPrice: 1000000000n }), balance: async (_n: string, a: string, asset?: string) => (asset?.startsWith('usdc') ? tokens : native).get(a) || 0n,
		transfer: (to: string, amount: bigint, contract?: string) => ({ to, amount: String(amount), contract, value: contract ? '0' : String(amount) }),
		prepare: async (_n: string, index: number, request: any) => { const sender = wallet.address(index), n = nonce.get(sender) || 0, raw = JSON.stringify({ sender, nonce: n, request }); return { raw, hash: '0x' + createHash('sha256').update(raw).digest('hex'), sender, nonce: String(n), fee: String(fee), request }; },
		receipt: async (_n: string, hash: string) => hold ? null : chain.get(hash) || null,
		broadcast: async (_n: string, raw: string) => {
			const hash = '0x' + createHash('sha256').update(raw).digest('hex');
			if (broadcasts.has(hash)) {
				return hash;
			}
			const { sender, nonce: n, request: r } = JSON.parse(raw);
			assert.equal(n, nonce.get(sender) || 0);
			nonce.set(sender, n + 1);
			broadcasts.set(hash, { sender, r });
			native.set(sender, (native.get(sender) || 0n) - fee);
			let logs: any[] = [];
			const ok = !failNext;
			failNext = false;
			if (ok) {
				const amount = BigInt(r.amount), ledger = r.contract ? tokens : native;
				ledger.set(sender, (ledger.get(sender) || 0n) - amount);
				ledger.set(r.to, (ledger.get(r.to) || 0n) + amount);
				if (r.contract) {
					logs = [{ address: r.contract, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', '0x' + sender.slice(2).padStart(64, '0'), '0x' + r.to.slice(2).padStart(64, '0')], data: '0x' + amount.toString(16) }];
				}
				else {
					events.push({ address: r.to, assetId: 'eth-base', key: 'base:' + hash + ':native', txid: hash, atomic: String(amount), confirmed: true, timestamp: now.getTime(), blockHeight: String(++block) });
				}
			}
			assert.ok(native.get(sender)! >= 0n);
			chain.set(hash, { ok, receipt: { logs } });
			return hash;
		}, swap: async () => { throw Error('unexpected_swap'); }
	};
	let s: any;
	const observer = { check: async () => true, boundary: async () => ({ height: String(block) }), quote: async (id: string) => { if (priceOutage) {
			throw Error('crypto_quote_unavailable');
		} return id.startsWith('eth') ? '1000' : '1'; }, scan: async (s: any, a: string) => events.filter(t => t.address === a && t.assetId === s.assetId && BigInt(t.blockHeight) > BigInt(s.startBlock)) };
	try {
		s = await createMembershipService({ sequelize: db, env, clock: () => now, cryptoObserver: observer, cryptoAdapter: adapter, resolveClient: async () => null });
		await s.seedSites();
		const M = s.models;
		await (await s.resource('wave')).update({ postsEnabled: true });
		await s.directCrypto.treasury.save('wave', { payout, version: 0 });
		await M.options.update({ amountCents: 500 }, { where: { period: 'month' } });
		const option = await M.options.findOne({ where: { resourceId: 'wave', period: 'month' } });
		const reader = async () => { const id = randomUUID(); await M.readers.create({ id, googleSub: id, email: id + '@example.test', name: 'Review' }); return id; };
		const invoice = async (readerId: string, assetId: string) => s.directCrypto.invoice('wave', readerId, { assetId, optionId: option.id, idempotencyKey: randomUUID() });
		const advance = (ms = 5000) => { now = new Date(now.getTime() + ms); };
		const pay = async (i: any, amount?: bigint) => { const c = await M.crypto_invoices.findByPk(i.id), n = amount ?? BigInt(c.snapshot.amountAtomic), txid = '0x' + createHash('sha256').update(randomUUID()).digest('hex'); events.push({ address: i.address, assetId: c.assetId, key: 'base:' + txid + ':native', txid, atomic: String(n), confirmed: true, timestamp: now.getTime() + 1000, blockHeight: String(++block) }); const ledger = c.assetId.startsWith('eth') ? native : tokens; ledger.set(i.address, (ledger.get(i.address) || 0n) + n); advance(); await s.directCrypto.run(); };
		const tick = async () => { advance(); await s.directCrypto.treasury.run(); };
		await fn({ s, M, db, reader, invoice, pay, tick, advance, native, tokens, service, payout, fee, broadcasts, events, hold: (v: boolean) => hold = v, fail: () => failNext = true, outage: (v: boolean) => priceOutage = v });
	}
	finally {
		await db.query('DELETE FROM payments_crypto_invoices WHERE id NOT IN (SELECT MIN(id::text)::uuid FROM payments_crypto_invoices GROUP BY "addressId")');
		await db.query('DELETE FROM payments_crypto_collections');
		await db.query('DELETE FROM payments_crypto_transactions');
		await db.close();
	}
}
test('review: two credited native invoices share an address without consuming another invoice fee budget', { skip: !url }, () => reviewFixture(async (f) => {
	const r = await f.reader(), one = await f.invoice(r, 'eth-base');
	await f.pay(one);
	const two = await f.invoice(r, 'eth-base');
	await f.pay(two);
	assert.equal(one.address, two.address);
	for (let i = 0; i < 30; i++)
		await f.tick();
	assert.equal((await f.M.crypto_collections.findByPk(one.id)).state, 'done');
	assert.equal((await f.M.crypto_collections.findByPk(two.id)).state, 'done');
	assert.equal(f.native.get(one.address), 0n);
	assert.equal(f.native.get(f.service), 4000000000000000n);
	assert.equal(f.native.get(f.payout), 6000000000000000n - 3n * f.fee);
}));
test('review: deferred token job allows native bootstrap, and a canonical failed job does not freeze later invoices', { skip: !url }, () => reviewFixture(async (f) => {
	const token = await f.invoice(await f.reader(), 'usdc-base');
	await f.pay(token);
	await f.tick();
	await f.tick();
	assert.equal((await f.M.crypto_collections.findByPk(token.id)).lastError, 'crypto_service_needs_native_funding');
	const eth = await f.invoice(await f.reader(), 'eth-base');
	await f.pay(eth);
	for (let i = 0; i < 40; i++)
		await f.tick();
	assert.equal((await f.M.crypto_collections.findByPk(eth.id)).state, 'done');
	assert.equal((await f.M.crypto_collections.findByPk(token.id)).state, 'done');
	assert.equal(f.tokens.get(f.service) || 0n, 0n);
	assert.equal(f.tokens.get(f.payout), 5000000n);
	const failed = await f.invoice(await f.reader(), 'usdc-base');
	await f.pay(failed);
	await f.tick();
	f.fail();
	for (let i = 0; i < 8 && (await f.M.crypto_collections.findByPk(failed.id)).state !== 'action_required'; i++)
		await f.tick();
	assert.equal((await f.M.crypto_collections.findByPk(failed.id)).state, 'action_required');
	const next = await f.invoice(await f.reader(), 'eth-base');
	await f.pay(next);
	for (let i = 0; i < 12; i++)
		await f.tick();
	assert.equal((await f.M.crypto_collections.findByPk(next.id)).state, 'done');
}));
test('review: hourly fees continue while finality waits, quote outage does not block receipt recovery and active journals survive recovery', { skip: !url }, () => reviewFixture(async (f) => {
	const eth = await f.invoice(await f.reader(), 'eth-base');
	await f.pay(eth);
	f.hold(true);
	await f.tick();
	await f.tick();
	assert.equal(await f.M.crypto_transactions.count(), 1);
	assert.equal(await f.M.crypto_transactions.count(), 1);
	for (let i = 0; i < 3; i++) {
		f.advance(3600000);
		await f.tick();
	}
	assert.equal(await f.M.crypto_fee_samples.count(), 4);
	assert.equal(f.broadcasts.size, 1);
	f.outage(true);
	f.advance(3600000);
	f.hold(false);
	await f.tick();
	assert.equal(await f.M.crypto_fee_samples.count(), 5);
	assert.equal(await f.M.crypto_transactions.count({ where: { state: 'confirmed' } }), 1);
	f.outage(false);
	for (let i = 0; i < 10; i++)
		await f.tick();
	assert.equal((await f.M.crypto_collections.findByPk(eth.id)).state, 'done');
}));
test('review: service gas is excluded from pending native invoice receipts, including an incorrectly stored receipt', { skip: !url }, () => reviewFixture(async (f) => {
	const r = await f.reader(), eth = await f.invoice(r, 'eth-base');
	await f.pay(eth, 5000000000000000n - f.fee);
	const token = await f.invoice(r, 'usdc-base');
	await f.pay(token);
	f.native.set(f.service, 3000000000000000n);
	for (let i = 0; i < 8 && !([...f.broadcasts.values()].some((v: any) => v.sender === f.service && v.r.to === eth.address)); i++)
		await f.tick();
	const funding = [...f.broadcasts.entries()].find(([, v]: any) => v.sender === f.service && v.r.to === eth.address)!;
	assert.ok(funding);
	const event = f.events.find(e => e.txid === funding[0]);
	await f.M.crypto_transfers.create({ id: randomUUID(), eventKey: event.key, cryptoInvoiceId: eth.id, data: event });
	f.advance(60000);
	await f.s.directCrypto.run();
	const c = await f.M.crypto_invoices.findByPk(eth.id);
	assert.equal(c.receivedAtomic, String(5000000000000000n - f.fee));
	assert.notEqual(c.status, 'paid');
	assert.equal((await f.M.crypto_transfers.findOne({ where: { eventKey: event.key } })).data.confirmed, false);
	assert.equal(await f.M.periods.count({ where: { invoiceId: eth.id } }), 0);
}));
test('Sequelize collection filters skip completed history before the batch limit and respect JSON retryAt', { skip: !url }, () => reviewFixture(async (f) => {
	const invoice = await f.invoice(await f.reader(), 'eth-base');
	await f.pay(invoice);
	const original = (await f.M.crypto_invoices.findByPk(invoice.id)).toJSON();
	const historical = Array.from({ length: 51 }, () => {
		const id = randomUUID();
		return { ...original, id, invoiceId: id, requestKey: id, createdAt: new Date('2026-10-14T00:00:00Z') };
	});
	await f.M.crypto_invoices.bulkCreate(historical);
	await f.M.crypto_collections.bulkCreate(historical.map(row => ({
		id: row.id, invoiceId: row.id, network: 'base', state: 'done', data: {},
	})));
	// The paid invoice must be admitted even behind more than one full batch of history.
	await f.tick();
	const job = await f.M.crypto_collections.findByPk(invoice.id);
	assert.ok(job);
	assert.equal(job.state, 'reserve', 'a missing retryAt must be immediately eligible');
	assert.equal(await f.M.crypto_collections.count(), 52);
	await job.update({ data: { ...job.data, retryAt: Date.UTC(2026, 9, 15, 12, 1) } });
	await f.tick();
	assert.equal(await f.M.crypto_transactions.count(), 0, 'a future retryAt must defer sending');
	await job.update({ data: { ...job.data, retryAt: null } });
	await f.tick();
	assert.equal(await f.M.crypto_transactions.count(), 1, 'JSON null must restore immediate eligibility');
}));
test('managed balance SQL: durable observations, concurrent scans, collections, reused invoice windows and stale boundary recovery', { skip: !url }, async () => {
	assert.equal(new URL(url!).pathname, '/geesome_membership_test');
	const { createCryptoBalanceObserver } = await import('../../app/modules/payments/cryptoBalanceObserver.js');
	const { quantity } = await import('../../app/modules/payments/cryptoRpcValues.js');
	const { cryptoAsset } = await import('../../app/modules/payments/cryptoAssets.js');
	const db = new Sequelize(url!, { logging: false, pool: { max: 10 } }), epoch = Date.parse('2026-10-17T00:00:00Z');
	let now = new Date(epoch), latest = 100n, finalized = 100n, boundary: bigint | null = null;
	const balances = new Map<bigint, bigint>([[100n, 50000000n]]), nativeBalances = new Map<bigint, bigint>(), nonces = new Map<bigint, bigint>();
	let insertFundingAfterScan = false;
	const at = (map: Map<bigint, bigint>, height: bigint) => [...map].filter(([h]) => h <= height).sort((a, b) => a[0] < b[0] ? 1 : -1)[0]?.[1] || 0n;
	const hash = (h: bigint) => '0x' + h.toString(16).padStart(64, '0');
	const rpc = async (_network: string, method: string, params: any[]) => {
		if (method === 'eth_getBlockByNumber') {
			const h = params[0] === 'latest' ? latest : params[0] === 'finalized' ? finalized : BigInt(params[0]);
			const timestamp = h < 116n ? BigInt(epoch / 1000) + h - 100n : BigInt(epoch / 1000) + 1861n + h - 116n;
			return { number: quantity(h), hash: hash(h), timestamp: quantity(timestamp) };
		}
		if (method === 'eth_call') {
			return quantity(at(balances, BigInt(params[1])));
		}
		if (method === 'eth_getBalance') {
			return quantity(at(nativeBalances, BigInt(params[1])));
		}
		if (method === 'eth_getTransactionCount') {
			return quantity(at(nonces, BigInt(params[1])));
		}
		throw Error('unexpected balance SQL RPC ' + method);
	};
	const balanceObserver = createCryptoBalanceObserver(rpc, async () => true);
	const observer = { check: async () => true, boundary: async () => ({ height: String(boundary ?? latest) }), quote: async (id: string) => { if (id.startsWith('eth-')) {
			return '1000';
		} throw Error('price_feed_offline'); }, scan: async () => { throw Error('explorer_must_not_be_used'); }, scanBalances: async (snapshot: any, address: string, context: any) => {
			const result = await balanceObserver.scan(snapshot, address, context);
			if (insertFundingAfterScan) {
				insertFundingAfterScan = false;
				await M.crypto_transactions.create({ id: 'late-gas-funding', network: 'base', hash: hash(888n), sender: managedWallet(env)!.address(0), nonce: '0', raw: '0x00', state: 'confirmed', data: { request: { to: address, value: '5000000000000000' }, balanceReceipt: { transactionHash: hash(888n), blockNumber: quantity(136n), blockHash: hash(136n), status: '0x1', logs: [] } } });
			}
			return result;
		} };
	let M: any;
	try {
		const start = () => createMembershipService({ sequelize: db, env, clock: () => now, cryptoObserver: observer, resolveClient: async () => null });
		let s = await start();
		await s.seedSites();
		M = s.models;
		for (const id of ['wave', 'meat']) {
			await (await s.resource(id)).update({ postsEnabled: true });
			await s.directCrypto.treasury.save(id, { payout: '0x' + 'a'.repeat(40), version: 0 });
		}
		const reader = randomUUID();
		await M.readers.create({ id: reader, googleSub: reader, email: 'balance@example.test', name: 'Balance' });
		// Freeze this ledger/collection regression at its original $5 fixture price.
		await M.options.update({ amountCents: 500 }, { where: { period: 'month' } });
		const options = await M.options.findAll();
		const create = (resource: string, key: string) => s.directCrypto.invoice(resource, reader, { assetId: 'usdc-base', optionId: options.find(o => o.resourceId === resource && o.period === 'month').id, idempotencyKey: key });
		const one = await create('wave', 'balance-one');
		assert.equal(one.amount, '5');
		balances.set(102n, 52000000n);
		latest = 105n;
		finalized = 103n;
		now = new Date(epoch + 5000);
		await Promise.all([s.directCrypto.run(), s.directCrypto.rescan('wave', one.id)]);
		assert.equal((await s.directCrypto.read('wave', reader, one.id)).received, '2');
		assert.equal(await M.crypto_transfers.count({ where: { cryptoInvoiceId: one.id } }), 1);
		assert.equal((await M.crypto_runtime.findByPk('balance:' + one.id)).data.received, '2000000');
		s = await start();
		balances.set(106n, 55000000n);
		latest = 108n;
		finalized = 105n;
		now = new Date(epoch + 8000);
		await s.directCrypto.rescan('wave', one.id);
		assert.equal((await s.directCrypto.read('wave', reader, one.id)).status, 'confirming');
		latest = 110n;
		finalized = 110n;
		now = new Date(epoch + 10000);
		await Promise.all([s.directCrypto.rescan('wave', one.id), s.directCrypto.run()]);
		assert.equal((await s.directCrypto.read('wave', reader, one.id)).status, 'paid');
		assert.equal(await M.periods.count({ where: { invoiceId: one.id } }), 1);
		assert.equal(await M.crypto_transfers.count({ where: { cryptoInvoiceId: one.id } }), 2);
		const records = await M.crypto_transfers.findAll({ where: { cryptoInvoiceId: one.id } });
		assert.ok(records.every(row => row.data.txid === '' && row.data.balanceProof));
		// Even an old boundary captured before a slow allocation cannot reuse already credited blocks.
		boundary = 100n;
		const two = await create('meat', 'balance-two');
		boundary = null;
		assert.equal(two.address, one.address);
		assert.equal((await M.crypto_invoices.findByPk(two.id)).snapshot.startBlock, '110');
		await s.directCrypto.rescan('meat', two.id);
		assert.equal((await s.directCrypto.read('meat', reader, two.id)).received, '0');
		const txHash = hash(999n), contract = cryptoAsset('usdc-base').contract!;
		await M.crypto_transactions.create({ id: one.id + ':payout', network: 'base', hash: txHash, sender: one.address, nonce: '0', raw: '0x00', state: 'confirmed', data: { request: { to: contract, value: '0' }, balanceReceipt: { transactionHash: txHash, blockNumber: '0x70', blockHash: hash(112n), status: '0x1', logs: [{ address: contract, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', '0x' + one.address.slice(2).padStart(64, '0'), '0x' + 'a'.repeat(40).padStart(64, '0')], data: '0x' + (5000000n).toString(16).padStart(64, '0') }] } } });
		balances.set(112n, 50000000n);
		balances.set(113n, 52000000n);
		nonces.set(112n, 1n);
		latest = 115n;
		finalized = 115n;
		now = new Date(epoch + 15000);
		await s.directCrypto.rescan('meat', two.id);
		assert.equal((await s.directCrypto.read('meat', reader, two.id)).received, '2');
		now = new Date(epoch + 31 * 60000);
		await s.directCrypto.rescan('meat', two.id);
		assert.equal((await s.directCrypto.read('meat', reader, two.id)).status, 'expired');
		const three = await create('wave', 'balance-three');
		assert.equal(three.address, one.address);
		assert.equal((await M.crypto_invoices.findByPk(two.id)).snapshot.endBlock, '115');
		balances.set(118n, 55000000n);
		latest = 120n;
		finalized = 120n;
		now = new Date(epoch + 31 * 60000 + 5000);
		await s.directCrypto.rescan('wave', three.id);
		assert.equal((await s.directCrypto.read('wave', reader, three.id)).received, '3');
		balances.set(122n, 57000000n);
		latest = 125n;
		finalized = 125n;
		now = new Date(epoch + 31 * 60000 + 10000);
		await s.directCrypto.rescan('wave', three.id);
		await s.directCrypto.rescan('meat', two.id);
		assert.equal((await s.directCrypto.read('wave', reader, three.id)).status, 'paid');
		assert.equal((await s.directCrypto.read('meat', reader, two.id)).received, '2');
		assert.equal(await M.periods.count(), 2);
		await s.directCrypto.rescan('wave', three.id);
		assert.equal(await M.periods.count(), 2);
		await M.crypto_runtime.destroy({ where: { id: 'balance-cursor:' + (await M.crypto_invoices.findByPk(three.id)).addressId + ':usdc-base' } });
		boundary = 100n;
		const four = await create('wave', 'balance-atomic-recovery');
		boundary = null;
		assert.equal((await M.crypto_invoices.findByPk(four.id)).snapshot.startBlock, '125');
		balances.set(130n, 62000000n);
		latest = 132n;
		finalized = 132n;
		now = new Date(epoch + 31 * 60000 + 20000);
		await M.crypto_invoices.update({ scanLease: randomUUID(), scanLeaseUntil: new Date(now.getTime() + 10000) }, { where: { id: four.id } });
		await s.directCrypto.rescan('wave', four.id);
		assert.equal((await s.directCrypto.read('wave', reader, four.id)).status, 'pending');
		await M.crypto_invoices.update({ scanLeaseUntil: new Date(now.getTime() - 1) }, { where: { id: four.id } });
		const runtime = s.models.crypto_runtime, upsert = runtime.upsert;
		runtime.upsert = async function (values: any, options: any) { if (values.id === 'balance:' + four.id) {
			throw Error('injected_checkpoint_write_failure');
		} return upsert.call(this, values, options); };
		try {
			await s.directCrypto.rescan('wave', four.id);
		}
		finally {
			runtime.upsert = upsert;
		}
		assert.equal((await s.directCrypto.read('wave', reader, four.id)).received, '0');
		assert.equal(await M.crypto_transfers.count({ where: { cryptoInvoiceId: four.id } }), 0);
		assert.equal(await M.periods.count({ where: { invoiceId: four.id } }), 0);
		await s.directCrypto.rescan('wave', four.id);
		assert.equal((await s.directCrypto.read('wave', reader, four.id)).status, 'paid');
		assert.equal(await M.periods.count({ where: { invoiceId: four.id } }), 1);
		const native = await s.directCrypto.invoice('wave', reader, { assetId: 'eth-base', optionId: options.find(o => o.resourceId === 'wave' && o.period === 'month').id, idempotencyKey: 'balance-native-funding-race' });
		nativeBalances.set(136n, 5000000000000000n);
		latest = 140n;
		finalized = 140n;
		now = new Date(epoch + 31 * 60000 + 30000);
		insertFundingAfterScan = true;
		await s.directCrypto.rescan('wave', native.id);
		assert.equal((await s.directCrypto.read('wave', reader, native.id)).status, 'pending');
		assert.equal(await M.periods.count({ where: { invoiceId: native.id } }), 0);
		await s.directCrypto.rescan('wave', native.id);
		assert.equal((await s.directCrypto.read('wave', reader, native.id)).received, '0');
		nativeBalances.set(142n, 10000000000000000n);
		latest = 145n;
		finalized = 145n;
		now = new Date(epoch + 31 * 60000 + 35000);
		await s.directCrypto.rescan('wave', native.id);
		assert.equal((await s.directCrypto.read('wave', reader, native.id)).status, 'paid');
		assert.equal(await M.periods.count({ where: { invoiceId: native.id } }), 1);
	}
	finally {
		if (M) {
			await M.crypto_transfers.destroy({ where: {} });
			await M.crypto_invoices.destroy({ where: {} });
			await M.crypto_collections.destroy({ where: {} });
			await M.crypto_transactions.destroy({ where: {} });
		}
		await db.close();
	}
});
