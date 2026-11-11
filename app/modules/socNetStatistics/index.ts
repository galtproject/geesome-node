import {Op} from 'sequelize';
import {IGeesomeApp} from '../../interface.js';
import {ApiProblemError} from '../api/problem.js';
import {destinationView} from '../socNetPublishing/destinations.js';

const networks = ['threads', 'instagram', 'reddit', 'twitter', 'rule34xxx', 'bluesky', 'discord', 'telegram', 'patreon'];
export default async function socNetStatistics(app: IGeesomeApp) {
	app.checkModules(['api', 'database', 'socNetPublishing']);
	const models = await (await import('./models.js')).default(app.ms.database.sequelize);
	const module = getModule(app, models);
	(await import('./api.js')).default(app, module);
	return module;
}

export function getModule(app, models, options: any = {}) {
	const {SocialPostStatistic: PostStat, SocialGroupStatistic: GroupStat} = models;
	const sequelize = PostStat.sequelize;
	const Job = sequelize.models.publicationJob;
	const Destination = sequelize.models.publicationDestination;
	const now = options.now || (() => new Date());
	const modelFor = kind => kind === 'post' ? PostStat : GroupStat;
	const keyFor = kind => kind === 'post' ? 'jobId' : 'destinationId';
	async function entity(userId, kind, id, transaction?) {
		const row = await (kind === 'post' ? Job : Destination).findOne({where: {id: integer(id), userId}, transaction});
		if (!row || kind === 'post' && (row.status !== 'posted' || !row.remoteId)) {
			throw problem(404, 'social_statistics_entity_not_found');
		}
		return row;
	}
	async function latest(userId, kind, id) {
		const rows = await modelFor(kind).findAll({where: {userId, [keyFor(kind)]: id}, order: [['periodStart', 'DESC']], limit: 2});
		const current = rows[0]?.toJSON() || null;
		if (current && kind === 'group') {
			const before = rows[1]?.metrics?.followers;
			current.previousObservedAt = rows[1]?.observedAt || null;
			current.followerDelta = typeof current.metrics.followers === 'number' && typeof before === 'number' ? current.metrics.followers - before : null;
		}
		return current;
	}
	async function save(userId, observation, clientId, server = false, transaction?) {
		object(observation, ['kind', 'jobId', 'destinationId', 'observedAt', 'metrics']);
		kindCheck(observation.kind);
		const key = keyFor(observation.kind);
		if (observation[observation.kind === 'post' ? 'destinationId' : 'jobId'] !== undefined) {
			throw problem(400, 'social_statistics_input_invalid');
		}
		const row = await entity(userId, observation.kind, observation[key], transaction);
		if (server ? row.executionMode !== 'server' : row.executionMode !== 'client' || row.clientId !== clientId) {
			throw problem(403, 'social_statistics_executor_forbidden');
		}
		const date = new Date(observation.observedAt);
		if (typeof observation.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(observation.observedAt) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== observation.observedAt.slice(0, 10) || date.getTime() > now().getTime() + 300000) {
			throw problem(400, 'social_statistics_timestamp_invalid');
		}
		const fields = observation.kind === 'group' ? ['followers'] : ['likes', 'views', 'replies', 'reposts', 'reactions', 'score'];
		object(observation.metrics, fields);
		if (!Object.keys(observation.metrics).length || Object.entries(observation.metrics).some(([name, value]) => value !== null && (!Number.isSafeInteger(value) || name !== 'score' && Number(value) < 0))) {
			throw problem(400, 'social_statistics_metrics_invalid');
		}
		await modelFor(observation.kind).recordObservation({userId, [key]: row.id, periodStart: date.toISOString().slice(0, 10), observedAt: date, metrics: observation.metrics}, transaction);
	}
	return {
		async flushDatabase() {
			await PostStat.destroy({where: {}});
			await GroupStat.destroy({where: {}});
		},
		async record(userId, clientId, input) {
			object(input, ['observations']);
			if (!Array.isArray(input.observations) || !input.observations.length || input.observations.length > 100) {
				throw problem(400, 'social_statistics_input_invalid');
			}
			await sequelize.transaction(async transaction => {
				// Consistent lock order avoids deadlocks for overlapping concurrent batches.
				const sorted = [...input.observations].sort((a, b) => String(a?.kind).localeCompare(String(b?.kind)) || Number(a?.jobId || a?.destinationId) - Number(b?.jobId || b?.destinationId) || String(a?.observedAt).localeCompare(String(b?.observedAt)));
				for (const observation of sorted) {
					await save(userId, observation, clientId, false, transaction);
				}
			});
			return {accepted: input.observations.length};
		},
		async summary(userId, query: any = {}) {
			object(query, ['groupId', 'network', 'limit', 'offset', 'destinationOffset']);
			const limit = integer(query.limit ?? 20, 50), offset = integer(query.offset ?? 0, 1000000, 0), destinationOffset = integer(query.destinationOffset ?? 0, 1000000, 0);
			const where: any = {userId};
			if (query.network !== undefined) {
				if (!networks.includes(query.network)) {
					throw problem(400, 'social_statistics_network_invalid');
				}
				where.network = query.network;
			}
			const destinationWhere = {...where};
			if (query.groupId !== undefined) {
				const groupId = integer(query.groupId);
				const generator: any = sequelize.getQueryInterface().queryGenerator;
				const postTable = generator.quoteTable(sequelize.models.post.getTableName());
				where.postId = {[Op.in]: sequelize.literal(`(SELECT "id" FROM ${postTable} WHERE "groupId"=${groupId} AND "userId"=${integer(userId)})`)};
				destinationWhere.sourceGroupId = groupId;
			}
			const [jobs, destinations] = await Promise.all([
				Job.findAll({where: {...where, status: 'posted', remoteId: {[Op.ne]: null}}, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: limit + 1, offset}),
				Destination.findAll({where: destinationWhere, order: [['id', 'ASC']], limit: 51, offset: destinationOffset})
			]);
			const posts = [];
			for (const job of jobs.slice(0, limit)) {
				const post = await app.ms.group.getPostPure(job.postId);
				posts.push({jobId: job.id, postId: job.postId, groupId: post?.groupId || null, destinationId: job.destinationId,
					network: job.network, executionMode: job.executionMode, clientId: job.clientId, localAccountId: job.localAccountId,
					remoteId: job.remoteId, remoteUrl: job.remoteUrl, text: String(job.payload?.text || '').slice(0, 500), target: job.target, createdAt: job.createdAt,
					statistics: await latest(userId, 'post', job.id)});
			}
			return {period: 'day', timezone: 'UTC', posts, groups: await Promise.all(destinations.slice(0, 50).map(async destination => ({...destinationView(destination), statistics: await latest(userId, 'group', destination.id)}))),
				nextOffset: jobs.length > limit ? offset + limit : null, nextDestinationOffset: destinations.length > 50 ? destinationOffset + 50 : null};
		},
		async history(userId, query) {
			object(query, ['kind', 'id', 'limit']);
			kindCheck(query.kind);
			await entity(userId, query.kind, query.id);
			return {snapshots: await modelFor(query.kind).findAll({where: {userId, [keyFor(query.kind)]: integer(query.id)}, order: [['periodStart', 'DESC']], limit: integer(query.limit ?? 30, 365)})};
		},
		async refresh(userId, query: any = {}) {
			object(query, ['kind', 'id']);
			kindCheck(query.kind);
			const owned = await entity(userId, query.kind, query.id);
			if (owned.executionMode !== 'server') {
				throw problem(403, 'social_statistics_executor_forbidden');
			}
			const result = status => ({results: [{kind: query.kind, id: owned.id, status}]});
			try {
				const destination = query.kind === 'group' ? owned : await Destination.findOne({where: {id: owned.destinationId, userId, executionMode: 'server'}});
				if (!destination || query.kind === 'post' && (owned.serverAccountId !== destination.socNetAccountId || owned.accountIdentity !== destination.accountIdentity)) {
					throw problem(409, 'social_statistics_destination_changed');
				}
				const metrics = await app.ms.socNetAccount.getStatistics(userId, {accountId: destination.socNetAccountId, accountIdentity: destination.accountIdentity, network: owned.network, kind: query.kind, target: query.kind === 'post' ? owned.target : destination.target, remoteId: owned.remoteId});
				if (metrics === null) {
					return result('unsupported');
				}
				await save(userId, {kind: query.kind, [keyFor(query.kind)]: owned.id, observedAt: now().toISOString(), metrics}, null, true);
				return result('updated');
			} catch {
				return result('unavailable');
			}
		}
	};
}
function problem(status, code) {return new ApiProblemError(status, code, code);}
function object(value, fields) {
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) {
		throw problem(400, 'social_statistics_input_invalid');
	}
}
function integer(value, max = Number.MAX_SAFE_INTEGER, min = 1) {
	if (!['string', 'number'].includes(typeof value) || String(value).trim() === '' || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
		throw problem(400, 'social_statistics_input_invalid');
	}
	return Number(value);
}
function kindCheck(kind) {
	if (!['post', 'group'].includes(kind)) {
		throw problem(400, 'social_statistics_input_invalid');
	}
}
