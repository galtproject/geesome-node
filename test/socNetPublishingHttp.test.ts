import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import sharp from 'sharp';
import {publicationIntentDigest} from '../app/modules/socNetPublishing/producer.js';

// Actual node/SQL/Kubo with fixed provider transport mocked before module startup.
describe('server publication canonical HTTP integration', function () {
	this.timeout(90000);
	let app, user, producer, management, originalFetch, sends, outcome;
	const port = Number(process.env.PORT || 7789);
	const base = `http://127.0.0.1:${port}/v1`;
	const botToken = '12345:abcdefghijklmnopqrstuv';
	const call = (suffix, body?, key?) => originalFetch(`${base}/user/social-publications${suffix}`, {method: body === undefined ? 'GET' : 'POST', headers: {Authorization: `Bearer ${key || producer}`, 'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(['/claim', '/destination-claim'].includes(suffix) ? {intentVersion: 6, ...body} : body)});
	async function ok(response) {const json = await response.json();assert.equal(response.status, 200, JSON.stringify(json));return json;}
	before(async () => {
		sends = [];outcome = 'posted';originalFetch = globalThis.fetch;
		globalThis.fetch = async (url: any, options: any = {}) => {
			const parsed = new URL(String(url));
			if (parsed.hostname !== 'api.telegram.org') {
				return originalFetch(url, options);
			}
			const method = parsed.pathname.split('/').at(-1);
			const body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
			let result;
			if (method === 'getMe') {result = {id: 12345, is_bot: true, username: 'fixture_bot'};}
			else if (method === 'getChat') {result = {id: Number(body.chat_id), type: 'channel', username: 'fixture_channel'};}
			else if (method === 'getChatMember') {result = {user: {id: 12345}, status: 'administrator', can_post_messages: true};}
			else if (method === 'sendPhoto' || method === 'sendMessage') {
				const data = options.body instanceof FormData ? {chatId: options.body.get('chat_id'), text: options.body.get('caption'), spoiler: options.body.get('has_spoiler'), bytes: (options.body.get('photo') as Blob).size} : {chatId: body.chat_id, text: body.text};
				sends.push(data);
				if (outcome === 'unknown') {throw Error('fixture provider lost reply');}
				result = {message_id: 123, chat: {id: Number(data.chatId), username: 'fixture_channel'}};
			} else {throw Error(`Unexpected fixture provider method ${method}`);}
			return new Response(JSON.stringify({ok: true, result}), {status: 200, headers: {'content-type': 'application/json'}});
		};
		const config = (await import('../app/config.js')).default;
		config.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		app = await (await import('../app/index.js')).default({storageConfig: config.storageConfig, port, socNetPublishingConfig: {serverWorker: true, intervalMs: 3600000}, apiConfig: {publicUrl: `http://127.0.0.1:${port}`}});
		await app.flushDatabase();user = (await app.setup({email: 'server-outbox@example.com', name: 'server-outbox', password: 'test-password'})).user;
		producer = await app.generateUserApiKey(user.id, {title: 'Girls producer', scopes: ['publishing:local', 'assets:write']});
		management = await app.generateUserApiKey(user.id, {title: 'server management', scopes: ['publishing:manage']});
	});
	after(async () => {await app?.stop();globalThis.fetch = originalFetch;});
	async function setup(extra = {}) {
		const source = await ok(await call('/sources', { requestKey: randomUUID(), title: 'Private server source'}));
		const setupInput = {contentPolicy: 'nsfw',  requestKey: randomUUID(), network: 'telegram', label: 'Server fixture Telegram', sourceGroupId: source.group.id, account: {botToken}, target: {chatId: '-100456'}, enabled: true, ...extra};
		assert.equal((await call('/server-destinations', setupInput)).status, 403);
		const configured = await ok(await call('/server-destinations', setupInput, management));
		assert.equal((await ok(await call('/server-destinations', setupInput, management))).destination.id, configured.destination.id);
		assert(!JSON.stringify(configured).includes(botToken));
		return {group: source.group, destination: configured.destination, setupInput};
	}
	it('freezes async destination routing across failures and explicit retries', async () => {
		const {group,destination}=await setup();
		const input={async:true,contentType:'nsfw',requestKey:randomUUID(),groupId:group.id,text:'Frozen async route',imageStorageIds:[],scheduledAt:'2099-01-01T00:00:00Z',destinations:[{destinationId:destination.id,network:'telegram',target:{}}]};
		const module=app.ms.socNetPublishing;
		const compose=module.compose.bind(module);
		let release;const gate=new Promise<void>(resolve=>{release=resolve;});
		module.compose=async (userId,input,bindings)=>{await gate;return compose(userId,input,bindings);};
		try {
			const response=await call('/compose',input);assert.equal(response.status,202);const accepted=await response.json();
			const destinationModel=app.ms.database.sequelize.model('publicationDestination');
			await destinationModel.update({target:{chatId:'-100999'}},{where:{id:destination.id}});release();
			const wait=async expected=>{for(let i=0;i<100;i++){const status=await ok(await call(`/operations/${accepted.operationId}`));if(status.status===expected) {
					return status;
				}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Async state did not become '+expected);};
			assert.equal((await wait('failed')).errorCode,'local_publication_destination_changed');
			assert.equal(await app.ms.database.sequelize.model('publicationJob').count({where:{composeKey:input.requestKey}}),0);
			assert.equal((await call('/compose',input)).status,202);
			assert.equal((await wait('failed')).errorCode,'local_publication_destination_changed');
			await destinationModel.update({target:destination.target},{where:{id:destination.id}});
			const retried=await call('/compose',input);assert.equal((await retried.json()).operationId,accepted.operationId);
			assert.equal((await wait('completed')).result.jobs[0].target.chatId,destination.target.chatId);
		} finally {
			release();module.compose=compose;
		}
	});
	it('accepts durable asynchronous compose and returns the same completed jobs on retry', async () => {
		const {group,destination}=await setup();
		const input={async:true,contentType:'nsfw',requestKey:randomUUID(),groupId:group.id,text:'Async preparation',imageStorageIds:[],scheduledAt:'2099-01-01T00:00:00Z',destinations:[{destinationId:destination.id,network:'telegram',target:{}}]};
		const response=await call('/compose',input);assert.equal(response.status,202);const accepted=await response.json();assert.equal(accepted.status,'queued');
		const conflict=await call('/compose',{...input,text:'Different'});assert.equal(conflict.status,409);
		let status=accepted;
		for(let i=0;i<100&&status.status!=='completed';i++){
			await new Promise(resolve=>setTimeout(resolve,100));
			status=await ok(await call(`/operations/${accepted.operationId}`));
			assert.notEqual(status.status,'failed',JSON.stringify(status));
		}
		assert.equal(status.status,'completed');assert.equal(status.result.jobs.length,1);
		const repeated=await call('/compose',input);assert.equal(repeated.status,202);const replay=await repeated.json();assert.equal(replay.operationId,accepted.operationId);assert.equal(replay.result.jobs[0].id,status.result.jobs[0].id);
	});
	it('rejects unsafe content before source writes and freezes the accepted policy across edits and replay', async () => {
		const {group, destination, setupInput} = await setup({contentPolicy: 'sfw', target: {chatId: '-100456'}});
		assert.equal(destination.contentPolicy, 'sfw');
		assert.equal((await call('/server-destinations', {...setupInput, contentPolicy: undefined}, management)).status, 400);
		assert.equal((await ok(await call('/destinations?limit=100'))).destinations.find(item => item.id === destination.id).contentPolicy, 'sfw');
		const input = {contentType: 'sfw', requestKey: randomUUID(), groupId: group.id, text: 'Explicit safe content', imageStorageIds: [], destinations: [{destinationId: destination.id, network: 'telegram', target: {}}]};
		const before = await app.ms.database.models.Post.count({where: {groupId: group.id}});
		for (const contentType of ['nsfw']) {
			const rejected = await call('/compose', {...input, contentType});
			assert.equal(rejected.status, 409);assert.equal((await rejected.json()).code, 'publication_content_policy_forbidden');
		}
		assert.equal(await app.ms.database.models.Post.count({where: {groupId: group.id}}), before);
		const first = await ok(await call('/compose', input));assert.equal(first.jobs[0].contentPolicy, 'sfw');assert.equal(first.jobs[0].target.chatId, '-100456');
		await ok(await call('/server-destinations', {...setupInput, contentPolicy: 'nsfw'}, management));
		const replay = await ok(await call('/compose', input));assert.equal(replay.jobs[0].id, first.jobs[0].id);assert.equal(replay.jobs[0].contentPolicy, 'sfw');
		await ok(await call(`/${first.jobs[0].id}/cancel`, {}));
	});
	it('executes private prepared-image server job while preserving client and legacy claim isolation', async () => {
		const {group, destination} = await setup();
		const image = await sharp({create: {width: 128, height: 128, channels: 3, background: '#667788'}}).png().toBuffer();
		const form = new FormData();form.append('file', new Blob([image], {type: 'image/png'}), 'fixture.png');
		form.append('expectedSha256', createHash('sha256').update(image).digest('hex'));form.append('previewPolicy', 'standard');
		const uploadedResponse = await originalFetch(`${base}/assets`, {method: 'POST', headers: {Authorization: `Bearer ${producer}`, 'Idempotency-Key': randomUUID()}, body: form});
		assert.equal(uploadedResponse.status, 201);const uploaded = await uploadedResponse.json();
		const target = {chatId: '-100456'};
		const payload = {text: 'Frozen private server content', attachments: [{storageId: uploaded.storageId, mimeType: 'image/png'}]};
		const digest = publicationIntentDigest({contentType: 'nsfw', destinationId: destination.id, accountIdentity: destination.accountIdentity, network: 'telegram', target: target, executionMode: 'server'}, payload);
		const input = {contentType: 'nsfw', requestKey: randomUUID(), groupId: group.id, text: payload.text, imageStorageIds: [uploaded.storageId], mediaPolicy: 'social-images-v1', destinations: [{destinationId: destination.id, network: 'telegram', target}], producer: {type: 'microwave-girls', postId: 1, digest}};
		assert.equal((await call('/compose', {...input, producer: {...input.producer, digest: 'wrong'}})).status, 409);
		const composed = await ok(await call('/compose', input));const job = composed.jobs[0];
		assert.equal(job.executionMode, 'server');assert.equal(job.accountIdentity, 'bot:12345');assert.equal(job.serverAccountId, undefined);assert.equal(job.producer.digest, digest);
		assert.equal((await app.ms.group.getGroup(group.id)).isPublic, false);
		assert.equal((await ok(await call('/claim', {accounts: [{network: 'telegram', localAccountId: 'fake'}]}))).job, null);
		assert.equal((await ok(await call('/destination-claim', {destinationIds: [destination.id]}))).job, null);
		assert.equal((await call(`/${job.id}/result`, {claimToken: 'fake', status: 'posted', remoteId: '123'})).status, 403);
		await app.ms.socNetPublishing.processServerQueue();assert.equal(sends.length, 1);assert.equal(sends[0].chatId, '-100456');assert.equal(sends[0].spoiler, null);assert(sends[0].bytes > 0);
		const projected = (await ok(await call(`?ids=${job.id}`))).jobs[0];assert.equal(projected.status, 'posted');assert.equal(projected.remoteId, '123');
		assert.equal((await ok(await call('/compose', input))).jobs[0].id, job.id);await app.ms.socNetPublishing.processServerQueue();assert.equal(sends.length, 1);
		const alias = await originalFetch(`${base}/user/local-publications?ids=${job.id}`, {headers: {Authorization: `Bearer ${producer}`}});
		assert.equal((await alias.json()).jobs[0].id, job.id);
	});
	it('leaves unknown publish outcomes for manual owner resolution without another send', async () => {
		const {group, destination} = await setup();outcome = 'unknown';
		const input = {contentType: 'nsfw', requestKey: randomUUID(), groupId: group.id, text: 'Unknown result', imageStorageIds: [], destinations: [{destinationId: destination.id, network: 'telegram', target: {}}]};
		const job = (await ok(await call('/compose', input))).jobs[0];await app.ms.socNetPublishing.processServerQueue();
		const first = (await ok(await call(`?ids=${job.id}`))).jobs[0];assert.equal(first.status, 'needs_review');const count = sends.length;
		await app.ms.socNetPublishing.processServerQueue();assert.equal(sends.length, count);
		assert.equal((await call(`/${job.id}/server-result`, {claimToken: first.claimToken, status: 'failed'})).status, 403);
		const settled = await ok(await call(`/${job.id}/server-result`, {claimToken: first.claimToken, status: 'failed', error: 'Operator checked provider'}, management));assert.equal(settled.job.status, 'failed');
	});
});
