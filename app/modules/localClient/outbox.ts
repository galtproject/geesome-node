import {createHash} from 'node:crypto';
import {Op, literal} from 'sequelize';
import {GroupType, PostStatus} from '../group/interface.js';
import {IGeesomeApp} from '../../interface.js';
import {getPublicApiContext} from '../api/publicUrls.js';
import {publicationDigest} from './producer.js';
import {isOwnedQueueGroup} from './sources.js';
import {createImagePreparation, socialImagePolicy, imageLimit, validatePreparedPublication, preparedMediaDigest} from './imagePreparation.js';

const marker = 'local-publications-v1';
export function outboxName(userId) {
	return `local-publications-${userId}`;
}
export function isManagedOutbox(group, userId) {
	if (!group || group.name !== outboxName(userId) || Number(group.creatorId) !== Number(userId) || group.isPublic !== false || group.isOpen !== false || group.isEncrypted || group.isRemote || group.isDeleted || group.type !== GroupType.Channel) {
		return false;
	}
	try {
		return JSON.parse(group.propertiesJson || '{}').localPublishingOutbox === marker;
	} catch {
		return false;
	}
}

export function getOutboxMethods(app: IGeesomeApp, Job: any, helpers) {
	const {normalizeRequest, snapshot, plain, problem, boundedInteger, groupIds, jobViews} = helpers;
	const sequelize = Job.sequelize;
	const prepareImages = createImagePreparation(app);
	const groupInitializations = new Map<number, Promise<any>>();
	const getGroup = userId => app.ms.group.getGroupByParams({name: outboxName(userId), isCollateral: false});
	const groupView = group => ({id: group.id, name: group.name, title: group.title});
	async function ensureGroup(userId) {
		if (groupInitializations.has(userId)) {
			return groupInitializations.get(userId);
		}
		const pending = (async () => {
			let group = await getGroup(userId);
			if (!group) {
				try {
					group = await app.ms.group.createGroup(userId, {
						name: outboxName(userId), title: 'Local publications', type: GroupType.Channel,
						isPublic: false, isOpen: false, isEncrypted: false, isRemote: false, isCollateral: false,
						propertiesJson: JSON.stringify({localPublishingOutbox: marker})
					}, {reuseOwnedStaticAccount: true});
				} catch (error) {
					if (error.name !== 'SequelizeUniqueConstraintError' && error.message !== 'name_already_exists') {
						throw error;
					}
					group = await getGroup(userId);
					if (!group) {
						throw problem(409, 'local_publication_outbox_initializing');
					}
				}
			}
			if (!isManagedOutbox(group, userId)) {
				throw problem(409, 'local_publication_outbox_conflict');
			}
			// Recover a native createGroup interrupted after its owned row was saved.
			if (!await app.ms.group.isAdminInGroup(userId, group.id)) {
				await app.ms.staticId.setStaticAccountGroupId(userId, group.name, group.id);
				await (app.ms.group as any).addAdminToGroupPure(userId, group.id);
			}
			return group;
		})();
		groupInitializations.set(userId, pending);
		try {
			return await pending;
		} finally {
			groupInitializations.delete(userId);
		}
	}
	async function replay(userId, request, hash) {
		const jobs = await Job.findAll({where: {userId, composeKey: request.requestKey}, order: [['composeIndex', 'ASC']]});
		if (!jobs.length) {
			return null;
		}
		if (jobs.length !== request.destinations.length || jobs.some(job => job.composeHash !== hash)) {
			throw problem(409, 'local_publication_request_conflict');
		}
		const post = await app.ms.group.getPostPure(jobs[0].postId);
		if (!post?.group || Number(post.group.creatorId) !== Number(userId)) {
			throw problem(409, 'local_publication_source_missing');
		}
		return {group: groupView(post.group), postId: post.id, jobs: await jobViews(jobs)};
	}
	async function images(userId, ids) {
		const records = [];
		for (const storageId of ids) {
			const asset = await sequelize.models.asset.findOne({where: {userId, storageId}});
			const content = asset ? await app.ms.database.getContent(asset.contentId) : await app.ms.database.getContentByStorageAndUserId(storageId, userId);
			if (!content || Number(content.userId) !== Number(userId) || content.storageId !== storageId || !String(content.mimeType).startsWith('image/') || (content as any).isEncrypted || content.isDeleted || content.isRemote) {
				throw problem(403, 'local_publication_image_forbidden');
			}
			records.push(content);
		}
		return records;
	}
	function normalize(input) {
		if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['requestKey', 'text', 'imageStorageIds', 'destinations', 'scheduledAt', 'postId', 'producer', 'groupId', 'mediaPolicy'].includes(key))) {
			throw problem(400, 'local_publication_input_invalid');
		}
		if (input.mediaPolicy !== undefined && input.mediaPolicy !== socialImagePolicy) {
			throw problem(400, 'local_publication_media_policy_invalid');
		}
		if (typeof input.text !== 'string' || input.text.length > 40000 || /\u0000/.test(input.text) || !Array.isArray(input.imageStorageIds) || input.imageStorageIds.length > 20 || input.imageStorageIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9]+$/.test(id)) || new Set(input.imageStorageIds).size !== input.imageStorageIds.length) {
			throw problem(400, 'local_publication_payload_invalid');
		}
		if (!input.text.trim() && !input.imageStorageIds.length) {
			throw problem(400, 'local_publication_payload_invalid');
		}
		if (!Array.isArray(input.destinations) || !input.destinations.length || input.destinations.length > 20) {
			throw problem(400, 'local_publication_destinations_required');
		}
		let producer;
		if (input.producer !== undefined) {
			if (!input.producer || typeof input.producer !== 'object' || Array.isArray(input.producer) || Object.keys(input.producer).some(key => !['type', 'postId'].includes(key)) || input.producer.type !== 'microwave-girls' || input.destinations.length !== 1) {
				throw problem(400, 'local_publication_producer_invalid');
			}
			producer = {type: 'microwave-girls', postId: boundedInteger(input.producer.postId, 1, Number.MAX_SAFE_INTEGER)};
		}
		const destinations = input.destinations.map(destination => {
			if (!destination || Object.keys(destination).some(key => !['network', 'localAccountId', 'target'].includes(key))) {
				throw problem(400, 'local_publication_input_invalid');
			}
			const normalized = normalizeRequest({requestKey: input.requestKey, postId: 1, ...destination, scheduledAt: input.scheduledAt === undefined ? '2000-01-01T00:00:00Z' : input.scheduledAt}, input.groupId !== undefined);
			return {network: normalized.network, localAccountId: normalized.localAccountId, target: normalized.target};
		});
		if (destinations.some(destination => destination.network === 'patreon' && (!input.imageStorageIds.length ||
			!input.text.startsWith(destination.target.teaserText) || input.text.length <= destination.target.teaserText.length))) {
			throw problem(400, 'local_publication_target_invalid');
		}
		if (new Set(destinations.map(destination => `${destination.network}:${destination.localAccountId}`)).size !== destinations.length) {
			throw problem(400, 'local_publication_destination_duplicate');
		}
		const normalized = normalizeRequest({requestKey: input.requestKey, postId: input.postId ?? 1, ...destinations[0], scheduledAt: input.scheduledAt === undefined ? '2000-01-01T00:00:00Z' : input.scheduledAt}, input.groupId !== undefined);
		return {requestKey: normalized.requestKey, text: input.text, imageStorageIds: input.imageStorageIds, destinations,
			scheduledAt: input.scheduledAt === undefined ? null : normalized.scheduledAt, postId: input.postId === undefined ? null : normalized.postId, ...(producer ? {producer} : {}), ...(input.groupId === undefined ? {} : {groupId: boundedInteger(input.groupId, 1, Number.MAX_SAFE_INTEGER)}), ...(input.mediaPolicy === undefined ? {} : {mediaPolicy: input.mediaPolicy})};
	}
	return {
		async compose(userId, input) {
			const request = normalize(input);
			const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
			const previous = await replay(userId, request, hash);
			if (previous) {
				return previous;
			}
			if (request.mediaPolicy) {
				validatePreparedPublication(request);
			}
			const imageContents = await images(userId, request.imageStorageIds);
			const group = request.groupId ? await app.ms.group.getGroup(request.groupId) : await ensureGroup(userId);
			if (!isOwnedQueueGroup(group, userId)) {
				throw problem(403, 'local_publication_source_forbidden');
			}
			let existingPost;
			let originalPayload = {text: request.text, attachments: imageContents.map(content => imageAttachment(app, content))};
			if (request.postId) {
				existingPost = await app.ms.group.getPost(userId, request.postId);
				if (existingPost.groupId !== group.id || Number(existingPost.userId) !== Number(userId) || !isOwnedQueueGroup(existingPost.group, userId) || existingPost.isDeleted || existingPost.isEncrypted || existingPost.isRemote || existingPost.source) {
					throw problem(403, 'local_publication_source_forbidden');
				}
				if (request.mediaPolicy && await Job.count({where: {postId: existingPost.id}})) {
					throw problem(409, 'local_publication_draft_already_assigned');
				}
				originalPayload = await snapshot(app, existingPost);
				if (originalPayload.text !== request.text || JSON.stringify(originalPayload.attachments.map(item => item.storageId)) !== JSON.stringify(request.imageStorageIds)) {
					throw problem(409, 'local_publication_draft_changed');
				}
			}
			// Every destination and rendition must be ready before a source or job transaction starts.
			const prepared = request.mediaPolicy ? await prepareImages(userId, imageContents, request.destinations) : null;
			const scheduledAt = request.scheduledAt || new Date().toISOString();
			let jobs;
			async function assertPrivateGroup(transaction) {
				if (request.mediaPolicy) {
					const current = await app.ms.database.models.Group.findByPk(group.id, {transaction, lock: transaction.LOCK.UPDATE});
					if (!isOwnedQueueGroup(current, userId)) {
						throw problem(403, 'local_publication_source_forbidden');
					}
				}
			}
			async function insertJobs(post, transaction, payload) {
				await assertPrivateGroup(transaction);
				jobs = await Job.bulkCreate(request.destinations.map((destination, index) => {
					const attachments = prepared ? prepared.get(imageLimit(destination.network)).map(content => imageAttachment(app, content)) : payload.attachments;
					const preparedPayload = prepared ? {text: payload.text, attachments, mediaPreparation: {policy: socialImagePolicy,
						sourceAttachments: payload.attachments, digest: preparedMediaDigest(destination.network, payload.attachments, attachments)}} : payload;
					return {userId, postId: post.id, ...destination, payload: preparedPayload, scheduledAt, status: 'queued',
						requestKey: `compose:${createHash('sha256').update(request.requestKey).digest('hex')}:${index}`,
						requestHash: hash, composeKey: request.requestKey, composeHash: hash, composeIndex: index,
						...(request.producer ? {producer: {...request.producer, digest: publicationDigest(destination.network, destination.localAccountId, payload, destination.target)}} : {})};
				}), {transaction, returning: true});
			}
			try {
				let post;
				if (request.postId) {
					post = existingPost;
					const payload = originalPayload;
					await sequelize.transaction(async transaction => {
						await assertPrivateGroup(transaction);
						const locked = await app.ms.database.models.Post.findByPk(post.id, {transaction, lock: transaction.LOCK.UPDATE});
						if (!locked || locked.isDeleted || Number(locked.userId) !== Number(userId) || locked.groupId !== group.id || Number(new Date(locked.updatedAt)) !== Number(new Date(post.updatedAt))) {
							throw problem(409, 'local_publication_draft_changed');
						}
						const currentContents = await locked.getContents({transaction});
						if (contentIdentity(currentContents) !== contentIdentity(post.contents)) {
							throw problem(409, 'local_publication_draft_changed');
						}
						if (await Job.count({where: {postId: post.id}, transaction})) {
							throw problem(409, 'local_publication_draft_already_assigned');
						}
						await insertJobs(post, transaction, payload);
					});
				} else {
					const textContent = request.text ? await app.ms.content.saveData(userId, request.text, 'publication.txt', {mimeType: 'text/plain', skipFileCatalog: true, driver: {raw: true}}) : null;
					// Build from owned immutable Content records without storage calls in the transaction.
					const payload = originalPayload;
					post = await app.ms.group.createPost(userId, {groupId: group.id, status: PostStatus.Published,
						contents: [...(textContent ? [{id: textContent.id}] : []), ...imageContents.map(content => ({id: content.id}))]}, {
						afterPersist: (created, transaction) => insertJobs(created, transaction, payload)
					});
				}
				return {group: groupView(group), postId: post.id, jobs: await jobViews(jobs)};
			} catch (error) {
				if (error.name === 'SequelizeUniqueConstraintError' || error.code === 'local_publication_draft_already_assigned') {
					const completed = await replay(userId, request, hash);
					if (completed) {
						return completed;
					}
					if (error.name === 'SequelizeUniqueConstraintError') {
						throw problem(409, 'local_publication_request_conflict');
					}
				}
				throw error;
			}
		},
		async getOutbox(userId, query: any = {}) {
			const limit = boundedInteger(query.limit ?? 20, 1, 100);
			const offset = boundedInteger(query.offset ?? 0, 0, 1000000);
			const selected = query.groupIds === undefined ? null : groupIds(query.groupIds);
			const groups = selected ? await app.ms.database.models.Group.findAll({where: {id: {[Op.in]: selected}, creatorId: userId}}) : [];
			const eligible = groups.filter(group => isOwnedQueueGroup(group, userId));
			const group = selected ? (eligible.length === 1 ? eligible[0] : null) : await getGroup(userId);
			if (selected && !eligible.length) {
				return {ownerId: Number(userId), capabilities: {ownedImageReferences: true, patreonPublishing: true, networkQueues: true}, group: null, groups: [], drafts: []};
			}
			if (!selected && !group) {
				return {ownerId: Number(userId), capabilities: {ownedImageReferences: true, patreonPublishing: true, networkQueues: true}, group: null, drafts: []};
			}
			if (!selected && !isManagedOutbox(group, userId)) {
				throw problem(409, 'local_publication_outbox_conflict');
			}
			const posts = await app.ms.database.models.Post.findAll({where: {
				userId, groupId: selected ? {[Op.in]: eligible.map(group => group.id)} : group.id, isDeleted: false, isRemote: {[Op.not]: true}, isEncrypted: {[Op.not]: true},
				[Op.or]: [{source: null}, {source: ''}], status: {[Op.in]: [PostStatus.Published, PostStatus.Draft]},
				[Op.and]: literal(`NOT EXISTS (SELECT 1 FROM ${sequelize.getQueryInterface().queryGenerator.quoteTable(Job.getTableName())} AS jobs WHERE jobs."postId" = "post"."id")`)
			}, include: [{association: 'contents'}, {association: 'group'}], limit, offset, order: [['createdAt', 'DESC'], ['id', 'DESC']]});
			const drafts = [];
			for (const post of posts) {
				try {
					const payload = await snapshot(app, post);
					if (payload.attachments.some(item => !item.mimeType.startsWith('image/'))) {
						throw problem(400, 'local_publication_attachment_unsupported');
					}
					drafts.push({postId: post.id, groupId: post.groupId, text: payload.text, attachments: payload.attachments, createdAt: post.createdAt});
				} catch (error) {
					if (error.status !== 400) {
						throw error;
					}
					drafts.push({postId: post.id, groupId: post.groupId, text: '', attachments: [], createdAt: post.createdAt, unavailable: true, error: 'This draft contains unsupported content. Edit it in GeeSome before scheduling.'});
				}
			}
			return {ownerId: Number(userId), capabilities: {ownedImageReferences: true, patreonPublishing: true, networkQueues: true}, group: group ? groupView(group) : null, ...(selected ? {groups: eligible.map(groupView)} : {}), drafts};
		}
	};
}

function imageAttachment(app, content) {
	const {publicUrl: base} = getPublicApiContext(app);
	return {storageId: content.storageId, size: Number(content.size || 0), url: `${base}/ipfs/${content.storageId}`,
		mimeType: content.mimeType, name: String(content.name || '').slice(0, 200)};
}

function contentIdentity(contents) {
	return JSON.stringify([...contents].sort((a, b) => Number(a.postsContents?.position || 0) - Number(b.postsContents?.position || 0)).map(content => [content.id, content.storageId, content.postsContents?.position, Boolean(content.postsContents?.isPrivate)]));
}
