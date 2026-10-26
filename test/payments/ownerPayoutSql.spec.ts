import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Sequelize } from 'sequelize';
import { createMembershipService } from './sqlHarness.js';
import { managedWallet } from '../../app/modules/payments/cryptoManagedWallet.js';
const url = process.env.CREATOR_MEMBERSHIP_TEST_DATABASE_URL;
const env = { DIRECT_CRYPTO_SEED_PHRASE: 'test test test test test test test test test test test junk', DIRECT_CRYPTO_CONFIG: '{"networks":["base"]}' };
const addr = digit => '0x' + digit.repeat(40);
async function fixture(work) {
	const parsed = new URL(url!);
	assert(['127.0.0.1', 'localhost'].includes(parsed.hostname));
	assert.equal(parsed.pathname, '/geesome_membership_test');
	const db = new Sequelize(url!, { logging: false, pool: { max: 8 } });
	let now = new Date(), block = 100;
	const transfers = new Map<string, any[]>();
	const observer = { check: async () => true, quote: async (id) => id.startsWith('eth') ? '1000' : '1',
		boundary: async () => ({ height: String(block) }),
		scan: async (snapshot, address) => (transfers.get(address) || []).filter(value => BigInt(value.blockHeight) > BigInt(snapshot.startBlock)) };
	const adapter = {
		balance: async (_network, _address, asset?) => asset ? 4000000n : 1000000000000000000n,
		fees: async () => ({ gasPrice: 1n, maxFeePerGas: 1n }),
		transfer: (to, amount, contract?) => ({ to, amount: String(amount), contract }),
		prepare: async () => ({ fee: '1' }),
		receipt: async () => { throw Error('unexpected_receipt'); },
		broadcast: async () => { throw Error('unexpected_broadcast'); }
	};
	const start = () => createMembershipService({ sequelize: db, env, clock: () => now, cryptoObserver: observer, cryptoAdapter: adapter });
	try {
		const service = await start();
		await service.seedSites();
		const M = service.models;
		for (const id of ['wave', 'meat']) {
			await (await service.resource(id)).update({ postsEnabled: true });
		}
		await M.resources.create({ id: 'second-wave', domain: 'second-wave.test', ownerId: 1, groupId: '3', postsEnabled: true, data: {} });
		const option = await M.options.findOne({ where: { resourceId: 'wave', period: 'month' } });
		const invoice = (readerId = randomUUID()) => service.directCrypto.invoice('wave', readerId, { optionId: option.id, assetId: 'usdc-base', idempotencyKey: randomUUID() });
		await work({ service, M, start, invoice, wallet: managedWallet(env), async paid(created) {
				now = new Date(now.getTime() + 2000);
				block += 10;
				transfers.set(created.address, [{ key: randomUUID(), txid: '0x' + '1'.repeat(64), atomic: '4000000', confirmed: true, timestamp: now.getTime(), blockHeight: String(block) }]);
				await service.directCrypto.rescan('wave', created.id);
				assert.equal((await M.crypto_invoices.findByPk(created.id)).status, 'paid');
			}, now: () => now });
	}
	finally {
		await db.close();
	}
}
test('owner payout SQL: group inheritance, overrides, version conflicts and permanent receiving-address reservations', { skip: !url }, async () => fixture(async ({ service, M, invoice, wallet }) => {
	const treasury = service.directCrypto.treasury;
	assert.equal(await treasury.available('wave', 'base'), false);
	await treasury.saveOwnerDefault(1, { payout: addr('a'), version: 0 });
	for (const group of ['wave', 'second-wave']) {
		const settings = await treasury.settings(group);
		assert.equal(settings.payout, addr('a'));
		assert.equal(settings.payoutSource, 'owner');
		assert.equal(settings.version, 0);
		assert.equal(settings.ownerDefault.version, 1);
	}
	assert.equal(await treasury.available('meat', 'base'), false);
	await treasury.saveOwnerDefault(2, { payout: addr('b'), version: 0 });
	assert.equal((await treasury.settings('meat')).payout, addr('b'));
	await treasury.save('wave', { payout: addr('c'), version: 0 });
	await treasury.saveOwnerDefault(1, { payout: addr('d'), version: 1 });
	assert.equal((await treasury.settings('wave')).payout, addr('c'));
	assert.equal((await treasury.settings('wave')).payoutSource, 'group');
	assert.equal((await treasury.settings('second-wave')).payout, addr('d'));
	await treasury.save('wave', { inherit: true, version: 1 });
	const inherited = await treasury.settings('wave');
	assert.equal(inherited.payout, addr('d'));
	assert.equal(inherited.groupPayout, '');
	assert.equal(inherited.version, 2);
	await assert.rejects(treasury.save('wave', { inherit: true, version: 1 }), /crypto_settings_version_conflict/);
	const edits = await Promise.allSettled(['e', 'f'].map(digit => treasury.saveOwnerDefault(1, { payout: addr(digit), version: 2 })));
	assert.equal(edits.filter(result => result.status === 'fulfilled').length, 1);
	assert.match((edits.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.message, /crypto_settings_version_conflict/);
	const current = await treasury.ownerDefault(1);
	assert.equal(current.version, 3);
	await assert.rejects(treasury.saveOwnerDefault(1, { payout: 'bad', version: 3 }), /crypto_payout_invalid/);
	await assert.rejects(treasury.saveOwnerDefault(1, { payout: wallet.address(0), version: 3 }), /crypto_payout_is_service/);
	await assert.rejects(treasury.saveOwnerDefault(1, { userId: 2, payout: addr('a'), version: 3 }), /crypto_payout_invalid/);
	const first = await invoice();
	assert.equal((await M.crypto_invoices.findByPk(first.id)).snapshot.payoutDestination.payout, current.payout);
	await assert.rejects(treasury.saveOwnerDefault(1, { payout: first.address, version: 3 }), /crypto_payout_is_deposit/);
	await treasury.saveOwnerDefault(1, { payout: wallet.address(2), version: 3 });
	await treasury.saveOwnerDefault(1, { payout: addr('a'), version: 4 });
	const second = await invoice();
	const address = await M.crypto_addresses.findOne({ where: { address: second.address } });
	assert.equal(address.index, 3, 'a former payout destination must never become a buyer deposit wallet');
	assert(await M.payout_addresses.findByPk(wallet.address(2)));
	assert.equal((await M.crypto_invoices.findByPk(first.id)).snapshot.payoutDestination.payout, current.payout);
}));
test('owner payout SQL: invoice destinations survive settings edits/restart and legacy jobs keep their original group fallback', { skip: !url }, async () => fixture(async ({ service, M, start, invoice, paid, now }) => {
	const treasury = service.directCrypto.treasury;
	await treasury.saveOwnerDefault(1, { payout: addr('a'), version: 0 });
	const created = await invoice();
	const frozen = (await M.crypto_invoices.findByPk(created.id)).snapshot.payoutDestination;
	assert.deepEqual(frozen, { resourceId: 'wave', ownerId: 1, payout: addr('a'), source: 'owner', version: 1 });
	await treasury.saveOwnerDefault(1, { payout: addr('b'), version: 1 });
	await treasury.save('wave', { payout: addr('c'), version: 0 });
	await paid(created);
	await treasury.run();
	let job = await M.crypto_collections.findByPk(created.id);
	assert.equal(job.state, 'reserve');
	assert.equal(job.data.payout, addr('a'));
	assert.deepEqual(job.data.payoutDestination, frozen);
	await treasury.save('wave', { inherit: true, version: 1 });
	await treasury.saveOwnerDefault(1, { payout: addr('d'), version: 2 });
	const restarted = await start();
	await restarted.directCrypto.treasury.run();
	job = await M.crypto_collections.findByPk(created.id);
	assert.equal(job.state, 'payout');
	assert.equal(job.data.payout, addr('a'));
	// Defer that ready job: the rest of the test exercises admission/planning only.
	await job.update({ data: { ...job.data, retryAt: now().getTime() + 3600000 } });
	await treasury.save('wave', { payout: addr('c'), version: 2 });
	const legacy = await invoice();
	const row = await M.crypto_invoices.findByPk(legacy.id);
	const { payoutDestination, ...oldSnapshot } = row.snapshot;
	assert.equal(payoutDestination.source, 'group');
	await row.update({ snapshot: oldSnapshot });
	await paid(legacy);
	await treasury.save('wave', { inherit: true, version: 3 });
	await treasury.run();
	const held = await M.crypto_collections.findByPk(legacy.id);
	assert.equal(held.state, 'new');
	assert.equal(held.lastError, 'crypto_payout_required');
	assert.equal(held.data.payout, undefined, 'historical money must not acquire a new owner-default destination');
	await treasury.save('wave', { payout: addr('c'), version: 4 });
	await held.update({ data: { ...held.data, retryAt: null } });
	await treasury.run();
	const resumed = await M.crypto_collections.findByPk(legacy.id);
	assert.equal(resumed.state, 'reserve');
	assert.equal(resumed.data.payout, addr('c'));
	assert.equal(await M.crypto_transactions.count(), 0, 'no test operation broadcasts or prepares a real transfer');
}));
