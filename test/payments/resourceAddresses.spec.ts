import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { Sequelize } from 'sequelize';
import { createMembershipService } from './sqlHarness.js';
import { managedWallet } from '../../app/modules/payments/cryptoManagedWallet.js';
const migration = createRequire(import.meta.url)('../../app/modules/database/migrations/20261028000000-scope-payment-addresses-to-resources.cjs');
const url = process.env.CREATOR_MEMBERSHIP_TEST_DATABASE_URL;
const env = {DIRECT_CRYPTO_SEED_PHRASE: 'test test test test test test test test test test test junk', DIRECT_CRYPTO_CONFIG: '{"networks":["base","ethereum"]}'};
function database() {
    assert.equal(new URL(url!).pathname, '/geesome_membership_test');
    return new Sequelize(url!, {logging: false, pool: {max: 10}});
}
test('resource addresses: concurrency, settlement isolation, stable renewals/network/restart', {skip: !url}, async () => {
    const db = database(), deposits = new Map<string, any[]>();
    let now = new Date('2026-10-28T12:00:00Z'), height = 100;
    const observer = {check: async () => true, boundary: async () => ({height: String(height)}), quote: async () => '1',
        scan: async (snapshot, address) => snapshot.assetId === 'usdc-base' ? (deposits.get(address) || []).filter(row => BigInt(row.blockHeight) > BigInt(snapshot.startBlock)) : []};
    try {
        const start = () => createMembershipService({sequelize: db, env, clock: () => now, cryptoObserver: observer, cryptoAdapter: {}});
        let service = await start();
        await service.seedSites();
        for (const id of ['wave', 'meat']) {
            await (await service.resource(id)).update({postsEnabled: true});
            await service.directCrypto.treasury.save(id, {payout: '0x' + (id === 'wave' ? 'a' : 'b').repeat(40), version: 0});
        }
        const options = await service.models.options.findAll();
        const reader = randomUUID(), other = randomUUID();
        const invoice = (resource, who = reader, assetId = 'usdc-base') => service.directCrypto.invoice(resource, who, {
            assetId, optionId: options.find(o => o.resourceId === resource && o.period === 'month').id, idempotencyKey: randomUUID()});
        const results = await Promise.allSettled(Array.from({length: 8}, (_, i) => invoice(i % 2 ? 'meat' : 'wave')));
        const allocated = results.filter(r => r.status === 'fulfilled').map((r: any) => r.value);
        assert.equal(allocated.length, 2, 'one unfinished invoice per reader/resource/asset');
        assert.equal(results.filter(r => r.status === 'rejected').length, 6);
        const rows = await service.models.crypto_hd_accounts.findAll({order: [['index', 'ASC']]});
        assert.deepEqual(rows.map(r => r.index), [1, 2]);
        assert.equal(new Set(rows.map(r => r.resourceId)).size, 2);
        const accounts = Object.fromEntries(rows.map(r => [r.resourceId, r]));
        const waveAddress = managedWallet(env)!.address(accounts.wave.index), meatAddress = managedWallet(env)!.address(accounts.meat.index);
        assert.notEqual(waveAddress, meatAddress);
        const wave = allocated.find(i => i.address === waveAddress), meat = allocated.find(i => i.address === meatAddress);
        assert.equal((await invoice('wave', other)).address, managedWallet(env)!.address(3));
        assert.equal((await invoice('wave', reader, 'eth-ethereum')).address, waveAddress);
        const current = await service.models.crypto_invoices.findByPk(wave.id);
        deposits.set(waveAddress, [{key: 'base:resource-only', txid: 'resource-only', atomic: current.snapshot.amountAtomic,
            confirmed: true, timestamp: now.getTime() + 1000, blockHeight: '101'}]);
        now = new Date(now.getTime() + 5000);
        await service.directCrypto.run();
        assert.equal((await service.directCrypto.read('wave', reader, wave.id)).status, 'paid');
        assert.equal((await service.directCrypto.read('meat', reader, meat.id)).received, '0');
        assert.equal(await service.models.periods.count({where: {resourceId: 'wave', readerId: reader}}), 1);
        assert.equal(await service.models.periods.count({where: {resourceId: 'meat', readerId: reader}}), 0);
        height = 101;
        service = await start();
        assert.equal((await invoice('wave')).address, waveAddress);
        assert.equal(await service.models.crypto_hd_accounts.count(), 3);
        await assert.rejects(invoice('meat'), /crypto_reader_invoice_pending/);
    }
    finally {
        await db.close();
    }
});
test('resource address migration preserves keys and reserves ambiguous allocations', {skip: !url}, async () => {
    const db = database(), qi = db.getQueryInterface();
    try {
        await qi.dropAllTables();
        await migration.up(qi);
        await db.query(`CREATE TABLE payments_crypto_hd_accounts (id text PRIMARY KEY, "walletFingerprint" varchar(64) NOT NULL,
            "readerId" text NOT NULL, "addressId" text NOT NULL, index integer NOT NULL);
            CREATE UNIQUE INDEX legacy_reader_unique ON payments_crypto_hd_accounts ("walletFingerprint", "readerId");
            CREATE UNIQUE INDEX global_index_unique ON payments_crypto_hd_accounts ("walletFingerprint", index);
            CREATE TABLE payments_crypto_invoices (id text PRIMARY KEY, "readerId" text NOT NULL, "resourceId" text NOT NULL,
                "addressId" text NOT NULL, snapshot jsonb NOT NULL);
            INSERT INTO payments_crypto_hd_accounts VALUES ('single','seed','one','address-one',1),
                ('shared','seed','two','address-two',2),('unused','seed','three','address-three',3),('mismatch','seed','four','address-four',4);
            INSERT INTO payments_crypto_invoices VALUES ('invoice-one','one','wave','address-one','{"boundary":123}'),
                ('invoice-two','two','wave','address-two','{}'),('invoice-three','two','meat','address-two','{}'),
                ('invoice-four','wrong-reader','wave','address-four','{}');`);
        const [before] = await db.query('SELECT * FROM payments_crypto_invoices ORDER BY id');
        await migration.up(qi);
        await migration.up(qi);
        const [rows]: any = await db.query('SELECT * FROM payments_crypto_hd_accounts ORDER BY index');
        assert.deepEqual(rows.map(r => r.resourceId), ['wave', null, null, null]);
        assert.deepEqual(rows.map(r => r.addressId), ['address-one','address-two','address-three','address-four']);
        assert.deepEqual((await db.query('SELECT * FROM payments_crypto_invoices ORDER BY id'))[0], before);
        await assert.rejects(db.query(`INSERT INTO payments_crypto_hd_accounts VALUES ('duplicate','seed','one','other-address',5,'wave')`));
        await assert.rejects(db.query(`INSERT INTO payments_crypto_hd_accounts VALUES ('duplicate-index','seed','other','other-address',1,'meat')`));
        await db.query(`INSERT INTO payments_crypto_hd_accounts VALUES ('new-meat','seed','one','address-five',5,'meat')`);
        await assert.rejects(migration.down(qi), /rollback_requires_reconciliation/);
        assert.ok((await qi.describeTable('payments_crypto_hd_accounts')).resourceId);
        await db.query("DELETE FROM payments_crypto_hd_accounts WHERE id='new-meat'");
        await migration.down(qi);
        assert.equal((await qi.describeTable('payments_crypto_hd_accounts')).resourceId, undefined);
        await migration.up(qi);
    }
    finally {
        await db.close();
    }
});

test('weekly quotes remain payable through day seven and observe on-time receipts confirmed afterwards', {skip: !url}, async () => {
    const db = database(), deposits = new Map<string, any[]>();
    const epoch = Date.parse('2026-10-28T12:00:00Z');
    let now = new Date(epoch);
    const observer = {check:async()=>true, boundary:async()=>({height:'100'}), quote:async()=> '1',
        scan:async (_snapshot, address)=>(deposits.get(address)||[])};
    try {
        const service = await createMembershipService({sequelize:db, env, clock:()=>now, cryptoObserver:observer, cryptoAdapter:{}});
        await service.seedSites();
        await (await service.resource('wave')).update({postsEnabled:true});
        await service.directCrypto.treasury.save('wave',{payout:'0x'+'a'.repeat(40),version:0});
        const option=(await service.models.options.findOne({where:{resourceId:'wave'}})).id;
        const invoice=await service.directCrypto.invoice('wave',randomUUID(),{optionId:option,assetId:'usdc-base',idempotencyKey:randomUUID()});
        assert.equal(new Date(invoice.expiresAt).getTime(),epoch+7*86400000);
        // The SQL createdAt uses the real database clock, unlike the injected application clock.
        await service.models.crypto_invoices.update({createdAt:new Date(epoch)}, {where:{id:invoice.id},silent:true});
        assert.equal(new Date((await service.directCrypto.read('wave', (await service.models.crypto_invoices.findByPk(invoice.id)).readerId, invoice.id)).monitoringUntil).getTime(), epoch+14*86400000);
        now=new Date(epoch+6*86400000);
        await service.directCrypto.run();
        assert.equal((await service.models.crypto_invoices.findByPk(invoice.id)).status,'pending');
        now=new Date(epoch+7*86400000+60000);
        deposits.set(invoice.address,[{key:'base:week-end',txid:'week-end',atomic:'4000000',confirmed:true,
            timestamp:epoch+7*86400000-60000,blockHeight:'101'}]);
        await service.directCrypto.run();
        assert.equal((await service.models.crypto_invoices.findByPk(invoice.id)).status,'paid');
        assert.equal(await service.models.periods.count({where:{invoiceId:invoice.id}}),1);
        await service.directCrypto.run();
        assert.equal(await service.models.periods.count({where:{invoiceId:invoice.id}}),1);
    } finally {await db.close();}
});
