import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {IGeesomeApp} from '../app/interface.js';
import {CorePermissionName} from '../app/modules/database/interface.js';
import {PostStatus} from '../app/modules/group/interface.js';

describe('private local publication outbox integration', function () {
	this.timeout(90000);
	let app: IGeesomeApp, user, token, imageStorageId, groupId;
	const port = Number(process.env.PORT || 7771);
	const base = `http://127.0.0.1:${port}/v1`;
	const destination = {network: 'threads', localAccountId: 'threads_outbox'};
	const composeInput = (extra = {}) => ({requestKey: randomUUID(), text: 'Composed text', imageStorageIds: [imageStorageId], destinations: [destination], ...extra});
	const call = (suffix, body, key = token) => fetch(`${base}/user/local-publications${suffix}`, {
		method: body === undefined ? 'GET' : 'POST', headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)
	});
	async function successful(response) {
		const value = await response.json() as any;
		assert.equal(response.status, 200, JSON.stringify(value));
		return value;
	}
	before(async () => {
		const config = (await import('../app/config.js')).default;
		config.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		app = await (await import('../app/index.js')).default({storageConfig: config.storageConfig, port, apiConfig: {publicUrl: `http://127.0.0.1:${port}`}});
		await app.flushDatabase();
		user = (await app.setup({email: 'outbox@example.com', name: 'outbox', password: 'test-password'})).user;
		token = await app.generateUserApiKey(user.id, {title: 'local composer', scopes: ['publishing:local', 'assets:write']});
	});
	after(async () => {
		await app?.stop();
	});
	it('keeps GET read-only, uploads an owned picture and composes one private source with multiple jobs', async () => {
		assert.deepEqual(await successful(await call('/outbox')), {ownerId: user.id, group: null, drafts: []});
		const image = await sharp({create: {width: 600, height: 400, channels: 3, background: '#998877'}}).jpeg().toBuffer();
		const uploadKey = randomUUID();
		async function upload() {
			const data = new FormData();
			data.append('file', new Blob([image], {type: 'image/jpeg'}), 'outbox-picture.jpg');
			data.append('expectedSha256', createHash('sha256').update(image).digest('hex'));
			data.append('previewPolicy', 'standard');
			return fetch(`${base}/assets`, {method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Idempotency-Key': uploadKey}, body: data});
		}
		const uploadResponse = await upload();
		const uploaded = await uploadResponse.json() as any;
		assert.equal(uploadResponse.status, 201, JSON.stringify(uploaded));
		imageStorageId = uploaded.storageId;
		assert.equal((await (await upload()).json() as any).storageId, imageStorageId);
		const input = composeInput({destinations: [destination, {network: 'reddit', localAccountId: 'reddit_cookie', target: {subreddit: 'test', title: 'Composed text', kind: 'image'}}]});
		const results = await Promise.all(Array.from({length: 3}, async () => successful(await call('/compose', input))));
		const result = results[0];
		assert.equal(new Set(results.map(value => value.postId)).size, 1);
		assert.equal(result.jobs.length, 2);
		const legacyNormalized = {requestKey: input.requestKey, text: input.text, imageStorageIds: input.imageStorageIds,
			destinations: input.destinations.map(item => ({network: item.network, localAccountId: item.localAccountId, target: 'target' in item ? item.target : {}})), scheduledAt: null, postId: null};
		const stored = await app.ms.database.sequelize.models.publicationJob.findByPk(result.jobs[0].id);
		assert.equal(stored.get('composeHash'), createHash('sha256').update(JSON.stringify(legacyNormalized)).digest('hex'));
		assert.equal(result.jobs[0].producer, null);
		assert.deepEqual(results.map(value => value.jobs.map(job => job.id)), [result.jobs.map(job => job.id), result.jobs.map(job => job.id), result.jobs.map(job => job.id)]);
		groupId = result.group.id;
		const group = await app.ms.group.getGroup(groupId);
		assert.equal(group.isPublic, false);
		assert.equal(group.isOpen, false);
		assert.equal(group.isEncrypted, false);
		const post = await app.ms.group.getPost(user.id, result.postId);
		assert.equal(post.groupId, groupId);
		assert.equal(post.manifestStorageId, null);
		assert.equal(await app.ms.database.models.Post.count({where: {groupId}}), 1);
		assert.equal(await app.ms.database.models.Group.count({where: {name: result.group.name}}), 1);
		assert.equal(result.jobs[0].payload.attachments[0].storageId, imageStorageId);
		assert(result.jobs[0].payload.attachments[0].size > 0);
		assert.match(result.jobs[0].payload.attachments[0].url, /^http:\/\/127\.0\.0\.1:/);
		assert(new Date(result.jobs[0].scheduledAt).getTime() <= Date.now());
		const replacement = await app.ms.content.saveData(user.id, 'Edited after enqueue', 'edited.txt');
		await app.ms.group.updatePost(user.id, post.id, {contents: [{id: replacement.id}]});
		const replayed = await successful(await call('/compose', input));
		assert.equal(replayed.postId, result.postId);
		assert.equal(replayed.jobs[0].scheduledAt, result.jobs[0].scheduledAt);
		assert.equal(replayed.jobs[0].payload.text, 'Composed text');
		assert.equal((await call('/compose', {...input, text: 'Conflict'})).status, 409);
		for (const account of input.destinations) {
			const claimed = (await successful(await call('/claim', {accounts: [{network: account.network, localAccountId: account.localAccountId}]}))).job;
			assert.equal(claimed.postId, post.id);
			await successful(await call(`/${claimed.id}/result`, {claimToken: claimed.claimToken, status: 'posted', remoteId: 'test-confirmed'}));
		}
		assert.deepEqual((await successful(await call('/outbox'))).drafts, []);
	});
	it('freezes producer identity and digest on owned compose replay and bounded HTTP lookup', async () => {
		const input = composeInput({producer: {type: 'microwave-girls', postId: 123}, destinations: [{network: 'twitter', localAccountId: 'twitter_local', target: {sensitive: false}}]});
		const result = await successful(await call('/compose', input));
		const job = result.jobs[0];
		const expected = createHash('sha256').update(JSON.stringify({network: 'twitter', localAccountId: 'twitter_local', text: input.text,
			attachments: [{storageId: imageStorageId, mimeType: 'image/jpeg'}], target: {sensitive: false}})).digest('hex');
		assert.deepEqual(job.producer, {type: 'microwave-girls', postId: 123, digest: expected});
		assert.equal((await successful(await call('/compose', input))).jobs[0].id, job.id);
		assert.equal((await call('/compose', {...input, producer: {...input.producer, postId: 124}})).status, 409);
		assert.equal((await call('/compose', composeInput({producer: {...input.producer, cookie: 'secret'}}))).status, 400);
		assert.equal((await call('/compose', composeInput({producer: input.producer, destinations: [destination, {network: 'twitter', localAccountId: 'other'}]}))).status, 400);
		const found = await successful(await call(`?ids=${job.id}`));
		assert.equal(found.jobs.length, 1);
		assert.deepEqual(found.jobs[0].producer, job.producer);
		assert.equal((await successful(await call(`?composeKey=${input.requestKey}`))).jobs[0].id, job.id);
		assert.equal((await successful(await call('/outbox'))).ownerId, user.id);
		const claimed = await successful(await call('/claim', {jobId: job.id, accounts: [{network: 'twitter', localAccountId: 'twitter_local'}]}));
		assert.deepEqual(claimed.job.producer, job.producer);
		const reported = await successful(await call(`/${job.id}/result`, {claimToken: claimed.job.claimToken, status: 'posted', remoteId: '12345', remoteUrl: 'https://x.com/local/status/12345'}));
		assert.equal(reported.job.status, 'posted');
	});
	it('composes and reports Bluesky, Discord and Telegram with narrow scopes and frozen metadata', async () => {
		const cases = [
			{network: 'bluesky', target: {sensitive: false}, remoteId: 'at://did:plc:example/app.bsky.feed.post/record', remoteUrl: 'https://bsky.app/profile/example.bsky.social/post/record'},
			{network: 'discord', target: {channelId: '123456789012345678', guildId: '234567890123456789', sensitive: true}, remoteId: '345678901234567890', remoteUrl: 'https://discord.com/channels/234567890123456789/123456789012345678/345678901234567890'},
			{network: 'telegram', target: {chatId: '-1001234567890', sensitive: true}, remoteId: '123', remoteUrl: 'https://t.me/c/1234567890/123'},
		];
		for (const [index, value] of cases.entries()) {
			const localAccountId = `${value.network}_local`;
			const input = composeInput({producer: {type: 'microwave-girls', postId: 200 + index}, destinations: [{network: value.network, localAccountId, target: value.target}]});
			const result = await successful(await call('/compose', input));
			const job = result.jobs[0];
			assert.deepEqual(job.target, value.target);
			assert.equal((await successful(await call('/compose', input))).jobs[0].id, job.id);
			const claimed = await successful(await call('/claim', {jobId: job.id, accounts: [{network: value.network, localAccountId}]}));
			assert.deepEqual(claimed.job.producer, job.producer);
			const reported = await successful(await call(`/${job.id}/result`, {claimToken: claimed.job.claimToken, status: 'posted', remoteId: value.remoteId, remoteUrl: value.remoteUrl}));
			assert.equal(reported.job.remoteId, value.remoteId);
		}
	});
	it('lists direct outbox posts as unassigned drafts and activates one explicitly', async () => {
		const text = await app.ms.content.saveData(user.id, 'Direct draft', 'draft.txt');
		const content = await app.ms.database.getContentByStorageAndUserId(imageStorageId, user.id);
		const source = await app.ms.group.createPost(user.id, {groupId, status: PostStatus.Published, contents: [{id: text.id}, {id: content.id}]});
		const drafts = (await successful(await call('/outbox'))).drafts;
		const draft = drafts.find(item => item.postId === source.id);
		assert.equal(draft.text, 'Direct draft');
		assert.equal(draft.scheduledAt, undefined);
		assert.equal(draft.network, undefined);
		assert.equal(draft.attachments[0].storageId, imageStorageId);
		assert.equal((await successful(await call('/claim', {accounts: [destination]}))).job, null);
		assert.equal((await call('/compose', composeInput({postId: source.id, text: 'Unsaved edit'}))).status, 409);
		const activation = composeInput({postId: source.id, text: draft.text, scheduledAt: '2099-01-01T00:00:00Z'});
		const scheduled = await successful(await call('/compose', activation));
		assert.equal(scheduled.postId, source.id);
		assert.equal(scheduled.jobs.length, 1);
		assert.equal((await successful(await call('/claim', {accounts: [destination]}))).job, null);
		await successful(await call(`/${scheduled.jobs[0].id}/cancel`, {}));
		assert.equal((await successful(await call('/outbox'))).drafts.some(item => item.postId === source.id), false);
		assert.equal((await call('/compose', {...activation, requestKey: randomUUID()})).status, 409);
	});
	it('activates a draft once when different requests race and rolls back a failed new composition', async () => {
		const text = await app.ms.content.saveData(user.id, 'Concurrent draft', 'concurrent.txt');
		const source = await app.ms.group.createPost(user.id, {groupId, status: PostStatus.Published, contents: [{id: text.id}]});
		const inputs = [composeInput({postId: source.id, text: 'Concurrent draft', imageStorageIds: []}), composeInput({postId: source.id, text: 'Concurrent draft', imageStorageIds: []})];
		const responses = await Promise.all(inputs.map(input => call('/compose', input)));
		assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
		const jobs = app.ms.database.sequelize.models.publicationJob;
		assert.equal(await jobs.count({where: {postId: source.id}}), 1);
		const before = await app.ms.database.models.Post.count({where: {groupId}});
		const original = jobs.bulkCreate;
		const input = composeInput({text: 'Atomic rollback', imageStorageIds: []});
		try {
			jobs.bulkCreate = async () => {throw new Error('injected_job_failure');};
			assert.equal((await call('/compose', input)).status, 500);
		} finally {
			jobs.bulkCreate = original;
		}
		assert.equal(await app.ms.database.models.Post.count({where: {groupId}}), before);
		assert.equal(await jobs.count({where: {composeKey: input.requestKey}}), 0);
		assert.equal((await successful(await call('/compose', input))).jobs.length, 1);
	});
	it('keeps supported drafts usable when another source has unsupported content', async () => {
		const text = await app.ms.content.saveData(user.id, 'Usable direct draft', 'usable.txt');
		const good = await app.ms.group.createPost(user.id, {groupId, status: PostStatus.Published, contents: [{id: text.id}]});
		const pdf = await app.ms.content.saveData(user.id, Buffer.from('%PDF-1.4 unsupported draft'), 'unsupported.pdf', {mimeType: 'application/pdf', driver: {raw: true}});
		const unsupported = await app.ms.group.createPost(user.id, {groupId, status: PostStatus.Published, contents: [{id: pdf.id}]});
		const sources = (await successful(await call('/outbox'))).drafts;
		assert.equal(sources.find(item => item.postId === good.id).text, 'Usable direct draft');
		assert.equal(sources.find(item => item.postId === unsupported.id).unavailable, true);
		assert.equal(await app.ms.database.sequelize.models.publicationJob.count({where: {postId: unsupported.id}}), 0);
	});
	it('recovers an owned orphan native account and rejects a foreign outbox namespace', async () => {
		const recoveredOwner = await app.registerUser({email: 'recover-outbox@example.com', name: 'recover-outbox', permissions: [CorePermissionName.UserAll]});
		const recoveryName = `local-publications-${recoveredOwner.id}`;
		await app.ms.accountStorage.createAccount(recoveryName, recoveredOwner.id);
		const recoveryToken = await app.generateUserApiKey(recoveredOwner.id, {scopes: ['publishing:local', 'assets:write']});
		const recovered = await successful(await call('/compose', composeInput({text: 'Recovered account', imageStorageIds: []}), recoveryToken));
		assert.equal(recovered.group.name, recoveryName);
		assert.equal(await app.ms.database.sequelize.models.account.count({where: {name: recoveryName, isRemote: false}}), 1);
		const victim = await app.registerUser({email: 'victim-outbox@example.com', name: 'victim-outbox', permissions: [CorePermissionName.UserAll]});
		await app.ms.group.createGroup(user.id, {name: `local-publications-${victim.id}`, title: 'Foreign collision', type: 'channel', isPublic: false, isOpen: false, isEncrypted: false, isCollateral: false,
			propertiesJson: JSON.stringify({localPublishingOutbox: 'local-publications-v1'})});
		const victimToken = await app.generateUserApiKey(victim.id, {scopes: ['publishing:local', 'assets:write']});
		assert.equal((await call('/compose', composeInput({text: 'Must not adopt foreign group', imageStorageIds: []}), victimToken)).status, 409);
	});
	it('rejects foreign assets, unmarked private sources and missing upload scope', async () => {
		const other = await app.registerUser({email: 'other-outbox@example.com', name: 'other-outbox', permissions: [CorePermissionName.UserAll]});
		const otherToken = await app.generateUserApiKey(other.id, {scopes: ['publishing:local', 'assets:write']});
		assert.equal((await call('/compose', composeInput(), otherToken)).status, 403);
		const privateGroup = await app.ms.group.createGroup(user.id, {name: 'not-an-outbox', title: 'Ordinary private', isPublic: false, isOpen: false});
		const text = await app.ms.content.saveData(user.id, 'Private unrelated', 'private.txt');
		const post = await app.ms.group.createPost(user.id, {groupId: privateGroup.id, status: PostStatus.Published, contents: [{id: text.id}]});
		assert.equal((await call('', {requestKey: randomUUID(), postId: post.id, ...destination, scheduledAt: '2020-01-01T00:00:00Z'})).status, 403);
		const narrow = await app.generateUserApiKey(user.id, {scopes: ['publishing:local']});
		assert.equal((await call('/compose', composeInput({imageStorageIds: []}), narrow)).status, 403);
	});
});
