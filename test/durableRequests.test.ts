import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import {createDurableRequests, defineDurableRequestModel, runAsAcceptingKey} from '../app/durableRequests.js';

describe('durable asynchronous request admission and recovery', function () {
	this.timeout(30000);
	let db, model, kind, clock, workers;
	before(async () => {db=new Sequelize({...config as any,logging:false});model=await defineDurableRequestModel(db);});
	beforeEach(() => {kind=`t-${randomUUID()}`;clock=new Date();workers=[];});
	afterEach(async () => {await Promise.all(workers.map(worker=>worker.stop()));await model.destroy({where:{kind}});});
	after(async () => {await db.close();});
	const queue = (run,options={}) => {const worker=createDurableRequests(model,kind,run,{autoStart:false,now:()=>clock,...options});workers.push(worker);return worker;};
	it('persists acceptance without executing slow work; survives a new worker instance',async () => {
		let calls=0;
		const first=queue(async()=>{calls++;return {jobs:[1]};});
		const accepted=await first.accept('owner','key-1',{images:['one']});
		assert.equal(accepted.status,'queued');assert.equal(calls,0);
		const second=queue(async()=>{calls++;return {jobs:[1]};});await second.process();
		assert.deepEqual((await second.get('owner',accepted.operationId)).result,{jobs:[1]});assert.equal(calls,1);
	});
	it('concurrent admission and workers preserve one immutable key and one execution',async () => {
		let calls=0;const run=async()=>{calls++;await new Promise(r=>setTimeout(r,30));return {jobs:[1]};};
		const first=queue(run),second=queue(run);
		const accepted=await Promise.all(Array.from({length:8},()=>first.accept('owner','same-key',{b:2,a:1})));
		assert.equal(new Set(accepted.map(r=>r.operationId)).size,1);
		await assert.rejects(first.accept('owner','same-key',{a:2,b:2}),{code:'async_request_conflict'});
		await Promise.all([first.process(),second.process()]);assert.equal(calls,1);
		assert.equal((await first.accept('owner','same-key',{a:1,b:2})).status,'completed');assert.equal(calls,1);
	});
	it('keeps accepted work queued while the shared storage worker is busy',async () => {
		let available=false,calls=0;
		const worker=queue(async()=>{calls++;return {jobs:[1]};},{runWorker:async run=>available?run():{processed:0}});
		const accepted=await worker.accept('owner','busy-storage',{a:1});await worker.process();
		assert.equal((await worker.get('owner',accepted.operationId)).status,'queued');assert.equal(calls,0);
		available=true;await worker.process();assert.equal((await worker.get('owner',accepted.operationId)).status,'completed');assert.equal(calls,1);
	});
	it('keeps status and retries isolated by owner and operation kind',async () => {
		const first=queue(async()=>({}));const accepted=await first.accept('alice','same-key',{a:1});
		await assert.rejects(first.get('bob',accepted.operationId),{code:'async_request_not_found'});
		const other=await first.accept('bob','same-key',{a:2});assert.notEqual(other.operationId,accepted.operationId);
		await assert.rejects(first.get('alice','bad-id'),{code:'async_request_not_found'});
	});
	it('does not steal an active lease; reclaims interrupted work using its original input',async () => {
		let calls=0;const first=queue(async(_owner,input)=>{calls++;return input;});
		const accepted=await first.accept('owner','original-key',{original:'frozen'});
		await model.update({status:'processing',leaseToken:randomUUID(),leaseUntil:new Date(clock.getTime()+360000)},{where:{id:accepted.operationId}});
		await first.process();assert.equal(calls,0);
		clock=new Date(clock.getTime()+360001);const second=queue(async(_owner,input)=>{calls++;return input;});await second.process();
		assert.equal(calls,1);assert.deepEqual((await second.get('owner',accepted.operationId)).result,{original:'frozen'});
	});
	it('status reads never replay failures or expose internal error messages; explicit same-key retry resumes',async () => {
		let failing=true,calls=0;const first=queue(async()=>{calls++;if(failing){throw Error('private upstream credentials');}return {jobs:[4]};});
		const accepted=await first.accept('owner','original-key',{a:1});await first.process();
		const failed=await first.get('owner',accepted.operationId);assert.equal(failed.status,'failed');assert.equal(failed.errorCode,'async_request_failed');assert(!JSON.stringify(failed).includes('private'));
		await first.get('owner',accepted.operationId);assert.equal(calls,1);failing=false;
		assert.equal((await first.accept('owner','original-key',{a:1})).operationId,accepted.operationId);await first.process();assert.equal(calls,2);
	});
	it('rechecks accepting key ownership, revocation and expiry before execution',async () => {
		for(const key of [null,{userId:2},{userId:1,isDisabled:true},{userId:1,expiredOn:new Date(0)}]){
			let called=false;
			await assert.rejects(runAsAcceptingKey({ms:{database:{getApiKey:async()=>key}}},'1',{apiKeyId:2},[],null,()=>{called=true;}),{code:'async_request_credentials_revoked'});
			assert.equal(called,false);
		}
	});
});
