import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import {createMembershipService} from './sqlHarness.js';

const url = process.env.CREATOR_MEMBERSHIP_TEST_DATABASE_URL;
test('verified credit SQL: proportional time, old snapshots, late approval and exactly-once credit', {skip: !url}, async () => {
	assert.equal(new URL(url!).pathname, '/geesome_membership_test');
	const db = new Sequelize(url!, {logging: false});
	let now = new Date('2026-01-31T12:00:00Z');
	const deposits = new Map();
	const observer = {check: async () => true, quote: async () => '1', scan: async (_snapshot, address) => deposits.get(address) || []};
	try {
		const service = await createMembershipService({sequelize: db, env: {}, clock: () => now, cryptoObserver: observer, cryptoAdapter: {}});
		await service.seedSites();
		await (await service.resource('wave')).update({postsEnabled: true});
		await service.directCrypto.save('wave', {network: 'base', enabled: true, version: 0, xpub: '',
			pool: [1, 2, 3, 4].map(i => '0x' + String(i).repeat(40)), assets: ['usdc-base']});
		const option = await service.models.options.findOne({where: {resourceId: 'wave', period: 'month'}});
		async function invoice(reader = randomUUID()) {
			return service.directCrypto.invoice('wave', reader, {optionId: option.id, assetId: 'usdc-base', idempotencyKey: randomUUID()});
		}
		function deposit(invoice, atomic, timestamp = now.getTime() + 1) {
			deposits.set(invoice.address, [{key: randomUUID(), txid: '0x' + 'a'.repeat(64), atomic, confirmed: true, timestamp}]);
		}
		const extra = await invoice();
		deposit(extra, '6000000');
		await service.directCrypto.rescan('wave', extra.id);
		const credited = await service.models.periods.findOne({where: {invoiceId: extra.id}});
		assert.equal(credited.endsAt.toISOString(), '2026-03-16T00:00:00.000Z');
		const original = await service.models.invoices.findByPk(extra.id);
		const renewal = await invoice(original.readerId);
		deposit(renewal, '4000000');
		await service.directCrypto.rescan('wave', renewal.id);
		assert.equal((await service.models.periods.findOne({where: {invoiceId: renewal.id}})).endsAt.toISOString(), '2026-04-16T00:00:00.000Z');
		const old = await invoice();
		const oldRow = await service.models.crypto_invoices.findByPk(old.id);
		const {creditOptions, ...snapshot} = oldRow.snapshot;
		await oldRow.update({snapshot});
		deposit(old, '20000000');
		await service.directCrypto.rescan('wave', old.id);
		assert.equal((await service.models.periods.findOne({where: {invoiceId: old.id}})).endsAt.toISOString(), '2026-06-30T12:00:00.000Z');
		const late = await invoice();
		now = new Date(new Date(late.expiresAt).getTime() + 1000);
		deposit(late, '22000000', now.getTime());
		let result = await service.directCrypto.rescan('wave', late.id);
		assert.equal(result.status, 'late_payment');
		assert.equal(await service.models.periods.count({where: {invoiceId: late.id}}), 0);
		await Promise.all([service.directCrypto.review('wave', late.id), service.directCrypto.review('wave', late.id)]);
		result = await service.directCrypto.rescan('wave', late.id);
		assert.equal(result.status, 'paid');
		assert.equal(result.credit.period, 'halfyear');
		assert(result.credit.extraDays > 0);
		assert.equal(await service.models.periods.count({where: {invoiceId: late.id}}), 1);
	}
	finally {
		await db.close();
	}
});
