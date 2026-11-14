import assert from 'node:assert/strict';
import {Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import defineModels from '../app/modules/asyncOperation/models.js';
import {getModule} from '../app/modules/asyncOperation/index.js';
import {createQueuedRequests, runAsAcceptingKey} from '../app/modules/asyncOperation/requests.js';
import {stopStorageFence, withStorageWorker} from '../app/storageLifecycle.js';

describe('idempotent requests on the existing asyncOperation queue',function(){
	this.timeout(30000);
	let db,models,app,apps;
	const kind='image-composition';
	before(async()=>{db=new Sequelize({...config as any,logging:false});models=await defineModels(db);});
	const instance=()=>{const app:any={ms:{database:{sequelize:db}},checkUserCan:async()=>{}};app.ms.asyncOperation=getModule(app,models);apps.push(app);return app;};
	beforeEach(async()=>{apps=[];app=instance();await models.UserOperationQueue.destroy({where:{module:kind}});await models.UserAsyncOperation.destroy({where:{module:kind}});});
	afterEach(async()=>{for(const app of apps){await app.ms.asyncOperation.stop();await stopStorageFence(app);}await models.UserOperationQueue.destroy({where:{module:kind}});await models.UserAsyncOperation.destroy({where:{module:kind}});});
	after(async()=>{await db.close();});
	const queue=(run,target=app)=>createQueuedRequests(target,kind,run,{autoStart:false});
	it('persists acceptance in the native queue and uses native ids, output and completion',async()=>{
		let calls=0;const first=queue(async()=>{calls++;return {jobs:[1]};});
		const accepted=await first.accept('1','key-1',{images:['one']});assert.equal(accepted.status,'queued');assert(Number.isSafeInteger(accepted.operationId));assert.equal(calls,0);
		const second=queue(async()=>{calls++;return {jobs:[1]};},instance());await second.process();
		const result=await second.get('1',accepted.operationId);assert.equal(result.status,'completed');assert.deepEqual(result.result,{jobs:[1]});assert.equal(calls,1);
		const native=await models.UserOperationQueue.findByPk(accepted.operationId,{include:[{association:'asyncOperation'}]});assert.equal(native.isWaiting,false);assert.equal(native.asyncOperationId,result.asyncOperationId);assert(native.asyncOperation.finishedAt);
	});
	it('serializes admission and delegates concurrent workers to native processing and the storage gate',async()=>{
		let calls=0;const run=async()=>{calls++;await new Promise(r=>setTimeout(r,30));return {jobs:[1]};};
		const first=queue(run),second=queue(run,instance());const accepted=await Promise.all(Array.from({length:8},()=>first.accept('1','same-key',{b:2,a:1})));
		assert.equal(new Set(accepted.map(r=>r.operationId)).size,1);await assert.rejects(first.accept('1','same-key',{a:2,b:2}),{code:'async_request_conflict'});
		await Promise.all([first.process(),second.process()]);assert.equal(calls,1);assert.equal((await first.accept('1','same-key',{a:1,b:2})).status,'completed');assert.equal(calls,1);
	});
	it('keeps work waiting when the existing storage worker is busy',async()=>{
		let calls=0;const worker=queue(async()=>{calls++;return {jobs:[1]};});const accepted=await worker.accept('1','busy',{a:1});
		await withStorageWorker(app,()=>worker.process());assert.equal(calls,0);assert.equal((await worker.get('1',accepted.operationId)).status,'queued');
		await worker.process();assert.equal((await worker.get('1',accepted.operationId)).status,'completed');
	});
	it('keeps owner status private and rejects invalid queue identifiers',async()=>{
		const worker=queue(async()=>({}));const accepted=await worker.accept('1','private',{a:1});
		await assert.rejects(worker.get('2',accepted.operationId),{code:'async_request_not_found'});await assert.rejects(worker.get('1','invalid'),{code:'async_request_not_found'});
	});
	it('resumes the original native async operation after the existing restart recovery',async()=>{
		const worker=queue(async()=>({jobs:[1]}));const accepted=await worker.accept('1','restart',{original:'frozen'});
		const operation=await app.ms.asyncOperation.addAsyncOperation(1,{name:kind,module:kind,channel:'restart'});
		await models.UserOperationQueue.update({asyncOperationId:operation.id},{where:{id:accepted.operationId}});
		const restarted=instance();await restarted.ms.asyncOperation.closeAllAsyncOperation();let seen;
		await queue(async(_owner,input)=>{seen=input;return {jobs:[1]};},restarted).process();
		const completed=await worker.get('1',accepted.operationId);assert.equal(completed.asyncOperationId,operation.id);assert.deepEqual(seen,{original:'frozen'});assert.equal(completed.status,'completed');
	});
	it('status never replays failed work; explicit retry reuses the same native receipt and frozen context',async()=>{
		let failing=true,calls=0,context;const worker=queue(async(_owner,_input,value)=>{calls++;context=value;if(failing){throw Error('private upstream credentials');}return {jobs:[4]};});
		const accepted=await worker.accept('1','retry',{a:1},{route:'original'});await worker.process();const failed=await worker.get('1',accepted.operationId);assert.equal(failed.status,'failed');assert.equal(failed.errorCode,'async_request_failed');assert(!JSON.stringify(failed).includes('private'));
		await worker.get('1',accepted.operationId);assert.equal(calls,1);failing=false;
		assert.equal((await worker.accept('1','retry',{a:1},{route:'changed'})).operationId,accepted.operationId);await worker.process();const completed=await worker.get('1',accepted.operationId);assert.equal(completed.asyncOperationId,failed.asyncOperationId);assert.equal(context.route,'original');assert.equal(calls,2);
	});
	it('defers recoverable preparation through the same native queue instead of creating another operation',async()=>{
		let pending=true;const worker=queue(async()=>{if(pending){throw Object.assign(Error('pending'),{errorCode:'composition_idempotency_conflict',details:{retryable:true}});}return {jobs:[1]};});
		const accepted=await worker.accept('1','pending',{a:1});await worker.process();const waiting=await worker.get('1',accepted.operationId);assert.equal(waiting.status,'queued');pending=false;await worker.process();assert.equal((await worker.get('1',accepted.operationId)).asyncOperationId,waiting.asyncOperationId);
	});
	it('retains completed native receipts so cleanup cannot release an already used request key',async()=>{
		const worker=queue(async()=>({jobs:[1]}));const accepted=await worker.accept('1','retained',{a:1});await worker.process();
		await app.ms.asyncOperation.cleanupFinishedAsyncOperations({cutoff:new Date(Date.now()+86400000)});
		assert.equal((await worker.get('1',accepted.operationId)).status,'completed');assert.equal((await worker.accept('1','retained',{a:1})).operationId,accepted.operationId);
	});
	it('rechecks the accepting key before executing queued work',async()=>{
		for(const key of [null,{userId:2},{userId:1,isDisabled:true},{userId:1,expiredOn:new Date(0)}]){
			await assert.rejects(runAsAcceptingKey({ms:{database:{getApiKey:async()=>key}}},'1',{apiKeyId:2},[],null,()=>{throw Error('must not execute');}),{code:'async_request_credentials_revoked'});
		}
	});
});
