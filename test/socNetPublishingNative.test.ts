import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DataTypes, Sequelize} from 'sequelize';
import config from '../app/modules/database/config.js';
import createModels from '../app/modules/socNetPublishing/models.js';
import {getModule} from '../app/modules/socNetPublishing/index.js';
import {createServerPublisher} from '../app/modules/socNetPublishing/serverPublisher.js';
import createPostModel from '../app/modules/group/models/post.js';
import {getModule as createGroupModule} from '../app/modules/group/index.js';
import {GroupType, PostStatus} from '../app/modules/group/interface.js';

describe('native Site Group publishing', function () {
	this.timeout(90000);
	const schema = `native_publications_${randomUUID().replaceAll('-', '')}`;
	let db, models, siteModels, Post, app, module, sourceGroup, targetGroup, allowed, interrupt, manifestCalls, stolen;
	before(async () => {
		db = new Sequelize({...config, logging: false, pool: {max: 3}, define: {schema}} as any);
		await db.createSchema(schema, {});
		models = await createModels(db);
		const User = db.define('user', {});
		const Group = db.define('group', {creatorId: DataTypes.INTEGER, type: DataTypes.STRING, isPublic: DataTypes.BOOLEAN, isOpen: DataTypes.BOOLEAN, publishedPostsCount: DataTypes.INTEGER, availablePostsCount: DataTypes.INTEGER, size: DataTypes.INTEGER});
		const Content = db.define('content', {size: DataTypes.INTEGER, isDeleted: {type: DataTypes.BOOLEAN, defaultValue: false}});
		await User.sync();await Group.sync();await Content.sync();
		siteModels = {User, Group, Content};
		Post = await createPostModel(db, siteModels);siteModels.Post = Post;
		await User.create({id: 1});
		await Group.bulkCreate([{id: 2, creatorId: 1, type: 'channel', isPublic: false, isOpen: false}, {id: 3, creatorId: 1, type: 'channel', isPublic: true}]);
		await Content.bulkCreate([{id: 10, size: 10}, {id: 11, size: 11}, {id: 12, size: 12}]);
		await db.define('asset', {userId: DataTypes.INTEGER, storageId: DataTypes.STRING, contentId: DataTypes.INTEGER}).sync();
	});
	after(async () => {await db?.dropSchema(schema, {cascade: true});await db?.close();});
	beforeEach(async () => {
		await models.PublicationJob.destroy({where: {}});
		await models.PublicationDestination.destroy({where: {}});
		await Post.destroy({where: {}});
		allowed = true;interrupt = false;manifestCalls = 0;stolen = false;
		sourceGroup = {id: 2, creatorId: 1, type: GroupType.Channel, isPublic: false, isOpen: false};
		targetGroup = {id: 3, creatorId: 1, type: GroupType.Channel, isPublic: true};
		app = {checkUserCan: async () => {}, config: {apiConfig: {publicUrl: 'https://node.example'}}, ms: {database: {sequelize: db, models: {},
			getUser: async () => ({}), getContentByStorageAndUserId: async (storageId, userId) => ({id: storageId === 'QmFirst' ? 11 : 12, userId, storageId, mimeType: 'image/webp'})},
			content: {saveData: async () => ({id: 10})},
			group: {
				getGroup: async id => id === 2 ? sourceGroup : id === 3 ? targetGroup : null,
				canCreatePostInGroup: async userId => userId === 1 && allowed,
				getPost: async () => ({id: 1, groupId: 2, userId: 1, status: PostStatus.Published, group: sourceGroup}),
				getPostPure: async id => Post.findByPk(id),
				applyPostManifestUpdate: async (_userId, post) => {manifestCalls++;if (interrupt) {
					throw Error('fixture storage unavailable');
				}return post;},

			}}};
		const groupModule = createGroupModule(app, siteModels);
		Object.assign(groupModule, app.ms.group, {
			canReplyToPost: async () => true, checkGroupId: async id => id,
			getPostPure: createGroupModule(app, siteModels).getPostPure,
			getContentsForPost: async (_userId, contents) => Promise.all(contents.map(content => siteModels.Content.findByPk(content.id))),
			reconcilePostRelationCounters: async () => {}, addPostEvents: async () => {}
		});
		const addPost = groupModule.addPost.bind(groupModule);
		groupModule.addPost = async (data, options) => {
			const post = await addPost(data, options);
			if (stolen) {
				await models.PublicationJob.update({claimToken: 'replacement'}, {where: {executionMode: 'native'}});
			}
			return post;
		};
		app.ms.group = groupModule;
		module = getModule(app, models);
	});
	const registration = (extra = {}) => ({localKey: 'site-group', network: 'geesome', executionMode: 'native', label: 'Site Group', contentPolicy: 'nsfw',
		target: {groupId: 3}, enabled: true, ...extra});
	async function registered(extra = {}, clientId = 'key:1') {
		return (await module.registerDestinations(1, clientId, {destinations: [registration(extra)]})).destinations[0];
	}
	async function queued(destination, extra = {}) {
		return models.PublicationJob.create({userId: 1, postId: 1, contentType: 'sfw', contentPolicy: 'nsfw', requestKey: randomUUID(), requestHash: 'a'.repeat(64),
			destinationId: destination.id, executionMode: 'native', network: 'geesome', intentVersion: 6, target: {groupId: 3},
			payload: {text: 'Frozen title\n\n#frozen', attachments: [{storageId: 'QmFirst', mimeType: 'image/webp'}, {storageId: 'QmSecond', mimeType: 'image/webp'}]},
			scheduledAt: new Date(0), status: 'queued', ...extra});
	}
	it('registers one accountless owner destination across keys and concurrent retries', async () => {
		const [first, second] = await Promise.all([registered(), registered({}, 'key:2')]);
		assert.equal(first.id, second.id);assert.equal(first.executionMode, 'native');assert.equal(first.clientId, undefined);assert.equal(first.localAccountId, undefined);
		assert.equal(await models.PublicationDestination.count(), 1);
		await assert.rejects(registered({target: {groupId: 2}}), {status: 403});
		await assert.rejects(registered({localAccountId: 'fake-account'}), {status: 400});
		await assert.rejects(registered({target: {groupId: 3, unexpected: 'value'}}), {status: 400});
	});
	it('rejects foreign/private/deleted targets and revoked write permission', async () => {
		for (const changes of [{creatorId: 2}, {isPublic: false}, {isDeleted: true}, {isEncrypted: true}, {isRemote: true}]) {
			const original = {...targetGroup};Object.assign(targetGroup, changes);
			await assert.rejects(registered(), {status: 403});targetGroup = original;
		}
		allowed = false;await assert.rejects(registered(), {status: 403});
	});
	it('executes frozen ordered images without account models and isolates desktop claims/results', async () => {
		const destination = await registered();const job = await queued(destination);
		assert.equal(await module.claimDestinationJob(1, 'key:1', {intentVersion: 6, destinationIds: [destination.id]}), null);
		assert.equal(await module.claimJob(1, {intentVersion: 6, accounts: [{network: 'geesome', localAccountId: 'fake'}]}).catch(() => null), null);
		await module.processServerQueue();await job.reload();
		assert.equal(job.status, 'posted');assert.equal(await Post.count(), 1);assert.equal(manifestCalls, 1);
		assert.equal(job.remoteUrl, `https://node.example/#/group/3/posts/${job.remoteId}`);
		const created = await app.ms.group.getPostPure(job.remoteId);
		assert.deepEqual(created.contents.map(content => content.id), [10, 11, 12]);
		assert(created.contents.every(content => content.postsContents.isPrivate === false));
		await assert.rejects(module.reportResult(1, job.id, {claimToken: job.claimToken, status: 'posted', remoteId: job.remoteId}, 'key:1'), {status: 403});
		await module.processServerQueue();assert.equal(await Post.count(), 1);
	});
	it('composes one native batch and shares its destination ID in both publication groups', async () => {
		const destination = await registered();
		const sfw = await module.createDestinationGroup(1, {requestKey: randomUUID(), label: 'SFW', destinationIds: [destination.id], enabled: true});
		const nsfw = await module.createDestinationGroup(1, {requestKey: randomUUID(), label: 'NSFW', destinationIds: [destination.id], enabled: true});
		assert.deepEqual(sfw.group.destinationIds, nsfw.group.destinationIds);
		const body = {requestKey: randomUUID(), contentType: 'sfw', groupId: 2, text: 'Frozen title\n\n#frozen', imageStorageIds: ['QmFirst', 'QmSecond'], destinations: [{destinationId: destination.id, network: 'geesome', target: {}}]};
		await assert.rejects(module.compose(1, {...body, destinations: [{destinationId: destination.id, network: 'geesome', target: {groupId: 999}}]}), {code: 'local_publication_destination_changed'});
		const composed = await module.compose(1, body);
		assert.equal(composed.jobs.length, 1);assert.equal(composed.jobs[0].executionMode, 'native');assert.equal(composed.jobs[0].target.groupId, 3);
		app.ms.group.getPost = async (_userId, id) => app.ms.group.getPostPure(id);
		await module.processServerQueue();
		const job = await models.PublicationJob.findByPk(composed.jobs[0].id);
		assert.equal(job.status, 'posted');assert.equal(await Post.count({where: {groupId: 3}}), 1);
		assert.equal((await module.compose(1, body)).jobs[0].id, job.id);
		await module.processServerQueue();assert.equal(await Post.count({where: {groupId: 3}}), 1);
	});
	it('freezes a source image set across compose replay and native delivery', async () => {
		const destination = await registered();
		const set = {id: 42, groupId: 2, userId: 1, status: 'published', group: sourceGroup, propertiesJson: JSON.stringify({membership: {title: 'Source set'}})};
		const originalGet = app.ms.group.getPost;
		app.ms.group.getPost = async (userId, id) => id === 42 ? set : originalGet(userId, id);
		const body = {requestKey: randomUUID(), contentType: 'sfw', groupId: 2, text: 'Preview', imageStorageIds: ['QmFirst'],
			sourceImageSet: {groupId: 2, postId: 42}, destinations: [{destinationId: destination.id, network: 'geesome', target: {}}]};
		const composed = await module.compose(1, body);
		const job = await models.PublicationJob.findByPk(composed.jobs[0].id);
		assert.deepEqual(job.payload.sourceImageSet, body.sourceImageSet);
		set.propertiesJson = JSON.stringify({membership: {hidden: true}});
		assert.equal((await module.compose(1, body)).jobs[0].id, job.id);
		await assert.rejects(module.compose(1, {...body, sourceImageSet: {groupId: 2, postId: 43}}), {code: 'local_publication_request_conflict'});
		await module.processServerQueue();await job.reload();
		assert.equal(job.status, 'posted');
		const created = await app.ms.group.getPostPure(job.remoteId);
		assert.deepEqual(JSON.parse(created.propertiesJson).sourceImageSet, body.sourceImageSet);
		await module.processServerQueue();assert.equal(await Post.count({where: {groupId: 3}}), 1);
	});
	it('interleaves sustained native and social backlogs within the existing batch cap', async () => {
		const order = [];
		const worker = createServerPublisher(app, {
			claimServerJob: async () => ({job: {userId: 1, id: 1, network: 'telegram', contentType: 'sfw', contentPolicy: 'nsfw', payload: {}, target: {}, claimToken: 'fixture'}, account: {}}),
			reportResult: async () => {}
		}, {native: {processNext: async () => {order.push('native');return true;}}, providers: {publish: async () => {order.push('server');return {remoteId: '42'};}}});
		assert.equal((await worker.process({limit: 3})).processed, 3);
		assert.equal((await worker.process({limit: 3})).processed, 3);
		assert.deepEqual(order, ['native', 'server', 'native', 'server', 'native', 'server']);
	});
	it('resumes the persisted post after storage failure or a lost worker, preserving identity', async () => {
		const destination = await registered();const job = await queued(destination);interrupt = true;
		await module.processServerQueue();await job.reload();
		assert.equal(job.status, 'processing');assert(job.remoteId);assert.equal(await Post.count(), 1);
		const saved = job.remoteId;interrupt = false;
		await module.disableDestination(1, destination.id, {});sourceGroup.isPublic = true;
		await job.update({processingAt: new Date(0)});
		module = getModule(app, models);
		await module.processServerQueue();await job.reload();
		assert.equal(job.status, 'posted');assert.equal(job.remoteId, saved);assert.equal(await Post.count(), 1);
		sourceGroup.isPublic = false;await registered();
		await queued(destination);await module.processServerQueue();assert.equal(await Post.count(), 2);
	});
	it('rolls back a newly inserted post when another worker takes over before afterPersist', async () => {
		const destination = await registered();const job = await queued(destination);stolen = true;
		await module.processServerQueue();assert.equal(await Post.count(), 0);assert.equal((await job.reload()).remoteId, null);
		assert.equal(job.claimToken, 'replacement');
		stolen = false;await job.update({processingAt: new Date(0)});
		await module.processServerQueue();assert.equal(await Post.count(), 1);assert.equal((await job.reload()).status, 'posted');
	});
	it('claims concurrent ticks once, honors schedules, permissions and private source boundaries', async () => {
		const destination = await registered();const future = await queued(destination, {scheduledAt: new Date(Date.now() + 3600000)});
		await Promise.all([module.processServerQueue(), getModule(app, models).processServerQueue()]);assert.equal(await Post.count(), 0);
		await future.update({scheduledAt: new Date(0)});allowed = false;
		await module.processServerQueue();assert.equal((await future.reload()).status, 'failed');assert.equal(await Post.count(), 0);
		allowed = true;const wrongSource = await queued(destination);sourceGroup.isPublic = true;
		await module.processServerQueue();assert.equal((await wrongSource.reload()).status, 'failed');assert.equal(await Post.count(), 0);
		sourceGroup.isPublic = false;await queued(destination);
		await Promise.all([module.processServerQueue(), getModule(app, models).processServerQueue()]);assert.equal(await Post.count(), 1);
	});
});
