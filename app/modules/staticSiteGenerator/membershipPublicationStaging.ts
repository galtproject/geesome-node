import {Op} from 'sequelize';

export function createMembershipPublicationStaging(app, M, clock) {
	const database = app.ms.database.sequelize, stagingJournal = M.publication_staging;
	async function rememberPath(path, jobId, leaseToken, transaction) {
		const parsed = parsePublicationStagingPath(path, jobId);
		if (parsed.leaseToken !== leaseToken) {
			throw new Error('invalid_publication_staging_path');
		}
		await stagingJournal.findOrCreate({where: {path}, defaults: {jobId, leaseToken, nextSweepAt: clock()}, transaction});
	}
	async function removePath(path) {
		try {
			await app.ms.storage.node.files.rm(path, {recursive: true, timeout: 30000});
		} catch (error) {
			if (error?.code !== 'ERR_NOT_FOUND' && !/does not exist|not found/i.test(error?.message || '')) {
				throw error;
			}
		}
	}
	async function reconcile() {
		// Tombstones survive successful removal: a timed-out remote cp can recreate
		// its old path later. Sweep bounded batches forever, including after restart.
		const paths = await stagingJournal.findAll({where: {nextSweepAt: {[Op.lte]: clock()}}, order: [['nextSweepAt', 'ASC'], ['path', 'ASC']], limit: 16});
		for (const candidate of paths) {
			await database.transaction(async transaction => {
				const job = await M.publications.findByPk(candidate.jobId, {transaction, lock: transaction.LOCK.UPDATE});
				const entry = await stagingJournal.findByPk(candidate.path, {transaction, lock: transaction.LOCK.UPDATE});
				if (!entry) {
					return;
				}
				const parsed = parsePublicationStagingPath(entry.path, entry.jobId);
				if (parsed.leaseToken !== entry.leaseToken) {
					throw new Error('invalid_publication_staging_path');
				}
				const winning = job?.status === 'ready' && job.stagingPaths.includes(entry.path);
				const active = job?.status === 'building' && job.leaseToken === entry.leaseToken;
				if (winning) {
					await entry.destroy({transaction});
					return;
				}
				if (!active) {
					await removePath(entry.path);
				}
				await entry.update({nextSweepAt: new Date(clock().getTime() + 60000)}, {transaction});
			});
		}
	}
	async function cleanup(job) {
		await database.transaction(async transaction => {
			// Wait for a possibly successful in-flight commit before removing MFS.
			const fresh = await M.publications.findByPk(job.id, {transaction, lock: transaction.LOCK.UPDATE});
			if (!fresh || fresh.status === 'ready' || fresh.leaseToken !== job.leaseToken) {
				return;
			}
			for (const path of fresh.stagingPaths) {
				const {leaseToken} = parsePublicationStagingPath(path, job.id);
				await rememberPath(path, job.id, leaseToken, transaction);
				await removePath(path);
			}
			await fresh.update({stagingPaths: []}, {transaction});
			job.stagingPaths = [];
		});
	}
	return {rememberPath, cleanup, reconcile};
}

export function publicationStagingPath(jobId, leaseToken, variant) {
	const path = `/membership-${jobId}-${leaseToken}-${variant}`;
	parsePublicationStagingPath(path, jobId);
	return path;
}

export function parsePublicationStagingPath(path, expectedJobId?) {
	const match = typeof path === 'string' && path.match(/^\/membership-([a-f0-9-]{36})-([a-f0-9-]{36})-(public|full)$/);
	if (!match || (expectedJobId !== undefined && match[1] !== expectedJobId)) {
		throw new Error('invalid_publication_staging_path');
	}
	return {jobId: match[1], leaseToken: match[2], variant: match[3]};
}
