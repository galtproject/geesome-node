import {createHash, randomInt} from 'node:crypto';
import {Op} from 'sequelize';
import {isOwnedQueueGroup} from './sources.js';

export function getQueueShuffleMethods(app, {PublicationJob: Job, PublicationDestination: Destination, PublicationQueueShuffle: Shuffle}, {problem}, options: any = {}) {
	const sequelize = Job.sequelize;
	return {
		async shuffleQueue(userId, input) {
			if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['requestKey', 'groupId', 'destinationIds'].includes(key)) ||
				typeof input.requestKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.requestKey) || !Number.isSafeInteger(input.groupId) || input.groupId < 1 ||
				!Array.isArray(input.destinationIds) || !input.destinationIds.length || input.destinationIds.length > 20 ||
				input.destinationIds.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(input.destinationIds).size !== input.destinationIds.length) {
				throw problem(400, 'publication_queue_shuffle_invalid');
			}
			const destinationIds = [...input.destinationIds].sort((a, b) => a - b);
			const requestHash = createHash('sha256').update(JSON.stringify({groupId: input.groupId, destinationIds})).digest('hex');
			const where = {userId, requestKey: input.requestKey};
			const replay = row => {
				if (row.requestHash !== requestHash) {
					throw problem(409, 'publication_queue_shuffle_conflict');
				}
				return row.result;
			};
			try {
				return await sequelize.transaction(async transaction => {
					const previous = await Shuffle.findOne({where, transaction});
					if (previous) {
						return replay(previous);
					}
					const {Group, Post} = app.ms.database.models;
					const group = await Group.findByPk(input.groupId, {transaction, lock: transaction.LOCK.SHARE});
					if (!isOwnedQueueGroup(group, userId)) {
						throw problem(403, 'publication_queue_shuffle_source_forbidden');
					}
					const destinations = await Destination.findAll({where: {userId, id: {[Op.in]: destinationIds}, enabled: true}, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE});
					if (destinations.length !== destinationIds.length || destinations.some(row => row.sourceGroupId != null && Number(row.sourceGroupId) !== input.groupId)) {
						throw problem(403, 'publication_queue_shuffle_destination_forbidden');
					}
					const generator = sequelize.getQueryInterface().queryGenerator;
					const posts = sequelize.literal(`(SELECT "id" FROM ${generator.quoteTable(Post.getTableName())} WHERE "groupId"=${input.groupId} AND "isDeleted"=false)`);
					const jobs = await Job.findAll({where: {userId, intentVersion: 6, status: 'queued', destinationId: {[Op.in]: destinationIds}, postId: {[Op.in]: posts}, scheduledAt: {[Op.gt]: new Date()}},
						limit: 10001, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE});
					if (jobs.length > 10000) {
						throw problem(409, 'publication_queue_shuffle_too_large');
					}
					const result: {requestKey: string; destinations: any[]} = {requestKey: input.requestKey, destinations: []};
					for (const destinationId of destinationIds) {
						const members = jobs.filter(job => job.destinationId === destinationId);
						const slots = members.map(job => new Date(job.scheduledAt)).sort((a, b) => a.getTime() - b.getTime());
						const shuffled = [...members];
						for (let index = shuffled.length - 1; index > 0; index--) {
							const other = (options.randomInt || randomInt)(index + 1);
							[shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
						}
						let changedJobs = 0;
						for (const [index, job] of shuffled.entries()) {
							if (new Date(job.scheduledAt).getTime() !== slots[index].getTime()) {
								await job.update({scheduledAt: slots[index]}, {transaction});
								changedJobs++;
							}
						}
						result.destinations.push({destinationId, queuedJobs: members.length, changedJobs});
					}
					await Shuffle.create({...where, requestHash, result}, {transaction});
					return result;
				});
			} catch (error) {
				if (error.name !== 'SequelizeUniqueConstraintError') {
					throw error;
				}
				const previous = await Shuffle.findOne({where});
				if (!previous) {
					throw error;
				}
				return replay(previous);
			}
		}
	};
}
