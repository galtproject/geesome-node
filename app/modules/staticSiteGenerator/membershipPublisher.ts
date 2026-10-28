import {randomUUID} from 'node:crypto';
import {Op} from 'sequelize';
import {siteProblem} from '../api/browserSession.js';
import {buildMembershipSnapshots} from './membershipPublication.js';

export const publicationState = row => row.data?.publication || {sourceVersion: 0, publicationId: null};
export async function savePublicationState(row, state, transaction) {
	await row.update({data: {...row.data, publication: state}}, {transaction});
}

// This worker owns paired immutable publication. Membership supplies resource
// locking/validation; access to an already obtained CID never invokes it.
export function createMembershipPublisher(app, M, membership, dependencies) {
	const clock = membership.clock, database = app.ms.database.sequelize;
	let timer, running = false;
	async function enqueue(resourceId, requestKey, transaction?) {
		const [job] = await M.publications.findOrCreate({where: {resourceId, requestKey}, defaults: {id: randomUUID(), status: 'queued'}, transaction});
		return job;
	}
	async function cleanup(job) {
		await database.transaction(async transaction => {
			// Wait for a possibly successful in-flight commit before removing MFS.
			const fresh = await M.publications.findByPk(job.id, {transaction, lock: transaction.LOCK.UPDATE});
			if (!fresh || fresh.status === 'ready' || fresh.leaseToken !== job.leaseToken) {
				return;
			}
			for (const path of fresh.stagingPaths) {
				if (!new RegExp(`^/membership-${job.id}-[a-f0-9-]{36}-(public|full)$`).test(path)) {
					throw new Error('invalid_publication_staging_path');
				}
				try {
					await app.ms.storage.node.files.rm(path, {recursive: true});
				} catch (error) {
					if (error?.code !== 'ERR_NOT_FOUND' && !/does not exist|not found/i.test(error?.message || '')) {
						throw error;
					}
				}
			}
			await fresh.update({stagingPaths: []}, {transaction});
			job.stagingPaths = [];
		});
	}
	async function build(job) {
		const renew = async () => {
			const [count] = await M.publications.update({leaseUntil: new Date(clock().getTime() + 120000)}, {where: {id: job.id, leaseToken: job.leaseToken, status: 'building'}});
			if (!count) {
				siteProblem(409, 'publication_lease_lost');
			}
		};
		let heartbeatError, heartbeatWork = Promise.resolve();
		const heartbeat = setInterval(() => {
			heartbeatWork = heartbeatWork.then(renew).catch(error => { heartbeatError = error; });
		}, dependencies.publicationHeartbeatMs || 30000);
		heartbeat.unref();
		try {
			await cleanup(job);
			const row = await membership.owner((await membership.resource(job.resourceId)).ownerId, job.resourceId);
			const sourceVersion = publicationState(row).sourceVersion;
			const group = await app.ms.group.getLocalGroup(row.ownerId, row.groupId);
			const options = await M.options.findAll({where: {resourceId: row.id, enabled: true}, order: [['amountCents', 'ASC']]});
			const previous = publicationState(row).publicationId ? await M.publications.findByPk(publicationState(row).publicationId) : null;
			const previousManifest = previous?.status === 'ready' && previous.resourceId === row.id ? previous.manifest : null;
			const result = await buildMembershipSnapshots(app, row, group.title, {previousManifest, options, description: group.description, renew, beginDirectory: async variant => {
				const directory = `/membership-${job.id}-${job.leaseToken}-${variant}`;
				job.stagingPaths = [...job.stagingPaths, directory];
				const [registered] = await M.publications.update({stagingPaths: job.stagingPaths}, {where: {id: job.id, leaseToken: job.leaseToken, status: 'building'}});
				if (!registered) {
					siteProblem(409, 'publication_lease_lost');
				}
				return directory;
			}});
			await membership.serial(row.id, async (resource, transaction) => {
				const fresh = await M.publications.findByPk(job.id, {transaction, lock: transaction.LOCK.UPDATE});
				if (heartbeatError) {
					throw heartbeatError;
				}
				const state = publicationState(resource);
				if (fresh.leaseToken !== job.leaseToken || fresh.status !== 'building' || state.sourceVersion !== sourceVersion) {
					siteProblem(409, 'publication_source_changed');
				}
				await M.publication_artifacts.bulkCreate([...result.artifacts].map(storageId => ({storageId})), {ignoreDuplicates: true, transaction});
				await fresh.update({status: 'ready', manifest: result.manifest, sourceVersion, leaseToken: null, leaseUntil: null, error: null}, {transaction});
				const previous = state.publicationId ? await M.publications.findByPk(state.publicationId, {transaction}) : null;
				if (!previous || new Date(previous.createdAt) <= new Date(fresh.createdAt)) {
					await savePublicationState(resource, {...state, publicationId: job.id}, transaction);
				}
			});
		} finally {
			clearInterval(heartbeat);
			await heartbeatWork;
			await cleanup(job);
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
				const job = await database.transaction(async transaction => {
					const row = await M.publications.findOne({where: {[Op.or]: [{status: 'queued', [Op.or]: [{nextAttemptAt: null}, {nextAttemptAt: {[Op.lte]: clock()}}]}, {status: 'building', leaseUntil: {[Op.lt]: clock()}}]}, order: [['createdAt', 'ASC']], transaction, lock: transaction.LOCK.UPDATE, skipLocked: true});
					return row?.update({status: 'building', attempts: row.attempts + 1, leaseToken: randomUUID(), leaseUntil: new Date(clock().getTime() + 120000)}, {transaction});
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
