import {getDeviantArtOAuthMethods} from './deviantartOAuth.js';
import {normalizeDeviantArtTarget} from './deviantartTarget.js';
import {getQueueShuffleMethods} from './queueShuffle.js';
import {normalizeContentType} from './contentPolicy.js';
import {createHash, randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {contentTextToRichText, richTextToPlainText} from '../../richText.js';
import {Op, literal, type Order} from 'sequelize';
import {IGeesomeApp} from '../../interface.js';
import {ApiProblemError} from '../api/problem.js';
import {getPublicApiContext} from '../api/publicUrls.js';
import {PostStatus} from '../group/interface.js';
import ISocNetPublishingModule from './interface.js';
import {getServerAccountMethods} from './serverAccounts.js';
import {createServerPublisher} from './serverPublisher.js';
import {createNativePublisher} from './nativePublisher.js';
import {getDestinationGroupMethods} from './destinationGroups.js';
import {getDestinationMethods} from './destinations.js';
import {getOutboxMethods} from './outbox.js';
import {getSourceMethods, isOwnedQueueGroup} from './sources.js';

const networks = ['threads', 'instagram', 'reddit', 'twitter', 'rule34xxx', 'bluesky', 'discord', 'telegram', 'patreon', 'geesome', 'deviantart'];
const statuses = ['queued', 'processing', 'posted', 'failed', 'needs_review', 'cancelled'];

export default async function socNetPublishing(app: IGeesomeApp) {
	app.checkModules(['api', 'database', 'group', 'asset']);
	const models = await (await import('./models.js')).default(app.ms.database.sequelize);
	const module = getModule(app, models);
	(await import('./api.js')).default(app, module);
	module.setCronWorker((await import('./cron.js')).default(app, module));
	return module;
}

export function getModule(app: IGeesomeApp, {PublicationJob, PublicationDestination, PublicationDestinationGroup, PublicationQueueShuffle, PublicationOAuthFlow}: any, options: any = {}): ISocNetPublishingModule {
	const sequelize = PublicationJob.sequelize;
	const destinations = getDestinationMethods(PublicationDestination, {app, normalizeRequest, problem, boundedInteger, loadServerAccount: (userId, accountId, network, identity) => serverAccounts.loadServerAccount(userId, accountId, network, identity)});
	const serverAccounts = getServerAccountMethods(app, PublicationDestination, {normalizeRequest, problem, boundedInteger}, options);
	const native = createNativePublisher(app, {PublicationJob, PublicationDestination});
	let cronWorker = null;
	let publisher;
	let serverScanCursor = null;
	const module: ISocNetPublishingModule = {
		...serverAccounts,
		...getDeviantArtOAuthMethods(app, {PublicationOAuthFlow, PublicationDestination}, serverAccounts, options),
		...getQueueShuffleMethods(app, {PublicationJob, PublicationDestination, PublicationQueueShuffle}, {problem}, options),
		...getDestinationGroupMethods(PublicationDestinationGroup, PublicationDestination, {problem, boundedInteger}),
		setCronWorker(worker) { cronWorker = worker; },
		async stop() { await cronWorker?.stop(); cronWorker = null; },
		async processServerQueue(input = {}) {
			publisher ||= createServerPublisher(app, module, {...options, native});
			return publisher.process(input);
		},
		listDestinations: destinations.listDestinations,
		disableDestination: destinations.disableDestination,
		registerDestinations: destinations.registerDestinations,
		...getOutboxMethods(app, PublicationJob, {normalizeRequest, snapshot, plain, problem, boundedInteger, groupIds: normalizeGroupIds, jobViews, resolveDestination: destinations.resolveDestination, PublicationDestination}),
		...getSourceMethods(app, {problem, boundedInteger}),
		async flushDatabase() {
			await PublicationOAuthFlow?.destroy({where: {}});
			await PublicationQueueShuffle?.destroy({where: {}});
			await PublicationJob.destroy({where: {}});
			await PublicationDestinationGroup?.destroy({where: {}});
			await PublicationDestination.destroy({where: {}});
		},
		async createJob(userId, input) {
			const request = normalizeRequest(input);
			if (['geesome', 'deviantart'].includes(request.network)) {
				throw problem(400, 'local_publication_destination_required');
			}
			const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
			const where = {userId, requestKey: request.requestKey};
			const existing = await PublicationJob.findOne({where});
			if (existing) {
				return matchOwnedRequest(existing, requestHash);
			}
			const post = await assertSource(app, userId, request.postId);
			const payload = await snapshot(app, post);
			if (request.network === 'patreon' && (!payload.text.startsWith(request.target.teaserText) || payload.text.length <= request.target.teaserText.length || !payload.attachments.length)) {
				throw problem(400, 'local_publication_target_invalid');
			}
			try {
				return {...plain(await PublicationJob.create({...request, intentVersion: 6, userId, requestHash, payload, status: 'queued'})), groupId: post.groupId};
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
			if (query.destinationId !== undefined) {
				where.destinationId = boundedInteger(query.destinationId, 1, Number.MAX_SAFE_INTEGER);
			}
			if (query.network !== undefined) {
				if (!networks.includes(query.network)) {
					throw problem(400, 'local_publication_network_invalid');
				}
				where.network = query.network;
			}
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
			if (query.order !== undefined && query.order !== 'queue') {
				throw problem(400, 'local_publication_order_invalid');
			}
			const order: Order = query.order === 'queue' ? [
				[literal(`CASE WHEN "status" = 'queued' THEN 0 ELSE 1 END`), 'ASC'],
				[literal(`CASE WHEN "status" = 'queued' THEN "scheduledAt" END`), 'ASC'],
				[literal(`CASE WHEN "status" = 'queued' THEN "id" END`), 'ASC'],
				['scheduledAt', 'DESC'], ['id', 'DESC']
			] : [['createdAt', 'DESC'], ['id', 'DESC']];
			return jobViews(await PublicationJob.findAll({where, limit, offset, order}));
		},
		async claimServerJob() {
			const Account = app.ms.database?.sequelize?.models?.socNetAccount;
			if (!Account) {
				return null;
			}
			const quote = table => sequelize.getQueryInterface().queryGenerator.quoteTable(table.getTableName());
			const eligible = literal(`(SELECT d."id" FROM ${quote(PublicationDestination)} d JOIN ${quote(Account)} a ON a."id"=d."socNetAccountId" AND a."userId"=d."userId" AND a."socNet"=d."network" AND a."accountId"=d."accountIdentity" WHERE d."enabled"=true AND d."executionMode"='server' AND a."serverCredentialsEncrypted" IS NOT NULL)`);
			for (let checked = 0; checked < 20; checked++) {
				const candidate = await PublicationJob.findOne({where: {executionMode: 'server', intentVersion: 6, status: 'queued', destinationId: {[Op.in]: eligible}, scheduledAt: {[Op.lte]: new Date()}, ...(serverScanCursor ? {[Op.or]: [{scheduledAt: {[Op.gt]: serverScanCursor.scheduledAt}}, {scheduledAt: serverScanCursor.scheduledAt, id: {[Op.gt]: serverScanCursor.id}}]} : {})}, order: [['scheduledAt', 'ASC'], ['id', 'ASC']]});
				if (!candidate) {
					serverScanCursor = null;
					return null;
				}
				serverScanCursor = {scheduledAt: candidate.scheduledAt, id: candidate.id};
				const destination = await PublicationDestination.findOne({where: {id: candidate.destinationId, userId: candidate.userId, executionMode: 'server', enabled: true}});
				if (!destination || destination.socNetAccountId !== candidate.serverAccountId || destination.accountIdentity !== candidate.accountIdentity) {
					continue;
				}
				let account;
				try {
					account = await serverAccounts.loadServerAccount(candidate.userId, candidate.serverAccountId, candidate.network, candidate.accountIdentity);
				} catch {
					continue;
				}
				const job = await sequelize.transaction(async transaction => {
					const enabled = await PublicationDestination.findOne({where: {id: destination.id, userId: candidate.userId, executionMode: 'server', enabled: true}, transaction, lock: transaction.LOCK.SHARE});
					if (!enabled) {
						return null;
					}
					const locked = await PublicationJob.findOne({where: {id: candidate.id, intentVersion: 6, executionMode: 'server', status: 'queued', scheduledAt: {[Op.lte]: new Date()}}, transaction, lock: transaction.LOCK.UPDATE, skipLocked: true});
					if (!locked) {
						return null;
					}
					await locked.update({status: 'processing', processingAt: new Date(), claimToken: randomBytes(32).toString('hex')}, {transaction});
					return locked;
				});
				if (!job) {
					continue;
				}
				try {
					const source = await assertSource(app, job.userId, job.postId);
					if (!isOwnedQueueGroup(source.group, job.userId) || destination.sourceGroupId != null && Number(destination.sourceGroupId) !== Number(source.groupId)) {
						throw problem(403, 'local_publication_source_forbidden');
					}
				} catch (error) {
					if (!(error instanceof ApiProblemError)) {
						throw error;
					}
					await job.update({status: 'failed', error: 'Source is no longer eligible for server publication.'});
					continue;
				}
				return {job: job.toJSON(), account};
			}
			return null;
		},
		async claimDestinationJob(userId, clientId, input) {
			assertClaimVersion(input);
			assertKeys(input, ['intentVersion', 'destinationIds', 'jobId']);
			if (!Array.isArray(input.destinationIds) || input.destinationIds.length > 100) {
				throw problem(400, 'local_publication_destinations_invalid');
			}
			const destinationIds = input.destinationIds.map(id => boundedInteger(id, 1, Number.MAX_SAFE_INTEGER));
			if (new Set(destinationIds).size !== destinationIds.length) {
				throw problem(400, 'local_publication_destination_duplicate');
			}
			return this.claimJob(userId, {intentVersion: input.intentVersion, accounts: [], ...(input.jobId === undefined ? {} : {jobId: input.jobId})}, {clientId, destinationIds});
		},
		async claimJob(userId, input, clientContext?) {
			assertClaimVersion(input);
			const accounts = normalizeAccounts(input);
			const groupIds = input.groupIds === undefined ? null : normalizeGroupIds(input.groupIds);
			const routes = normalizeRoutes(input.routes ?? [], accounts);
			const jobId = input.jobId === undefined ? null : boundedInteger(input.jobId, 1, Number.MAX_SAFE_INTEGER);
			if (!accounts.length && !clientContext) {
				return null;
			}
			// Commit ownership before group APIs run: they can need another DB query.
			// Keeping the transaction open would deadlock a saturated connection pool.
			for (let checked = 0; checked < 20; checked++) {
				const job = await sequelize.transaction(async transaction => {
					const registered = clientContext ? await PublicationDestination.findAll({where: {userId, clientId: clientContext.clientId,
						enabled: true, executionMode: 'client', id: {[Op.in]: clientContext.destinationIds}}, transaction, lock: transaction.LOCK.SHARE}) : [];
					const destinationFilter = clientContext ? {clientId: clientContext.clientId, executionMode: 'client', destinationId: {[Op.in]: registered.map(row => row.id)}} : {destinationId: null};
					const candidate = await PublicationJob.findOne({
						where: {userId, intentVersion: 6, ...destinationFilter, status: 'queued', ...(jobId ? {id: jobId} : {scheduledAt: {[Op.lte]: new Date()}}),
							...(groupIds ? {postId: postsInGroups(groupIds)} : {}),
							...(clientContext ? {} : {[Op.or]: input.routes === undefined ? accounts : routes.map(route => ({network: route.network,
								localAccountId: {[Op.in]: ['', route.localAccountId]}, postId: postsInGroups([route.groupId])}))})},
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
						const target = {...fallback, ...candidate.target};
						const normalized = normalizeRequest({contentType: candidate.contentType, requestKey: candidate.requestKey, postId: candidate.postId,
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
					if (clientContext) {
						const destination = await PublicationDestination.findByPk(job.destinationId);
						if (!destination || destination.sourceGroupId != null && Number(destination.sourceGroupId) !== Number(source.groupId)) {
							throw problem(403, 'local_publication_source_forbidden');
						}
					}
					if ((clientContext || groupIds || input.routes !== undefined) && !isOwnedQueueGroup(source.group, userId)) {
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
		async reportResult(userId, jobId, input, clientId?) {
			return sequelize.transaction(async transaction => {
				const job = await getOwnedJob(userId, jobId, transaction);
				if (job.executionMode === 'native' || (job.executionMode === 'server' ? clientId !== 'server' : job.destinationId && job.clientId !== clientId)) {
					throw problem(403, 'local_publication_client_mismatch');
				}
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
				await job.update({...result, ...(result.status === 'posted' && !job.confirmedAt ? {confirmedAt: new Date()} : {})}, {transaction});
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
	return module;
	async function matchOwnedRequest(job, hash) {
		if (job.intentVersion !== 6) {
			throw problem(409, 'publication_upgrade_required');
		}
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

export function normalizeRequest(input: any, allowUnbound = false): any {
	assertKeys(input, ['requestKey', 'postId', 'network', 'localAccountId', 'scheduledAt', 'target', 'contentType']);
	const contentType = normalizeContentType(input.contentType);
	const requestKey = identifier(input.requestKey, 128);
	const postId = boundedInteger(input.postId, 1, Number.MAX_SAFE_INTEGER);
	const network = identifier(input.network, 20);
	if (!networks.includes(network)) {
		throw problem(400, 'local_publication_network_invalid');
	}
	if (network === 'geesome') {
		if (input.localAccountId !== undefined && input.localAccountId !== null && input.localAccountId !== '') {
			throw problem(400, 'local_publication_target_invalid');
		}
		if (typeof input.scheduledAt !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(input.scheduledAt) || !Number.isFinite(Date.parse(input.scheduledAt))) {
			throw problem(400, 'local_publication_schedule_invalid');
		}
		const target = input.target ?? {};
		assertKeys(target, ['groupId']);
		if (target.groupId === undefined && allowUnbound) {
			return {requestKey, postId, network, localAccountId: null, contentType, scheduledAt: new Date(input.scheduledAt).toISOString(), target: {}};
		}
		if (!Number.isSafeInteger(target.groupId) || target.groupId < 1) {
			throw problem(400, 'local_publication_target_invalid');
		}
		return {requestKey, postId, network, localAccountId: null, contentType, scheduledAt: new Date(input.scheduledAt).toISOString(), target: {groupId: target.groupId}};
	}
	const localAccountId = allowUnbound && (input.localAccountId === undefined || input.localAccountId === '') ? '' : identifier(input.localAccountId, 200);
	if (typeof input.scheduledAt !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(input.scheduledAt) || !Number.isFinite(Date.parse(input.scheduledAt))) {
		throw problem(400, 'local_publication_schedule_invalid');
	}
	const target = input.target ?? {};
	if (network === 'deviantart') {
		return {requestKey, postId, network, localAccountId, contentType, scheduledAt: new Date(input.scheduledAt).toISOString(), target: normalizeDeviantArtTarget(target)};
	}
	if (network === 'patreon') {
		assertKeys(target, ['title', 'audience', 'teaserText', 'campaignId']);
		const title = textField(target.title, 200);
		if (!['free_members', 'paid_members'].includes(target.audience) || typeof target.teaserText !== 'string' ||
			!target.teaserText.trim() || target.teaserText.length > 10000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(target.teaserText) ||
			(!(allowUnbound && !localAccountId && target.campaignId === undefined) &&
				(typeof target.campaignId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(target.campaignId)))) {
			throw problem(400, 'local_publication_target_invalid');
		}
		return {requestKey, postId, network, localAccountId, contentType, scheduledAt: new Date(input.scheduledAt).toISOString(),
			target: {title, audience: target.audience, teaserText: target.teaserText, ...(target.campaignId === undefined ? {} : {campaignId: target.campaignId})}};
	}
	if (['twitter', 'bluesky'].includes(network)) {
		assertKeys(target, []);
		return {requestKey, postId, network, localAccountId, contentType, scheduledAt: new Date(input.scheduledAt).toISOString(), target: {}};
	}
	if (network === 'discord') {
		assertKeys(target, ['channelId', 'guildId']);
		if ((!(allowUnbound && !localAccountId && target.channelId === undefined) && (typeof target.channelId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(target.channelId))) ||
			(target.guildId !== undefined && (typeof target.guildId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(target.guildId)))) {
			throw problem(400, 'local_publication_target_invalid');
		}
		return {requestKey, postId, network, localAccountId, contentType, scheduledAt: new Date(input.scheduledAt).toISOString(), target: {
			...(target.channelId === undefined ? {} : {channelId: target.channelId}), ...(target.guildId === undefined ? {} : {guildId: target.guildId})}};
	}
	if (network === 'telegram') {
		assertKeys(target, ['chatId']);
		if ((!(allowUnbound && !localAccountId && target.chatId === undefined) && (typeof target.chatId !== 'string' || !/^(?:-?[1-9][0-9]{0,19}|@[A-Za-z][A-Za-z0-9_]{4,31})$/.test(target.chatId)))) {
			throw problem(400, 'local_publication_target_invalid');
		}
		return {requestKey, postId, network, localAccountId, contentType, scheduledAt: new Date(input.scheduledAt).toISOString(), target: {
			...(target.chatId === undefined ? {} : {chatId: target.chatId})}};
	}
	if (network === 'rule34xxx') {
		assertKeys(target, ['tags', 'source']);
		const tags = textField(target.tags, 10000);
		const source = textField(target.source, 2000);
		let url;
		try {
			url = new URL(source);
		} catch {
			throw problem(400, 'local_publication_target_invalid');
		}
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || [...url.searchParams.keys()].some(key => /token|authorization|api.?key|secret/i.test(key))) {
			throw problem(400, 'local_publication_target_invalid');
		}
		return {requestKey, postId, network, localAccountId, contentType, scheduledAt: new Date(input.scheduledAt).toISOString(), target: {tags, source}};
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
	return {requestKey, postId, network, localAccountId, contentType, scheduledAt: new Date(input.scheduledAt).toISOString(), target: normalizedTarget};
}

function assertClaimVersion(input) {
	if (input?.intentVersion !== 6) {
		throw problem(409, 'publication_upgrade_required');
	}
}

function normalizeAccounts(input) {
	assertKeys(input, ['intentVersion', 'accounts', 'jobId', 'groupIds', 'routes']);
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
		assertKeys(target, route.network === 'discord' ? ['channelId', 'guildId'] : route.network === 'telegram' ? ['chatId'] : route.network === 'patreon' ? ['campaignId'] : []);
		if (route.network === 'patreon') {
			if (typeof target.campaignId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(target.campaignId)) {
				throw problem(400, 'local_publication_routes_invalid');
			}
		} else if (Object.keys(target).length) {
			normalizeRequest({contentType: 'nsfw', requestKey: 'route', postId: 1, network: route.network, localAccountId, scheduledAt: '2000-01-01T00:00:00Z', target});
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
	value.upgradeRequired = value.intentVersion !== 6;
	if (value.upgradeRequired) {
		value.upgradeReason = 'Pre-upgrade intent cannot be claimed. Reconcile its provider outcome; cancel queued work before creating a new explicit intent.';
	}
	delete value.requestHash;
	delete value.composeHash;
	delete value.serverAccountId;
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
