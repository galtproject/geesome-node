import assert from 'node:assert/strict';
import {createGuestSelectionCache, isGuestSelectionRequest} from '../app/modules/membership/guestSelectionCache.js';
const selection = (version = 'one') => ({origin:'https://creator.test',location:`https://creator.test/ipfs/${version}/`});
function fixture() {
	const hooks = new Map<string, Map<string, Function>>();
	return {hooks, model:{
		addHook(event, name, callback) { const group=hooks.get(event) || new Map();group.set(name,callback);hooks.set(event,group); },
		removeHook(event, name) { hooks.get(event)?.delete(name); }
	}, changed(options = {}) { for (const callback of hooks.get('afterSave')?.values() || []) { callback({},options); } }};
}
describe('anonymous snapshot selector cache', () => {
	it('shares concurrent misses, expires without sliding TTL, and bounds entries with LRU eviction', async () => {
		let now=0, loads=0;
		const cache=createGuestSelectionCache([],()=>now,1000,2);
		const load=async()=>{loads++;return selection();};
		await Promise.all(Array.from({length:20},()=>cache.get('home',load)));
		assert.equal(loads,1);
		now=900;await cache.get('home',load);assert.equal(loads,1);
		now=1000;await cache.get('home',load);assert.equal(loads,2);
		await cache.get('post',load);await cache.get('home',load);await cache.get('account',load);
		await cache.get('home',load);assert.equal(loads,4);
		await cache.get('post',load);assert.equal(loads,5);
		cache.stop();
	});
	it('expires pending loads so slow old reads cannot hold or refill the shared entry', async () => {
		let now=0, finish: (value: ReturnType<typeof selection>)=>void;
		const cache=createGuestSelectionCache([],()=>now);
		const old=cache.get('home',()=>new Promise(resolve=>{finish=resolve;}));
		await Promise.resolve();now=1000;
		assert.deepEqual(await cache.get('home',async()=>selection('new')),selection('new'));
		finish(selection('old'));await old;
		assert.deepEqual(await cache.get('home',async()=>selection('wrong')),selection('new'));
		cache.stop();
	});
	it('never caches errors and rechecks a failed source on the next request', async () => {
		let calls=0;
		const cache=createGuestSelectionCache([]);
		await assert.rejects(cache.get('home',async()=>{calls++;throw Error('unavailable');}),/unavailable/);
		assert.deepEqual(await cache.get('home',async()=>{calls++;return selection();}),selection());
		assert.equal(calls,2);cache.stop();
	});
	it('invalidates only after commit and fences older in-flight loads and model-hook lifecycles', async () => {
		const f=fixture(),cache=createGuestSelectionCache([f.model]);
		let finish: (value: ReturnType<typeof selection>) => void;
		const pending=cache.get('home',()=>new Promise(resolve=>{finish=resolve;}));
		await Promise.resolve();
		const callbacks: Function[]=[];
		const transaction={afterCommit: callback=>callbacks.push(callback)};
		f.changed({transaction});
		for (const event of ['afterBulkCreate','afterUpsert']) {
			for (const callback of f.hooks.get(event).values()) { callback({}, {transaction}); }
		}
		assert.equal(callbacks.length,1);
		finish(selection('old'));await pending;
		assert.equal((await cache.get('home',async()=>selection('not-committed'))).location,selection('old').location);
		callbacks.forEach(callback=>callback());
		let finishOld: (value: ReturnType<typeof selection>) => void;
		const stale=cache.get('home',()=>new Promise(resolve=>{finishOld=resolve;}));
		await Promise.resolve();f.changed();
		await cache.get('home',async()=>selection('new'));
		finishOld(selection('stale'));await stale;
		assert.equal((await cache.get('home',async()=>selection('wrong'))).location,selection('new').location);
		cache.stop();assert([...f.hooks.values()].every(hooks=>hooks.size===0));
	});
	it('shares only requests without reader-session cookies or Authorization, including malformed credentials', () => {
		for (const headers of [{},{cookie:'analytics=public'},{cookie:'other=x; theme=dark'}]) {
			assert.equal(isGuestSelectionRequest(headers),true);
		}
		for (const headers of [{authorization:'Bearer owner'},{cookie:'__Host-geesome_session=valid'},
			{cookie:'other=1; __Host-geesome_session=forged'},{cookie:'__Host-geesome_session='},
			{cookie:'__Host-geesome_session'},{cookie:'__Host-geesome_session=a; __Host-geesome_session=b'}]) {
			assert.equal(isGuestSelectionRequest(headers),false);
		}
	});
});
