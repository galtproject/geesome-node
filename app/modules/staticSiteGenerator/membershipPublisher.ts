import debug from 'debug';
import helpers from '../../helpers.js';
import {randomUUID} from 'node:crypto';
import {Op} from 'sequelize';
import {siteProblem} from '../api/browserSession.js';
import {buildMembershipSnapshots} from './membershipPublication.js';
import {createPublicationBuildMetrics} from './publicationMetrics.js';
import type {PublicationAttemptMetrics} from './publicationMetrics.js';
import {createMembershipPublicationStaging, publicationStagingPath} from './membershipPublicationStaging.js';

const log = debug('geesome:membership:publication');

export const publicationState = row => row.data?.publication || {sourceVersion: 0, publicationId: null};
export async function savePublicationState(row, state, transaction) {
	await row.update({data: {...row.data, publication: state}}, {transaction});
}

// This worker owns paired immutable publication. Membership supplies resource
// locking/validation; access to an already obtained CID never invokes it.
export function createMembershipPublisher(app, M, membership, dependencies) {
	const clock = membership.clock, database = app.ms.database.sequelize;
	const staging = createMembershipPublicationStaging(app, M, clock);
	let timer, running = false;
	async function enqueue(resourceId, requestKey, transaction?) {
		const [job] = await M.publications.findOrCreate({where: {resourceId, requestKey}, defaults: {id: randomUUID(), status: 'queued'}, transaction});
		return job;
	}
	async function build(job) {
		const start = performance.now();
		const metrics: PublicationAttemptMetrics = {...createPublicationBuildMetrics(), queueMs: job.queueMs, jobAgeMs: Math.max(0, clock().getTime() - new Date(job.createdAt).getTime()), leaseUpdates: 0};
		let lastRenewed = -Infinity, renewing, heartbeatError, result, committed = false;
		const interval = Math.min(dependencies.publicationHeartbeatMs || 30000, 30000);
		const renew = async (force = false) => {
			if (heartbeatError) {
				throw heartbeatError;
			}
			if (renewing) {
				return renewing;
			}
			if (!force && performance.now() - lastRenewed < interval) {
				return;
			}
			renewing = (async () => {
				try {
					const [count] = await M.publications.update({leaseUntil: new Date(clock().getTime() + 120000)}, {where: {id: job.id, leaseToken: job.leaseToken, status: 'building'}});
					metrics.leaseUpdates++;
					if (!count) {
						siteProblem(409, 'publication_lease_lost');
					}
					lastRenewed = performance.now();
				} catch (error) {
					heartbeatError = error;
					throw error;
				} finally {
					renewing = null;
				}
			})();
			return renewing;
		};
		const heartbeat = setInterval(() => { renew(true).catch(() => {}); }, interval);
		heartbeat.unref();
		try {
			await renew(true);
			await staging.cleanup(job);
			const row = await membership.owner((await membership.resource(job.resourceId)).ownerId, job.resourceId);
			const sourceVersion = publicationState(row).sourceVersion;
			const group = await app.ms.group.getLocalGroup(row.ownerId, row.groupId);
			const options = await M.options.findAll({where: {resourceId: row.id, enabled: true}, order: [['amountCents', 'ASC']]});
			const previous = publicationState(row).publicationId ? await M.publications.findByPk(publicationState(row).publicationId) : null;
			const previousManifest = previous?.status === 'ready' && previous.resourceId === row.id ? previous.manifest : null;
			const mode = publicationAssemblyMode();
			result = await buildMembershipSnapshots(app, row, group.title, {previousManifest, metrics, assemblyMode: job.attempts > 1 && mode === 'incremental' ? 'full' : mode, options, description: group.description, renew, beginDirectory: async variant => {
				const directory = publicationStagingPath(job.id, job.leaseToken, variant);
				job.stagingPaths = [...job.stagingPaths, directory];
				await renew(true);
				await database.transaction(async transaction => {
					const fresh = await M.publications.findByPk(job.id, {transaction, lock: transaction.LOCK.UPDATE});
					if (fresh?.leaseToken !== job.leaseToken || fresh.status !== 'building') {
						siteProblem(409, 'publication_lease_lost');
					}
					await staging.rememberPath(directory, job.id, job.leaseToken, transaction);
					await fresh.update({stagingPaths: job.stagingPaths}, {transaction});
				});
				return directory;
			}});
			await renew(true);
			const commitStart = performance.now();
			await membership.serial(row.id, async (resource, transaction) => {
				const fresh = await M.publications.findByPk(job.id, {transaction, lock: transaction.LOCK.UPDATE});
				if (heartbeatError) {
					throw heartbeatError;
				}
				const state = publicationState(resource);
				if (!fresh || fresh.leaseToken !== job.leaseToken || fresh.status !== 'building' || new Date(fresh.leaseUntil).getTime() <= clock().getTime() || state.sourceVersion !== sourceVersion) {
					siteProblem(409, 'publication_source_changed');
				}
				await M.publication_artifacts.bulkCreate([...result.artifacts].map(storageId => ({storageId})), {ignoreDuplicates: true, transaction});
				await M.publication_staging.destroy({where: {jobId: job.id, leaseToken: job.leaseToken}, transaction});
				await fresh.update({status: 'ready', manifest: result.manifest, sourceVersion, leaseToken: null, leaseUntil: null, error: null}, {transaction});
				const previous = state.publicationId ? await M.publications.findByPk(state.publicationId, {transaction}) : null;
				if (!previous || new Date(previous.createdAt) <= new Date(fresh.createdAt)) {
					await savePublicationState(resource, {...state, publicationId: job.id}, transaction);
				}
			});
			committed = true;
			metrics.commitMs = performance.now() - commitStart;
			metrics.buildToReadyMs = performance.now() - start;
			metrics.queueToReadyMs = metrics.queueMs + metrics.buildToReadyMs;
		} finally {
			clearInterval(heartbeat);
			await renewing?.catch(() => {});
			const cleanupStart = performance.now();
			try {
				await staging.cleanup(job);
			} finally {
				const event = {...result?.metrics, ...metrics, outcome: committed ? 'ready' : 'failed', attempt: job.attempts, cleanupMs: performance.now() - cleanupStart, attemptMs: performance.now() - start};
				helpers.logDebug(log, () => ['build', event]);
				dependencies.publicationMetrics?.(event);
			}
		}
	}
	return {
		enqueue,
		async runPublications() {
			if (running) {
				return;
			}
			running = true;
			try {
				await staging.reconcile();
				const job = await database.transaction(async transaction => {
					const row = await M.publications.findOne({where: {[Op.or]: [{status: 'queued', [Op.or]: [{nextAttemptAt: null}, {nextAttemptAt: {[Op.lte]: clock()}}]}, {status: 'building', leaseUntil: {[Op.lt]: clock()}}]}, order: [['createdAt', 'ASC']], transaction, lock: transaction.LOCK.UPDATE, skipLocked: true});
					if (!row) {
						return null;
					}
					const queueMs = Math.max(0, clock().getTime() - new Date(row.status === 'queued' ? row.updatedAt : row.leaseUntil).getTime());
					const claimed = await row.update({status: 'building', attempts: row.attempts + 1, leaseToken: randomUUID(), leaseUntil: new Date(clock().getTime() + 120000)}, {transaction});
					claimed.queueMs = queueMs;
					return claimed;
				});
				if (job) {
					try {
						await build(job);
					} catch (error) {
						// A temporary storage outage must not permanently strand a source
						// revision. Back off, keeping the last complete pair available.
						const delay = Math.min(300000, 10000 * 2 ** Math.min(job.attempts - 1, 5));
						await M.publications.update({status: 'queued', nextAttemptAt: new Date(clock().getTime() + delay), error: typeof error?.code === 'string' ? error.code : 'publication_build_failed', leaseToken: null, leaseUntil: null}, {where: {id: job.id, leaseToken: job.leaseToken, status: 'building'}});
					}
				}
			} finally {
				running = false;
			}
		},
		startPublications() {
			if (!timer) {
				timer = setInterval(() => this.runPublications().catch(error => console.error('membership publication worker', error)), 5000);
				timer.unref();
			}
		},
		async stop() {
			clearInterval(timer);
			timer = null;
			while (running) {
				await new Promise(resolve => setTimeout(resolve, 20));
			}
		}
	};
}

function publicationAssemblyMode() {
	const mode = process.env.GEESOME_PUBLICATION_ASSEMBLY || 'incremental';
	if (!['incremental', 'full', 'repair'].includes(mode)) {
		throw new Error('invalid_publication_assembly_mode');
	}
	return mode;
}
