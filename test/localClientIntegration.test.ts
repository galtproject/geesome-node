import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {IGeesomeApp} from '../app/interface.js';
import {PostStatus} from '../app/modules/group/interface.js';

describe('local publication HTTP integration', function () {
	this.timeout(60000);
	let app: IGeesomeApp;
	afterEach(async () => {
		await app?.stop();
	});
	it('projects a real post and authenticates a narrow-scope claim/result flow', async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		const port = Number(process.env.PORT || 7771);
		app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port});
		await app.flushDatabase();
		const user = (await app.setup({email: 'local-publisher@example.com', name: 'local-publisher', password: 'test-password'})).user;
		const group = await app.ms.group.createGroup(user.id, {name: 'local-publish', title: 'Local publish', isPublic: true});
		const text = await app.ms.content.saveData(user.id, 'Actual projected body', 'local-post.txt');
		const post = await app.ms.group.createPost(user.id, {groupId: group.id, status: PostStatus.Published, contents: [{id: text.id}]});
		const token = await app.generateUserApiKey(user.id, {title: 'local worker', scopes: ['publishing:local']});
		const wrongToken = await app.generateUserApiKey(user.id, {title: 'upload only', scopes: ['assets:write']});
		const call = (path, body, key = token) => fetch(`http://127.0.0.1:${port}/v1/user/local-publications${path}`, {
			method: 'POST', headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'}, body: JSON.stringify(body)
		});
		const input = {requestKey: randomUUID(), postId: post.id, network: 'threads', localAccountId: 'threads_1', scheduledAt: '2020-01-01T00:00:00Z'};
		assert.equal((await call('', input, wrongToken)).status, 403);
		const created = await call('', input);
		assert.equal(created.status, 200, await created.clone().text());
		const {job} = await created.json() as any;
		assert.equal(job.payload.text, 'Actual projected body');
		assert.deepEqual(job.payload.attachments, []);
		const claimResponse = await call('/claim', {accounts: [{network: 'threads', localAccountId: 'threads_1'}]});
		assert.equal(claimResponse.status, 200, await claimResponse.clone().text());
		const claimed = (await claimResponse.json() as any).job;
		assert.equal(claimed.id, job.id);
		const result = {claimToken: claimed.claimToken, status: 'posted', remoteId: 'test-remote', remoteUrl: ''};
		assert.equal((await call(`/${job.id}/result`, result)).status, 200);
		assert.equal((await call(`/${job.id}/result`, result)).status, 200);
		const identity = await app.getUserByApiToken(token);
		await app.ms.database.updateApiKey(identity.apiKey.id, {isDisabled: true});
		assert.equal((await call('/claim', {accounts: [{network: 'threads', localAccountId: 'threads_1'}]})).status, 401);
	});
});
