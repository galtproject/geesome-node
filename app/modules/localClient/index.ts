import {createHash, randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {contentTextToRichText, richTextToPlainText} from '../../richText.js';
import {Op, literal} from 'sequelize';
import {IGeesomeApp} from '../../interface.js';
import {ApiProblemError} from '../api/problem.js';
import {getPublicApiContext} from '../api/publicUrls.js';
import {PostStatus} from '../group/interface.js';
import ILocalClientModule from './interface.js';
import {getOutboxMethods} from './outbox.js';
import {getSourceMethods, isOwnedQueueGroup} from './sources.js';

const networks = ['threads', 'instagram', 'reddit', 'twitter', 'rule34xxx', 'bluesky', 'discord', 'telegram'];
const statuses = ['queued', 'processing', 'posted', 'failed', 'needs_review', 'cancelled'];

export default async function localClient(app: IGeesomeApp) {
	app.checkModules(['api', 'database', 'group', 'asset']);
	const models = await (await import('./models.js')).default(app.ms.database.sequelize);
	const module = getModule(app, models);
	(await import('./api.js')).default(app, module);
	return module;
}

export function getModule(app: IGeesomeApp, {PublicationJob}: any): ILocalClientModule {
	const sequelize = PublicationJob.sequelize;
	return {
		...getOutboxMethods(app, PublicationJob, {normalizeRequest, snapshot, plain, problem, boundedInteger, groupIds: normalizeGroupIds, jobViews}),
		...getSourceMethods(app, {problem, boundedInteger}),
		async flushDatabase() {
			await PublicationJob.destroy({where: {}});
		},
		async createJob(userId, input) {
			const request = normalizeRequest(input);
			const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
			const where = {userId, requestKey: request.requestKey};
			const existing = await PublicationJob.findOne({where});
			if (existing) {
				return matchOwnedRequest(existing, requestHash);
			}
			const post = await assertSource(app, userId, request.postId);
			const payload = await snapshot(app, post);
			try {
				return {...plain(await PublicationJob.create({...request, userId, requestHash, payload, status: 'queued'})), groupId: post.groupId};
			} catch (error) {
				if (error.name !== 'SequelizeUniqueConstraintError') {
					throw error;
				}
				return matchOwnedRequest(await PublicationJob.findOne({where}), requestHash);
			}
		},
		async listJobs(userId, query = {}) {
			const limit = boundedInteger(query.limit ?? 20, 1, 100);
			const offset = boundedInteger(query.offset ?? 0, 0, 1000000);
			const where: any = {userId};
			if (query.groupIds !== undefined) {
				where.postId = postsInGroups(normalizeGroupIds(query.groupIds));
			}
			if (query.composeKey !== undefined) {
				where.composeKey = identifier(query.composeKey, 128);
			}
			if (query.ids !== undefined) {
				if (typeof query.ids !== 'string') {
					throw problem(400, 'local_publication_ids_invalid');
				}
				const ids = query.ids.split(',').map(id => boundedInteger(id, 1, Number.MAX_SAFE_INTEGER));
				if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length) {
					throw problem(400, 'local_publication_ids_invalid');
				}
				where.id = {[Op.in]: ids};
			}
			if (query.status !== undefined) {
				if (!statuses.includes(query.status)) {
					throw problem(400, 'local_publication_status_invalid');
				}
				where.status = query.status;
			}
			return jobViews(await PublicationJob.findAll({where, limit, offset, order: [['createdAt', 'DESC'], ['id', 'DESC']]}));
		},
		async claimJob(userId, input) {
			const accounts = normalizeAccounts(input);
			const groupIds = input.groupIds === undefined ? null : normalizeGroupIds(input.groupIds);
			const routes = normalizeRoutes(input.routes ?? [], accounts);
			const jobId = input.jobId === undefined ? null : boundedInteger(input.jobId, 1, Number.MAX_SAFE_INTEGER);
			if (!accounts.length) {
				return null;
			}
			// Commit ownership before group APIs run: they can need another DB query.
			// Keeping the transaction open would deadlock a saturated connection pool.
			for (let checked = 0; checked < 20; checked++) {
				const job = await sequelize.transaction(async transaction => {
					const candidate = await PublicationJob.findOne({
						where: {userId, status: 'queued', ...(jobId ? {id: jobId} : {scheduledAt: {[Op.lte]: new Date()}}),
							...(groupIds ? {postId: postsInGroups(groupIds)} : {}),
							[Op.or]: input.routes === undefined ? accounts : routes.map(route => ({network: route.network,
								localAccountId: {[Op.in]: ['', route.localAccountId]}, postId: postsInGroups([route.groupId])}))},
						order: [['scheduledAt', 'ASC'], ['id', 'ASC']],
						transaction, lock: transaction.LOCK.UPDATE, skipLocked: true
					});
					if (!candidate) {
						return null;
					}
					let binding = {};
					if (candidate.localAccountId === '') {
						const source = await app.ms.database.models.Post.findByPk(candidate.postId, {attributes: ['groupId'], transaction});
						const route = routes.find(route => route.groupId === Number(source?.groupId) && route.network === candidate.network);
						if (!route) {
							return null;
						}
						const fallback = {...route.target};
						if (candidate.target.sensitive === false) {
							if (fallback.sfwChannelId) {
								fallback.channelId = fallback.sfwChannelId;
							}
							if (fallback.sfwChatId) {
								fallback.chatId = fallback.sfwChatId;
							}
						}
						delete fallback.sfwChannelId;
						delete fallback.sfwChatId;
						const target = {...fallback, ...candidate.target};
						const normalized = normalizeRequest({requestKey: candidate.requestKey, postId: candidate.postId,
							network: candidate.network, localAccountId: route.localAccountId, target, scheduledAt: new Date(candidate.scheduledAt).toISOString()});
						binding = {localAccountId: normalized.localAccountId, target: normalized.target};
					}
					await candidate.update({...binding, status: 'processing', processingAt: new Date(), claimToken: randomBytes(32).toString('hex')}, {transaction});
					return candidate;
				});
				if (!job) {
					return null;
				}
				const claimWhere = {id: job.id, userId, status: 'processing', claimToken: job.claimToken};
				try {
					const source = await assertSource(app, userId, job.postId);
					if ((groupIds || input.routes !== undefined) && !isOwnedQueueGroup(source.group, userId)) {
						throw problem(403, 'local_publication_source_forbidden');
					}
				} catch (error) {
					if (!(error instanceof ApiProblemError)) {
						// A crash/transient authorization lookup failure leaves manual review.
						throw error;
					}
					await PublicationJob.update({status: 'failed', error: 'Source is no longer eligible for publication.'}, {where: claimWhere});
					continue;
				}
				const current = await PublicationJob.findOne({where: claimWhere});
				return current ? (await jobViews([current]))[0] : null;
			}
			return null;
		},
		async reportResult(userId, jobId, input) {
			return sequelize.transaction(async transaction => {
				const job = await getOwnedJob(userId, jobId, transaction);
				const result = normalizeResult(input, job.network);
				if (!job.claimToken || job.claimToken !== input.claimToken) {
					throw problem(409, 'local_publication_claim_invalid');
				}
				if (['posted', 'failed', 'cancelled'].includes(job.status)) {
					if (Object.entries(result).every(([key, value]) => job[key] === value)) {
						return plain(job);
					}
					throw problem(409, 'local_publication_result_conflict');
				}
				if (!['processing', 'needs_review'].includes(job.status)) {
					throw problem(409, 'local_publication_not_processing');
				}
				await job.update(result, {transaction});
				return plain(job);
			});
		},
		async cancelJob(userId, jobId) {
			return sequelize.transaction(async transaction => {
				const job = await getOwnedJob(userId, jobId, transaction);
				if (job.status === 'cancelled') {
					return plain(job);
				}
				if (job.status !== 'queued') {
					throw problem(409, 'local_publication_not_queued');
				}
				await job.update({status: 'cancelled'}, {transaction});
				return plain(job);
			});
		}
	};
	async function matchOwnedRequest(job, hash) {
		matchRequest(job, hash);
		return (await jobViews([job]))[0];
	}
	function postsInGroups(ids) {
		const table = sequelize.getQueryInterface().queryGenerator.quoteTable(app.ms.database.models.Post.getTableName());
		return {[Op.in]: literal(`(SELECT "id" FROM ${table} WHERE "groupId" IN (${ids.length ? ids.join(',') : 'NULL'}))`)};
	}
	async function jobViews(jobs) {
		if (!jobs.length || !app.ms.database?.models?.Post) {
			return jobs.map(plain);
		}
		const posts = await app.ms.database.models.Post.findAll({attributes: ['id', 'groupId'], where: {id: {[Op.in]: [...new Set(jobs.map(job => job.postId))]}}});
		const groups = new Map(posts.map(post => [Number(post.id), Number(post.groupId)]));
		return jobs.map(job => ({...plain(job), groupId: groups.get(Number(job.postId)) || null}));
	}
	async function getOwnedJob(userId, id, transaction) {
		const job = await PublicationJob.findOne({where: {id: boundedInteger(id, 1, Number.MAX_SAFE_INTEGER), userId}, transaction, lock: transaction.LOCK.UPDATE});
		if (!job) {
			throw problem(404, 'local_publication_not_found');
		}
		if (app.ms.database?.models?.Post) {
			const source = await app.ms.database.models.Post.findByPk(job.postId, {attributes: ['groupId'], transaction});
			job.setDataValue('groupId', source?.groupId || null);
		}
		return job;
	}
}

async function assertSource(app: IGeesomeApp, userId: number, postId: number) {
	let post;
	try {
		post = await app.ms.group.getPost(userId, postId);
	} catch (error) {
		if (['post_not_found', 'not_permitted', 'group_not_found'].includes(error.message)) {
			throw problem(403, 'local_publication_source_forbidden');
		}
		throw error;
	}
	const outbox = post && isOwnedQueueGroup(post.group, userId) && Number(post.userId) === Number(userId);
	if (!post || (post.status !== PostStatus.Published && !(outbox && post.status === PostStatus.Draft)) || post.isDeleted || post.isEncrypted || post.isRemote || post.source || (!post.group?.isPublic && !outbox) || post.group.isEncrypted) {
		throw problem(403, 'local_publication_source_forbidden');
	}
	if (!await app.ms.group.canEditPostInGroup(userId, post.groupId, post.id)) {
		throw problem(403, 'local_publication_source_forbidden');
	}
	return post;
}

async function snapshot(app: IGeesomeApp, post: any) {
	const {publicUrl} = getPublicApiContext(app);
	const contents = await app.ms.group.getPostContentData(post, '', {includeText: true, includeJson: false});
	const texts = [];
	const attachments = [];
	for (const content of contents) {
		if ((content as any).isPrivate && !isOwnedQueueGroup(post.group, post.userId)) {
			throw problem(400, 'local_publication_private_attachment');
		}
		if (content.type === 'text') {
			const raw = String(content.text || '');
			const document = contentTextToRichText(raw, content.mimeType);
			texts.push(document ? richTextToPlainText(document) : raw);
		} else if (['image', 'video'].includes(content.type) && content.storageId) {
			if (!/^[A-Za-z0-9]+$/.test(content.storageId)) {
				throw problem(400, 'local_publication_media_invalid');
			}
			const origin = new URL(publicUrl);
			if (!isOwnedQueueGroup(post.group, post.userId) && (origin.protocol !== 'https:' || isIP(origin.hostname) || !origin.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal)$/.test(origin.hostname))) {
				throw problem(400, 'local_publication_public_media_url_required');
			}
			attachments.push({storageId: content.storageId, size: Number(content.size || 0), url: `${publicUrl}/ipfs/${content.storageId}`, mimeType: String(content.mimeType || ''), name: String(content.name || '').slice(0, 200)});
		} else {
			throw problem(400, 'local_publication_attachment_unsupported');
		}
	}
	const text = texts.join('\n\n');
	if ((!text.trim() && !attachments.length) || text.length > 40000 || attachments.length > 20) {
		throw problem(400, 'local_publication_payload_invalid');
	}
	return {text, attachments};
}

export function normalizeRequest(input: any, allowUnbound = false) {
	assertKeys(input, ['requestKey', 'postId', 'network', 'localAccountId', 'scheduledAt', 'target']);
	const requestKey = identifier(input.requestKey, 128);
	const postId = boundedInteger(input.postId, 1, Number.MAX_SAFE_INTEGER);
	const network = identifier(input.network, 20);
	if (!networks.includes(network)) {
		throw problem(400, 'local_publication_network_invalid');
	}
	const localAccountId = allowUnbound && (input.localAccountId === undefined || input.localAccountId === '') ? '' : identifier(input.localAccountId, 200);
	if (typeof input.scheduledAt !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(input.scheduledAt) || !Number.isFinite(Date.parse(input.scheduledAt))) {
		throw problem(400, 'local_publication_schedule_invalid');
	}
	const target = input.target ?? {};
	if (['twitter', 'bluesky'].includes(network)) {
		assertKeys(target, ['sensitive']);
		if (target.sensitive !== undefined && typeof target.sensitive !== 'boolean') {
			throw problem(400, 'local_publication_target_invalid');
		}
		return {requestKey, postId, network, localAccountId, scheduledAt: new Date(input.scheduledAt).toISOString(), target: target.sensitive === undefined ? {} : {sensitive: target.sensitive}};
	}
	if (network === 'discord') {
		assertKeys(target, ['channelId', 'guildId', 'sensitive']);
		if ((!(allowUnbound && !localAccountId && target.channelId === undefined) && (typeof target.channelId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(target.channelId))) || (target.sensitive !== undefined && typeof target.sensitive !== 'boolean') ||
			(target.guildId !== undefined && (typeof target.guildId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(target.guildId)))) {
			throw problem(400, 'local_publication_target_invalid');
		}
		return {requestKey, postId, network, localAccountId, scheduledAt: new Date(input.scheduledAt).toISOString(), target: {
			...(target.channelId === undefined ? {} : {channelId: target.channelId}), ...(target.guildId === undefined ? {} : {guildId: target.guildId}), ...(target.sensitive === undefined ? {} : {sensitive: target.sensitive})}};
	}
	if (network === 'telegram') {
		assertKeys(target, ['chatId', 'sensitive']);
		if ((!(allowUnbound && !localAccountId && target.chatId === undefined) && (typeof target.chatId !== 'string' || !/^(?:-?[1-9][0-9]{0,19}|@[A-Za-z][A-Za-z0-9_]{4,31})$/.test(target.chatId))) ||
			(target.sensitive !== undefined && typeof target.sensitive !== 'boolean')) {
			throw problem(400, 'local_publication_target_invalid');
		}
		return {requestKey, postId, network, localAccountId, scheduledAt: new Date(input.scheduledAt).toISOString(), target: {
			...(target.chatId === undefined ? {} : {chatId: target.chatId}), ...(target.sensitive === undefined ? {} : {sensitive: target.sensitive})}};
	}
	if (network === 'rule34xxx') {
		assertKeys(target, ['tags', 'source', 'rating']);
		const tags = textField(target.tags, 10000);
		const source = textField(target.source, 2000);
		if (!['s', 'q', 'e'].includes(target.rating)) {
			throw problem(400, 'local_publication_target_invalid');
		}
		let url;
		try {
			url = new URL(source);
		} catch {
			throw problem(400, 'local_publication_target_invalid');
		}
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || [...url.searchParams.keys()].some(key => /token|authorization|api.?key|secret/i.test(key))) {
			throw problem(400, 'local_publication_target_invalid');
		}
		return {requestKey, postId, network, localAccountId, scheduledAt: new Date(input.scheduledAt).toISOString(), target: {tags, source, rating: target.rating}};
	}
	assertKeys(target, ['subreddit', 'title', 'flairId', 'kind']);
	const normalizedTarget = {};
	for (const key of ['subreddit', 'title', 'flairId', 'kind']) {
		if (target[key] !== undefined && target[key] !== '') {
			normalizedTarget[key] = textField(target[key], key === 'title' ? 300 : 100);
		}
	}
	if (target.kind !== undefined && !['self', 'link', 'image'].includes(target.kind)) {
		throw problem(400, 'local_publication_target_invalid');
	}
	return {requestKey, postId, network, localAccountId, scheduledAt: new Date(input.scheduledAt).toISOString(), target: normalizedTarget};
}

function normalizeAccounts(input) {
	assertKeys(input, ['accounts', 'jobId', 'groupIds', 'routes']);
	if (!Array.isArray(input.accounts) || input.accounts.length > 100) {
		throw problem(400, 'local_publication_accounts_invalid');
	}
	return input.accounts.map(account => {
		assertKeys(account, ['network', 'localAccountId']);
		if (!networks.includes(account.network)) {
			throw problem(400, 'local_publication_network_invalid');
		}
		return {network: account.network, localAccountId: identifier(account.localAccountId, 200)};
	});
}

function normalizeGroupIds(value) {
	const values = typeof value === 'string' ? (value ? value.split(',') : []) : value;
	if (!Array.isArray(values) || values.length > 100) {
		throw problem(400, 'local_publication_groups_invalid');
	}
	const ids = values.map(id => boundedInteger(id, 1, Number.MAX_SAFE_INTEGER));
	if (new Set(ids).size !== ids.length) {
		throw problem(400, 'local_publication_groups_invalid');
	}
	return ids;
}
function normalizeRoutes(value, accounts) {
	if (!Array.isArray(value) || value.length > 100) {
		throw problem(400, 'local_publication_routes_invalid');
	}
	const routes = value.map(route => {
		assertKeys(route, ['groupId', 'network', 'localAccountId', 'target']);
		const groupId = boundedInteger(route.groupId, 1, Number.MAX_SAFE_INTEGER);
		const localAccountId = identifier(route.localAccountId, 200);
		if (!accounts.some(account => account.network === route.network && account.localAccountId === localAccountId)) {
			throw problem(400, 'local_publication_routes_invalid');
		}
		const target = route.target ?? {};
		assertKeys(target, route.network === 'discord' ? ['channelId', 'guildId', 'sfwChannelId'] : route.network === 'telegram' ? ['chatId', 'sfwChatId'] : []);
		if (Object.keys(target).length) {
			const {sfwChannelId, sfwChatId, ...primary} = target;
			normalizeRequest({requestKey: 'route', postId: 1, network: route.network, localAccountId, scheduledAt: '2000-01-01T00:00:00Z', target: primary});
			if (sfwChannelId !== undefined || sfwChatId !== undefined) {
				normalizeRequest({requestKey: 'route', postId: 1, network: route.network, localAccountId, scheduledAt: '2000-01-01T00:00:00Z',
					target: {...primary, ...(sfwChannelId === undefined ? {} : {channelId: sfwChannelId}), ...(sfwChatId === undefined ? {} : {chatId: sfwChatId})}});
			}
		}
		return {groupId, network: route.network, localAccountId, target};
	});
	if (new Set(routes.map(route => `${route.groupId}:${route.network}`)).size !== routes.length) {
		throw problem(400, 'local_publication_routes_invalid');
	}
	return routes;
}

function normalizeResult(input, network) {
	assertKeys(input, ['claimToken', 'status', 'remoteId', 'remoteUrl', 'error']);
	identifier(input.claimToken, 64);
	if (!['posted', 'failed', 'needs_review'].includes(input.status)) {
		throw problem(400, 'local_publication_result_invalid');
	}
	const remoteId = input.remoteId == null || input.remoteId === '' ? null : textField(input.remoteId, 500);
	const remoteUrl = input.remoteUrl == null || input.remoteUrl === '' ? null : textField(input.remoteUrl, 2000);
	if (remoteUrl) {
		let url;
		try {
			url = new URL(remoteUrl);
		} catch {
			throw problem(400, 'local_publication_remote_url_invalid');
		}
		const rule34Link = network === 'rule34xxx' && url.hostname === 'rule34.xxx' && url.port === '' && url.pathname === '/index.php' &&
			[...url.searchParams.keys()].sort().join(',') === 'id,page,s' && url.searchParams.get('page') === 'post' &&
			url.searchParams.get('s') === 'view' && /^[1-9][0-9]*$/.test(remoteId || '') && url.searchParams.get('id') === remoteId;
		if (url.protocol !== 'https:' || url.username || url.password || (url.search && !rule34Link) || url.hash) {
			throw problem(400, 'local_publication_remote_url_invalid');
		}
	}
	if (input.status === 'posted' && !remoteId) {
		throw problem(400, 'local_publication_remote_id_required');
	}
	return {status: input.status, remoteId, remoteUrl, error: input.error == null || input.error === '' ? null : textField(input.error, 500)};
}

function matchRequest(job, hash) {
	if (!job || job.requestHash !== hash) {
		throw problem(409, 'local_publication_request_conflict');
	}
	return plain(job);
}
function plain(job) {
	const value = job.toJSON();
	delete value.requestHash;
	delete value.composeHash;
	delete value.userId;
	return value;
}
function assertKeys(value, allowed) {
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) {
		throw problem(400, 'local_publication_input_invalid');
	}
}
function identifier(value, max) {
	if (typeof value !== 'string' || !value || value.length > max || !/^[A-Za-z0-9_.:-]+$/.test(value)) {
		throw problem(400, 'local_publication_identifier_invalid');
	}
	return value;
}
function textField(value, max) {
	if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
		throw problem(400, 'local_publication_text_invalid');
	}
	return value;
}
function boundedInteger(value, min, max) {
	if (!/^(0|[1-9]\d*)$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
		throw problem(400, 'local_publication_integer_invalid');
	}
	return Number(value);
}
function problem(status, code) {
	return new ApiProblemError(status, code, code.replaceAll('_', ' '));
}
