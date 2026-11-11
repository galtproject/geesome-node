import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import definePayments from '../../app/modules/payments/models.js';
import defineMembership from '../../app/modules/membership/models.js';
import {createOwnerBalances} from '../../app/modules/payments/ownerBalances.js';
import {createCryptoTransactionJournal} from '../../app/modules/payments/cryptoTransactionJournal.js';
import {createEvmAdapter} from '../../app/modules/payments/cryptoEvm.js';
import {recordTransferBalances,saveWalletSnapshot} from '../../app/modules/payments/walletBalanceSnapshots.js';
const url=process.env.CREATOR_MEMBERSHIP_TEST_DATABASE_URL;
test('database views use payment and confirmed transfer snapshots without RPC; older events cannot overwrite newer balances', {skip:!url}, async()=>{
	const db=new Sequelize(url!,{logging:false});
	try {
		await db.getQueryInterface().dropAllTables();
		const M={...await definePayments(db),...await defineMembership(db)};
		let now=new Date('2026-11-11T12:00:00Z'),calls=0,fail=false;
		const reader=randomUUID(),addressId=randomUUID(),address='0x'+'a'.repeat(40),owner='0x'+'b'.repeat(40);
		for(const [id,ownerId] of [['wave',1],['meat',2]] as const){await M.resources.create({id,domain:id+'.test',ownerId,groupId:String(ownerId),postsEnabled:true,data:{}});}
		await M.owner_payouts.create({userId:1,payout:owner,version:1});
		await M.crypto_addresses.create({id:addressId,identity:'base:'+address,walletId:'managed',address,network:'base'});
		await M.crypto_accounts.create({id:addressId+':usdc-base',resourceId:'wave',readerId:reader,addressId,assetId:'usdc-base',snapshot:{observedAt:now.toISOString(),checkpoint:{latest:{height:'100',balance:'7000000'}}},receivedAtomic:'12345678901234567890',consumedAtomic:'12345678901230000000',nextCheckAt:now});
		const service=createOwnerBalances({M,resource:async id=>{assert(['wave','meat'].includes(id));},clock:()=>now,networks:['base']});
		let view=await service.read('wave');
		assert.equal(view.balances.length,3);assert.equal(calls,0);
		assert.equal(view.balances.find(r=>r.kind==='user').wallet.amount,'7');
		assert.equal(view.balances.find(r=>r.kind==='user').availableCredit,'4.56789');
		assert(view.balances.filter(r=>r.kind==='owner').every(r=>r.wallet.amount===null));
		const tx={network:'base',sender:address,data:{proof:{to:owner,contract:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'},request:{to:owner}}};
		const evm={balance:async(n,a,asset,tag)=>{calls++;assert.equal(tag,'0x65');if(fail){throw Error('secret diagnostics');}return a===owner?10000000n:2000000n;}};
		const journalRow=await M.crypto_transactions.create({id:randomUUID(),network:'base',sender:address,hash:'0x'+'9'.repeat(64),nonce:'1',raw:'signed-fixture',state:'confirmed',data:{...tx.data,balanceReceipt:{blockNumber:'0x65'}}});
		const journal=createCryptoTransactionJournal({M,evm:evm as any});
		await journal.send('base',journalRow.id,1,{});
		assert.equal(calls,3);await journal.send('base',journalRow.id,1,{});
		assert.equal(calls,3,'confirmed event replay does not re-query RPC');view=await service.read('wave');assert.equal(calls,3);
		assert.equal(view.balances.find(r=>r.kind==='user').wallet.amount,'2');
		assert.equal(view.balances.find(r=>r.kind==='owner'&&r.assetId==='usdc-base').wallet.amount,'10');
		await saveWalletSnapshot(M,{network:'base',address,assetId:'usdc-base',amountAtomic:'999999999',blockHeight:'99',observedAt:now.toISOString()});
		assert.equal((await service.read('wave')).balances.find(r=>r.kind==='user').wallet.amount,'2');
		fail=true;await recordTransferBalances(M,evm,tx,{blockNumber:'0x65'},()=>now);
		view=await service.read('wave');assert(!JSON.stringify(view).includes('secret'));
		assert(view.balances.filter(r=>r.assetId==='usdc-base').every(r=>r.wallet.error==='balance_check_failed'&&r.wallet.stale));
		now=new Date(now.getTime()+2*86400000);assert((await service.read('wave')).balances.every(r=>r.wallet.stale));
		assert.deepEqual((await service.read('meat')).balances,[]);
		assert.equal((await service.read('wave',{offset:20})).balances.length,0);
		await assert.rejects(service.read('foreign'));
	} finally {await db.close();}
});

test('EVM snapshot reads use the event block for native assets and tokens',async()=>{
	const calls:any[]=[];
	const adapter=createEvmAdapter({}, {rpc:{call:async(n,m,p)=>{calls.push({n,m,p});return '0x7';}}});
	assert.equal(await adapter.balance('base','0x'+'a'.repeat(40),'usdc-base','0x65'),7n);
	assert.equal(calls[0].m,'eth_call');assert.equal(calls[0].p[1],'0x65');
	await adapter.balance('base','0x'+'a'.repeat(40),'eth-base','0x65');
	assert.equal(calls[1].m,'eth_getBalance');assert.equal(calls[1].p[1],'0x65');
	await adapter.balance('base','0x'+'a'.repeat(40));assert.equal(calls[2].p[1],'latest');
});
