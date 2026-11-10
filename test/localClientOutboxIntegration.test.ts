import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {IGeesomeApp} from '../app/interface.js';
import {CorePermissionName} from '../app/modules/database/interface.js';
import {PostStatus} from '../app/modules/group/interface.js';
import {preparedMediaDigest, imageLimit} from '../app/modules/localClient/imagePreparation.js';
import {publicationDestinationDigest, publicationDigest} from '../app/modules/localClient/producer.js';

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
		const {capabilities, ...empty} = await successful(await call('/outbox'));
		assert.deepEqual(empty, {ownerId: user.id, group: null, drafts: []});
		assert.equal(capabilities.ownedImageReferences, true);
		assert.equal(capabilities.patreonPublishing, true);
		assert.equal(capabilities.networkQueues, true);
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
	it('rejects foreign assets, nonchannel private sources and missing upload scope', async () => {
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
	it('creates an idempotent source and lists only eligible owned private groups including empty sources', async () => {
		const requestKey = randomUUID();
		const sourceInput = {requestKey, title: 'Girls queue'};
		const created = await Promise.all(Array.from({length: 3}, () => call('/sources', sourceInput).then(successful)));
		const queue = created[0].group;
		assert.equal(new Set(created.map(item => item.group.id)).size, 1);
		assert.equal(queue.lastPostAt, null);
		assert.equal((await call('/sources', {...sourceInput, title: 'Different'})).status, 409);
		assert.equal(await app.ms.database.models.Group.count({where: {name: queue.name}}), 1);
		assert.equal(await app.ms.database.models.Post.count({where: {groupId: queue.id}}), 0);
		const sources = await successful(await call(`/sources?ids=${queue.id}`));
		assert.equal(sources.ownerId, user.id);
		assert.deepEqual(sources.groups.map(group => group.id), [queue.id]);
		assert.equal(sources.groups[0].lastPostAt, null);
		for (const invalid of ['0', '1,1', '1,,2', 'x']) {
			assert.equal((await call(`/sources?ids=${invalid}`)).status, 400);
		}
		const foreign = await app.registerUser({email: 'source-foreign@example.com', name: 'source-foreign', permissions: [CorePermissionName.UserAll]});
		const foreignKey = await app.generateUserApiKey(foreign.id, {scopes: ['publishing:local', 'assets:write']});
		assert.deepEqual((await successful(await call(`/sources?ids=${queue.id}`, undefined, foreignKey))).groups, []);
		assert.equal((await call('/compose', composeInput({groupId: queue.id, imageStorageIds: []}), foreignKey)).status, 403);
		const model = await app.ms.database.models.Group.findByPk(queue.id);
		for (const mutation of [{isPublic: true}, {isEncrypted: true}, {isOpen: true}, {isRemote: true}, {isDeleted: true}, {isCollateral: true}]) {
			await model.update(mutation);
			assert.deepEqual((await successful(await call(`/sources?ids=${queue.id}`))).groups, []);
			await model.update(Object.fromEntries(Object.keys(mutation).map(key => [key, false])));
		}
		const text = await app.ms.content.saveData(user.id, 'Source date', 'source-date.txt', {driver: {raw: true}});
		const post = await app.ms.group.createPost(user.id, {groupId: queue.id, status: PostStatus.Published, contents: [{id: text.id}]});
		const populated = (await successful(await call(`/sources?ids=${queue.id}`))).groups[0];
		assert(populated.lastPostAt);
		const replayed = await successful(await call('/sources', sourceInput));
		assert.equal(replayed.group.id, queue.id);
		assert.equal(replayed.group.lastPostAt, populated.lastPostAt);
		assert.equal(await app.ms.database.models.Post.count({where: {groupId: queue.id}}), 1);
		assert.equal(await app.ms.database.sequelize.models.publicationJob.count({where: {postId: post.id}}), 0);
		await post.update({isDeleted: true});
		assert.equal((await successful(await call('/sources', sourceInput))).group.lastPostAt, null);
		assert.equal((await successful(await call(`/sources?ids=${queue.id}`))).groups[0].lastPostAt, null);
	});
	it('routes network-only jobs once within selected groups and preserves the authored producer digest', async () => {
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Routed source'}));
		const input = composeInput({groupId: group.id, producer: {type: 'microwave-girls', postId: 501}, destinations: [{network: 'discord', target: {sensitive: false}}]});
		const composed = await successful(await call('/compose', input));
		const original = composed.jobs[0];
		assert.equal(original.groupId, group.id);
		assert.equal(original.localAccountId, '');
		assert.deepEqual(original.target, {sensitive: false});
		assert.equal((await call('/compose', {...input, groupId: undefined})).status, 400);
		assert.equal((await successful(await call(`/sources?ids=${group.id}`))).groups[0].lastPostAt !== null, true);
		const accounts = [{network: 'discord', localAccountId: 'discord_local'}];
		const routes = [{groupId: group.id, ...accounts[0], target: {channelId: '100', sfwChannelId: '200', guildId: '300'}}];
		assert.equal((await successful(await call('/claim', {accounts, groupIds: [], routes}))).job, null);
		assert.equal((await successful(await call('/claim', {accounts, groupIds: [groupId], routes}))).job, null);
		assert.equal((await successful(await call('/claim', {accounts, groupIds: [group.id]}))).job, null);
		assert.equal((await successful(await call(`?groupIds=${group.id}`))).jobs[0].id, original.id);
		assert.deepEqual((await successful(await call('?groupIds='))).jobs, []);
		const raced = await Promise.all(Array.from({length: 4}, () => call('/claim', {accounts, groupIds: [group.id], routes}).then(successful)));
		const claimed = raced.map(value => value.job).filter(Boolean);
		assert.equal(claimed.length, 1);
		assert.equal(claimed[0].localAccountId, 'discord_local');
		assert.deepEqual(claimed[0].target, {sensitive: false, channelId: '200', guildId: '300'});
		assert.deepEqual(claimed[0].producer, original.producer);
		const replay = await successful(await call('/compose', input));
		assert.equal(replay.jobs[0].id, original.id);
		assert.equal(replay.jobs[0].localAccountId, 'discord_local');
		assert.deepEqual(replay.jobs[0].producer, original.producer);
		assert.equal((await successful(await call('/claim', {jobId: original.id, accounts, groupIds: [group.id], routes}))).job, null);
	});
	it('preserves authored channels, rejects unsafe routes, and leaves direct group posts as drafts', async () => {
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Draft source'}));
		const text = await app.ms.content.saveData(user.id, 'Direct group draft', 'draft.txt');
		const draft = await app.ms.group.createPost(user.id, {groupId: group.id, status: PostStatus.Published, contents: [{id: text.id}]});
		const accounts = [{network: 'telegram', localAccountId: 'telegram_local'}];
		const routes = [{groupId: group.id, ...accounts[0], target: {chatId: '-100', sfwChatId: '-200'}}];
		assert.equal((await successful(await call('/claim', {accounts, groupIds: [group.id], routes}))).job, null);
		const listed = await successful(await call(`/outbox?groupIds=${group.id}`));
		assert.equal(listed.drafts[0].postId, draft.id);
		assert.equal(listed.drafts[0].groupId, group.id);
		assert.deepEqual((await successful(await call('/outbox?groupIds='))).drafts, []);
		const input = composeInput({groupId: group.id, postId: draft.id, text: 'Direct group draft', imageStorageIds: [], destinations: [{network: 'telegram', target: {chatId: '-300', sensitive: false}}]});
		const assigned = await successful(await call('/compose', input));
		for (const extra of [{target: {chatId: '-100', sensitive: true}}, {target: {chatId: '-100', cookie: 'secret'}}, {localAccountId: 'missing'}]) {
			assert.equal((await call('/claim', {accounts, groupIds: [group.id], routes: [{...routes[0], ...extra}]})).status, 400);
		}
		const claimed = (await successful(await call('/claim', {accounts, groupIds: [group.id], routes}))).job;
		assert.equal(claimed.id, assigned.jobs[0].id);
		assert.deepEqual(claimed.target, {chatId: '-300', sensitive: false});
		assert.deepEqual((await successful(await call(`/outbox?groupIds=${group.id}`))).drafts, []);
	});
	it('fails selected source jobs if their private group becomes public before claim', async () => {
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Revoked source'}));
		const composed = await successful(await call('/compose', composeInput({groupId: group.id, destinations: [{network: 'threads', localAccountId: destination.localAccountId}]})));
		await app.ms.database.models.Group.update({isPublic: true}, {where: {id: group.id}});
		assert.equal((await successful(await call('/claim', {accounts: [destination], groupIds: [group.id]}))).job, null);
		assert.equal((await successful(await call(`?ids=${composed.jobs[0].id}`))).jobs[0].status, 'failed');
	});

	it('treats supplied routes as authoritative for bound jobs and rejects malformed group selections', async () => {
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Bound source'}));
		const composed = await successful(await call('/compose', composeInput({groupId: group.id, imageStorageIds: [], destinations: [destination]})));
		const input = {accounts: [destination, {...destination, localAccountId: 'other'}], groupIds: [group.id]};
		assert.equal((await successful(await call('/claim', {...input, routes: []}))).job, null);
		assert.equal((await successful(await call('/claim', {...input, routes: [{groupId: group.id, network: destination.network, localAccountId: 'other'}]}))).job, null);
		assert.equal((await successful(await call('/claim', {...input, routes: [{groupId, ...destination}]}))).job, null);
		for (const invalid of [[0], [group.id, group.id], '1);DROP TABLE posts', null]) {
			assert.equal((await call('/claim', {...input, groupIds: invalid})).status, 400);
		}
		const claimed = (await successful(await call('/claim', {...input, routes: [{groupId: group.id, ...destination}]}))).job;
		assert.equal(claimed.id, composed.jobs[0].id);
		assert.equal(claimed.groupId, group.id);
		assert.equal(claimed.localAccountId, destination.localAccountId);
	});

	async function uploadPreparationImage(bytes, mimeType, key = token) {
		const form = new FormData();
		form.append('file', new Blob([bytes], {type: mimeType}), `original.${mimeType.split('/')[1]}`);
		form.append('expectedSha256', createHash('sha256').update(bytes).digest('hex'));
		form.append('previewPolicy', 'none');
		const response = await fetch(`${base}/assets`, {method: 'POST', headers: {Authorization: `Bearer ${key}`, 'Idempotency-Key': randomUUID()}, body: form});
		const result = await response.json() as any;
		assert.equal(response.status, 201, JSON.stringify(result));
		return result;
	}
	it('prepares immutable JPEG jobs before acceptance and keeps originals in the private source post', async () => {
		const bytes = await sharp({create: {width: 640, height: 480, channels: 4, background: {r: 10, g: 80, b: 150, alpha: .5}}}).png().toBuffer();
		const uploaded = await uploadPreparationImage(bytes, 'image/png');
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Prepared media source'}));
		const input = composeInput({groupId: group.id, mediaPolicy: 'social-images-v1', imageStorageIds: [uploaded.storageId],
			destinations: [{network: 'bluesky', target: {sensitive: false}}, {network: 'twitter'}, {network: 'threads'}, {network: 'discord', target: {sensitive: false}}]});
		const composed = await successful(await call('/compose', input));
		assert.equal(composed.jobs.length, 4);
		const post = await app.ms.group.getPost(user.id, composed.postId);
		assert.equal(post.groupId, group.id);
		assert.equal(post.group.isPublic, false);
		assert.deepEqual(post.contents.filter(content => content.mimeType?.startsWith('image/')).map(content => content.storageId), [uploaded.storageId]);
		for (const job of composed.jobs) {
			const prepared = job.payload.attachments[0];
			assert.equal(prepared.mimeType, 'image/jpeg');
			assert.notEqual(prepared.storageId, uploaded.storageId);
			const chunks = [];
			for await (const chunk of await app.ms.storage.getFileStream(prepared.storageId)) {
				chunks.push(Buffer.from(chunk));
			}
			const actual = Buffer.concat(chunks);
			assert.equal(actual.length, prepared.size);
			assert(actual.length <= imageLimit(job.network));
			assert.equal((await sharp(actual).metadata()).format, 'jpeg');
			assert.equal(job.payload.mediaPreparation.policy, 'social-images-v1');
			assert.equal(job.payload.mediaPreparation.sourceAttachments[0].storageId, uploaded.storageId);
			assert.equal(job.payload.mediaPreparation.sourceAttachments[0].mimeType, 'image/png');
			assert.equal(job.payload.mediaPreparation.digest, preparedMediaDigest(job.network, job.payload.mediaPreparation.sourceAttachments, job.payload.attachments));
		}
		const keyModel = app.ms.database.sequelize.models.assetIdempotencyKey;
		const count = await keyModel.count({where: {userId: user.id, namespace: 'local-social-images-v1'}});
		assert.equal(count, 3); // Twitter and Threads share the same cap/profile.
		const read = app.ms.storage.getFileStream;
		let sourceReads = 0;
		app.ms.storage.getFileStream = async (...args) => {if (args[0] === uploaded.storageId) {sourceReads++;} return read.apply(app.ms.storage, args);};
		try {
			const replay = await successful(await call('/compose', input));
			assert.equal(replay.postId, composed.postId);
			assert.deepEqual(replay.jobs.map(job => job.id), composed.jobs.map(job => job.id));
			const next = await successful(await call('/compose', {...input, requestKey: randomUUID()}));
			assert.deepEqual(next.jobs.map(job => job.payload.attachments[0].storageId), composed.jobs.map(job => job.payload.attachments[0].storageId));
			assert.equal(sourceReads, 0); // Durable trusted cache works beyond a single request.
		} finally {
			app.ms.storage.getFileStream = read;
		}
		assert.equal(await keyModel.count({where: {userId: user.id, namespace: 'local-social-images-v1'}}), count);
		assert.equal((await call('/compose', {...input, mediaPolicy: undefined})).status, 409);
	});
	it('composes owned Content references without uploads and rejects unsafe content before jobs', async () => {
		const bytes = await sharp({create: {width: 90, height: 70, channels: 3, background: '#243762'}}).png().toBuffer();
		const content = await app.ms.content.saveData(user.id, bytes, 'owned-reference.png', {mimeType: 'image/png', driver: {raw: true}, skipFileCatalog: true});
		await app.ms.database.models.Content.update({propertiesJson: 'null'}, {where: {id: content.id}});
		const Asset = app.ms.database.sequelize.models.asset;
		assert.equal(await Asset.count({where: {userId: user.id, storageId: content.storageId}}), 0);
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Owned reference source'}));
		const input = composeInput({groupId: group.id, mediaPolicy: 'social-images-v1', imageStorageIds: [content.storageId], destinations: [{network: 'twitter'}]});
		const composed = await successful(await call('/compose', input));
		assert.equal(composed.jobs[0].payload.mediaPreparation.sourceAttachments[0].storageId, content.storageId);
		for (const flag of ['isEncrypted', 'isDeleted', 'isRemote']) {
			await app.ms.database.models.Content.update({[flag]: true}, {where: {id: content.id}});
			try {
				assert.equal((await call('/compose', {...input, requestKey: randomUUID()})).status, 403);
			} finally {
				await app.ms.database.models.Content.update({[flag]: false}, {where: {id: content.id}});
			}
		}
		const foreign = await app.registerUser({email: 'foreign-content-reference@example.com', name: 'foreign-content-reference', permissions: [CorePermissionName.UserAll]});
		const other = await app.ms.content.saveData(foreign.id, await sharp(bytes).negate().png().toBuffer(), 'foreign-reference.png', {mimeType: 'image/png', driver: {raw: true}, skipFileCatalog: true});
		assert.equal((await call('/compose', {...input, requestKey: randomUUID(), imageStorageIds: [other.storageId]})).status, 403);
		assert.equal((await successful(await call('/compose', input))).postId, composed.postId);
	});
	it('reuses an existing publication JPEG and its durable social cache without re-encoding', async () => {
		const png = await sharp({create: {width: 110, height: 75, channels: 3, background: '#6382ab'}}).png().toBuffer();
		const content = await app.ms.content.saveData(user.id, png, 'trusted-publication.png', {mimeType: 'image/png',
			driver: {name: 'imageOptimize', module: 'convert', params: {policy: 'publication-jpeg95-v1'}}, skipFileCatalog: true, requirePreview: true});
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Trusted JPEG source'}));
		const input = composeInput({groupId: group.id, mediaPolicy: 'social-images-v1', imageStorageIds: [content.storageId], destinations: [{network: 'bluesky'}]});
		const save = app.ms.content.saveData;
		let encodes = 0;
		app.ms.content.saveData = async (...args) => {
			if (String(args[2]).startsWith('social-images-v1-')) {
				encodes++;
			}
			return save.apply(app.ms.content, args);
		};
		try {
			const first = await successful(await call('/compose', input));
			const next = await successful(await call('/compose', {...input, requestKey: randomUUID()}));
			assert.equal(first.jobs[0].payload.attachments[0].storageId, content.storageId);
			assert.equal(next.jobs[0].payload.attachments[0].storageId, content.storageId);
			assert.equal(encodes, 0);
		} finally {
			app.ms.content.saveData = save;
		}
	});
	it('prepares a Patreon preview job and freezes the campaign route without changing producer intent', async () => {
		const bytes = await sharp({create: {width: 300, height: 200, channels: 3, background: '#b68261'}}).webp().toBuffer();
		const uploaded = await uploadPreparationImage(bytes, 'image/webp');
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Patreon source'}));
		const target = {title: 'Prepared set', audience: 'free_members', teaserText: 'Public preview.'};
		const input = composeInput({groupId: group.id, mediaPolicy: 'social-images-v1', text: 'Public preview.\nProtected link', imageStorageIds: [uploaded.storageId], producer: {type: 'microwave-girls', postId: 901}, destinations: [{network: 'patreon', target}]});
		const job = (await successful(await call('/compose', input))).jobs[0];
		assert.equal(job.payload.attachments[0].mimeType, 'image/jpeg');
		const account = {network: 'patreon', localAccountId: 'patreon_prepared'};
		const claimed = (await successful(await call('/claim', {jobId: job.id, groupIds: [group.id], accounts: [account], routes: [{groupId: group.id, ...account, target: {campaignId: '123'}}]}))).job;
		assert.equal(claimed.target.campaignId, '123');
		assert.equal(claimed.target.audience, 'free_members');
		assert.equal(claimed.producer.digest, job.producer.digest);
		assert.deepEqual(claimed.payload, job.payload);
		const listed = (await successful(await call('?network=patreon&limit=1'))).jobs;
		assert.equal(listed.length, 1);
		assert.equal(listed[0].id, job.id);
		const replayed = (await successful(await call('/compose', input))).jobs[0];
		assert.equal(replayed.id, job.id);
		assert.equal(replayed.target.campaignId, '123');
	});
	it('preserves original producer digest through preparation, routing and replay', async () => {
		const bytes = await sharp({create: {width: 300, height: 200, channels: 3, background: '#b68261'}}).webp().toBuffer();
		const uploaded = await uploadPreparationImage(bytes, 'image/webp');
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Prepared producer source'}));
		const input = composeInput({groupId: group.id, mediaPolicy: 'social-images-v1', imageStorageIds: [uploaded.storageId], producer: {type: 'microwave-girls', postId: 900}, destinations: [{network: 'telegram', target: {sensitive: false}}]});
		const result = await successful(await call('/compose', input));
		const job = result.jobs[0];
		const expected = publicationDigest('telegram', '', {text: input.text, attachments: [{storageId: uploaded.storageId, mimeType: 'image/webp'}]}, {sensitive: false});
		assert.equal(job.producer.digest, expected);
		assert.notEqual(job.producer.digest, publicationDigest('telegram', '', job.payload, job.target));
		const account = {network: 'telegram', localAccountId: 'telegram_prepared'};
		const claimed = (await successful(await call('/claim', {jobId: job.id, groupIds: [group.id], accounts: [account], routes: [{groupId: group.id, ...account, target: {chatId: '-100', sfwChatId: '-200'}}]}))).job;
		assert.equal(claimed.producer.digest, expected);
		assert.equal(claimed.target.chatId, '-200');
		assert.deepEqual(claimed.payload, job.payload);
		const replayed = (await successful(await call('/compose', input))).jobs[0];
		assert.equal(replayed.producer.digest, expected);
		assert.equal(replayed.localAccountId, account.localAccountId);
	});
	it('keeps every destination unqueued when media or a later destination is invalid', async () => {
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'All-or-nothing preparation'}));
		const before = await app.ms.database.models.Post.count({where: {groupId: group.id}});
		const jobs = app.ms.database.sequelize.models.publicationJob;
		const invalidText = composeInput({groupId: group.id, mediaPolicy: 'social-images-v1', text: 'x'.repeat(301), destinations: [{network: 'threads'}, {network: 'bluesky'}]});
		const rejectedText = await call('/compose', invalidText);
		assert.equal(rejectedText.status, 400);
		assert.equal((await rejectedText.json() as any).code, 'local_publication_text_too_long');
		assert.equal(await jobs.count({where: {composeKey: invalidText.requestKey}}), 0);
		// Simulate malformed image metadata left by a legacy import. Binary upload
		// avoids exercising the unrelated legacy metadata decoder in this fixture.
		const malformed = await uploadPreparationImage(Buffer.from('legacy malformed image bytes'), 'application/octet-stream');
		const malformedAsset = await app.ms.database.sequelize.models.asset.findOne({where: {userId: user.id, storageId: malformed.storageId}});
		await app.ms.database.models.Content.update({mimeType: 'image/jpeg'}, {where: {id: malformedAsset.contentId}});
		const input = composeInput({groupId: group.id, mediaPolicy: 'social-images-v1', imageStorageIds: [malformed.storageId], destinations: [{network: 'twitter'}, {network: 'bluesky'}]});
		const rejected = await call('/compose', input);
		assert.equal(rejected.status, 400);
		assert.equal((await rejected.json() as any).code, 'local_publication_image_decode_failed');
		assert.equal(await jobs.count({where: {composeKey: input.requestKey}}), 0);
		assert.equal(await app.ms.database.models.Post.count({where: {groupId: group.id}}), before);
		assert.equal((await call('/compose', {...input, mediaPolicy: 'unknown'})).status, 400);
	});
	it('deduplicates concurrent prepared compose and activates drafts against original refs', async () => {
		const bytes = await sharp({create: {width: 100, height: 160, channels: 3, background: '#6a8b94'}}).png().toBuffer();
		const uploaded = await uploadPreparationImage(bytes, 'image/png');
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Prepared draft source'}));
		const input = composeInput({groupId: group.id, mediaPolicy: 'social-images-v1', text: 'Race', imageStorageIds: [uploaded.storageId], destinations: [{network: 'twitter'}]});
		const raced = await Promise.all(Array.from({length: 3}, () => call('/compose', input).then(successful)));
		assert.equal(new Set(raced.map(result => result.postId)).size, 1);
		assert.equal(new Set(raced.map(result => result.jobs[0].id)).size, 1);
		const content = await app.ms.database.getContentByStorageAndUserId(uploaded.storageId, user.id);
		const text = await app.ms.content.saveData(user.id, 'Original draft', 'draft.txt', {driver: {raw: true}});
		const source = await app.ms.group.createPost(user.id, {groupId: group.id, status: PostStatus.Published, contents: [{id: text.id}, {id: content.id}]});
		const activated = await successful(await call('/compose', {...input, requestKey: randomUUID(), postId: source.id, text: 'Original draft'}));
		assert.equal(activated.postId, source.id);
		assert.notEqual(activated.jobs[0].payload.attachments[0].storageId, uploaded.storageId);
		assert.equal(activated.jobs[0].payload.mediaPreparation.sourceAttachments[0].storageId, uploaded.storageId);
	});

	it('selects network byte profiles and refuses a foreign cached asset reference', async () => {
		const raw = Buffer.alloc(1800 * 1800 * 3);
		let random = 987654321;
		for (let index = 0; index < raw.length; index++) {
			random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
			raw[index] = random >>> 24;
		}
		const original = await sharp(raw, {raw: {width: 1800, height: 1800, channels: 3}}).png().toBuffer();
		const uploaded = await uploadPreparationImage(original, 'image/png');
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Network profile source'}));
		const input = composeInput({groupId: group.id, mediaPolicy: 'social-images-v1', imageStorageIds: [uploaded.storageId], destinations: [{network: 'bluesky'}, {network: 'twitter'}]});
		const result = await successful(await call('/compose', input));
		const bsky = result.jobs.find(job => job.network === 'bluesky').payload.attachments[0];
		const twitter = result.jobs.find(job => job.network === 'twitter').payload.attachments[0];
		assert(bsky.size <= 2000000);
		assert(twitter.size <= 10 * 1024 * 1024);
		assert.notEqual(bsky.storageId, twitter.storageId);
		const keyModel = app.ms.database.sequelize.models.assetIdempotencyKey;
		const assetModel = app.ms.database.sequelize.models.asset;
		const asset = await assetModel.findOne({where: {userId: user.id, storageId: bsky.storageId}});
		const record = await keyModel.findOne({where: {userId: user.id, namespace: 'local-social-images-v1', assetId: asset.id}});
		const foreign = await app.registerUser({email: 'prepared-foreign@example.com', name: 'prepared-foreign', permissions: [CorePermissionName.UserAll]});
		const foreignKey = await app.generateUserApiKey(foreign.id, {scopes: ['publishing:local', 'assets:write']});
		const foreignBytes = await sharp({create: {width: 50, height: 50, channels: 3, background: '#ff0000'}}).jpeg().toBuffer();
		const foreignUpload = await uploadPreparationImage(foreignBytes, 'image/jpeg', foreignKey);
		const foreignAsset = await assetModel.findOne({where: {userId: foreign.id, storageId: foreignUpload.storageId}});
		await record.update({assetId: foreignAsset.id});
		const retried = await successful(await call('/compose', {...input, requestKey: randomUUID(), destinations: [{network: 'bluesky'}]}));
		assert.equal(retried.jobs[0].payload.attachments[0].storageId, bsky.storageId);
		assert.notEqual(retried.jobs[0].payload.attachments[0].storageId, foreignUpload.storageId);
		await record.reload();
		assert.equal(record.assetId, asset.id);
		assert.equal((await call('/compose', {...input, requestKey: randomUUID(), imageStorageIds: [foreignUpload.storageId]})).status, 403);
	});

	it('rolls back the source and all jobs if group privacy changes during preparation', async () => {
		const bytes = await sharp({create: {width: 107, height: 163, channels: 3, background: '#bed715'}}).png().toBuffer();
		const uploaded = await uploadPreparationImage(bytes, 'image/png');
		const {group} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Privacy race source'}));
		const read = app.ms.storage.getFileStream;
		let changed = false;
		app.ms.storage.getFileStream = async (...args) => {
			if (!changed && args[0] === uploaded.storageId) {
				changed = true;
				await app.ms.database.models.Group.update({isPublic: true}, {where: {id: group.id}});
			}
			return read.apply(app.ms.storage, args);
		};
		const input = composeInput({groupId: group.id, mediaPolicy: 'social-images-v1', imageStorageIds: [uploaded.storageId], destinations: [{network: 'twitter'}, {network: 'bluesky'}]});
		try {
			const response = await call('/compose', input);
			assert.equal(response.status, 403);
			assert.equal((await response.json() as any).code, 'local_publication_source_forbidden');
		} finally {
			app.ms.storage.getFileStream = read;
		}
		assert.equal(changed, true);
		assert.equal(await app.ms.database.models.Post.count({where: {groupId: group.id}}), 0);
		assert.equal(await app.ms.database.sequelize.models.publicationJob.count({where: {composeKey: input.requestKey}}), 0);
	});

	it('freezes registered destinations, verifies v4 before effects and isolates HTTP claims/results', async () => {
		const {group: registeredGroup} = await successful(await call('/sources', {requestKey: randomUUID(), title: 'Registered destination source'}));
		const local = {sourceGroupId: registeredGroup.id, localKey: 'telegram-main', network: 'telegram', label: 'Local Telegram', localAccountId: 'telegram_local', target: {chatId: '123', sfwChatId: '456'}, enabled: true};
		const registered = await successful(await call('/destinations', {destinations: [local]}));
		const target = registered.destinations[0];
		assert.equal(target.clientId, registered.clientId);
		assert.equal(target.executionMode, 'client');
		assert.equal(target.sourceGroupId, registeredGroup.id);
		assert.equal((await call('/destinations', {destinations: [{...local, sourceGroupId: groupId}]})).status, 409);
		const repeated = await successful(await call('/destinations', {destinations: [local]}));
		assert.equal(repeated.destinations[0].id, target.id);
		const owned = await successful(await call('/destinations?limit=100'));
		assert(owned.destinations.some(row => row.id === target.id));
		assert.equal(owned.destinations[0].socNetAccountId, undefined);
		const authored = {sensitive: false, chatId: '456'};
		const payload = {text: 'Composed text', attachments: [{storageId: imageStorageId, mimeType: 'image/jpeg'}]};
		const digest = publicationDestinationDigest(target.id, target.clientId, target.network, target.localAccountId, payload, authored);
		const input: any = composeInput({groupId: registeredGroup.id, destinations: [{destinationId: target.id, network: 'telegram', target: authored}], producer: {type: 'microwave-girls', postId: 123, digest}});
		const wrongGroup = {...input, requestKey: randomUUID(), groupId};
		assert.equal((await call('/compose', wrongGroup)).status, 403);
		const result = await successful(await call('/compose', input));
		const job = result.jobs[0];
		assert.equal(job.clientId, target.clientId);
		assert.equal(job.destinationId, target.id);
		assert.deepEqual(job.target, authored);
		assert.equal(job.producer.digest, digest);
		assert.equal((await successful(await call(`?destinationId=${target.id}`))).jobs[0].id, job.id);
		const otherKey = await app.generateUserApiKey(user.id, {title: 'second local client', scopes: ['publishing:local', 'assets:write']});
		assert.equal((await successful(await call('/destination-claim', {destinationIds: [target.id], jobId: job.id}, otherKey))).job, null);
		assert.equal((await successful(await call('/claim', {accounts: [{network: 'telegram', localAccountId: 'telegram_local'}], jobId: job.id}))).job, null);
		await successful(await call('/destinations', {destinations: [{...local, target: {chatId: '789'}, label: 'Changed'}]}));
		assert.equal((await successful(await call('/compose', input))).jobs[0].id, job.id);
		const invalid = {...input, requestKey: randomUUID()};
		const postsBefore = await app.ms.database.models.Post.count();
		assert.equal((await call('/compose', invalid)).status, 409);
		assert.equal(await app.ms.database.models.Post.count(), postsBefore);
		const claimed = (await successful(await call('/destination-claim', {destinationIds: [target.id], jobId: job.id}))).job;
		assert.deepEqual(claimed.target, authored);
		await app.ms.database.models.Group.update({isPublic: true}, {where: {id: registeredGroup.id}});
		await successful(await call('/destinations', {destinations: [{...local, enabled: false}]}));
		await app.ms.database.models.Group.update({isPublic: false}, {where: {id: registeredGroup.id}});
		const report = {claimToken: claimed.claimToken, status: 'posted', remoteId: '1'};
		assert.equal((await call(`/${job.id}/result`, report, otherKey)).status, 403);
		assert.equal((await successful(await call(`/${job.id}/result`, report))).job.status, 'posted');
		assert.equal((await successful(await call(`/${job.id}/result`, report))).job.status, 'posted');
		const changedDigest = {...input, requestKey: randomUUID(), destinations: [{destinationId: target.id, network: 'telegram', target: {sensitive: false}}]};
		await successful(await call('/destinations', {destinations: [local]}));
		changedDigest.producer = {...input.producer, digest: '0'.repeat(64)};
		assert.equal((await call('/compose', changedDigest)).status, 409);
		assert.equal(await app.ms.database.models.Post.count(), postsBefore);
	});

});
