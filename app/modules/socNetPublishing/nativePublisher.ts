import {randomBytes} from 'node:crypto';
import {Op} from 'sequelize';
import {ApiProblemError} from '../api/problem.js';
import {GroupType, PostStatus} from '../group/interface.js';
import {getPublicApiContext} from '../api/publicUrls.js';
import {assertContentPolicy} from './contentPolicy.js';
import {normalizeSourceImageSet} from './sourceImageSet.js';
import {isOwnedQueueGroup} from './sources.js';

const leaseMs = 5 * 60 * 1000;

export async function assertNativeTarget(app, userId, target) {
	if (!target || Object.keys(target).length !== 1 || !Number.isSafeInteger(target.groupId) || target.groupId < 1) {
		throw new ApiProblemError(400, 'native_publication_target_invalid', 'Select an existing public site group.');
	}
	const group = await app.ms.group.getGroup(target.groupId);
	if (!group || Number(group.creatorId) !== Number(userId) || group.type !== GroupType.Channel || !group.isPublic || group.isEncrypted || group.isDeleted || group.isRemote ||
		!await app.ms.group.canCreatePostInGroup(userId, group.id)) {
		throw new ApiProblemError(403, 'native_publication_target_forbidden', 'The site group is unavailable or publishing permission was revoked.');
	}
	return group;
}

export function createNativePublisher(app, {PublicationJob: Job, PublicationDestination: Destination}) {
	const sequelize = Job.sequelize;
	async function claim() {
		return sequelize.transaction(async transaction => {
			const table = sequelize.getQueryInterface().queryGenerator.quoteTable(Destination.getTableName());
			const enabled = sequelize.literal(`(SELECT "id" FROM ${table} WHERE "executionMode"='native' AND "enabled"=true)`);
			const job = await Job.findOne({where: {executionMode: 'native', network: 'geesome', intentVersion: 6, scheduledAt: {[Op.lte]: new Date()},
				[Op.and]: [
					{[Op.or]: [{status: 'queued'}, {status: 'processing', processingAt: {[Op.lt]: new Date(Date.now() - leaseMs)}}]},
					{[Op.or]: [{remoteId: {[Op.ne]: null}}, {destinationId: {[Op.in]: enabled}}]}
				]},
				order: [['scheduledAt', 'ASC'], ['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE, skipLocked: true});
			if (!job) {
				return null;
			}
			await job.update({status: 'processing', processingAt: new Date(), claimToken: randomBytes(32).toString('hex')}, {transaction});
			return job.toJSON();
		});
	}
	const claimWhere = job => ({id: job.id, userId: job.userId, executionMode: 'native', status: 'processing', claimToken: job.claimToken});
	async function publish(job) {
		if (!job.remoteId) {
			const destination = await Destination.findOne({where: {id: job.destinationId, userId: job.userId, executionMode: 'native', network: 'geesome', enabled: true}});
			if (!destination) {
				throw new ApiProblemError(409, 'native_publication_destination_unavailable', 'The Site Group destination is disabled or unavailable.');
			}
			const source = await app.ms.group.getPost(job.userId, job.postId);
			if (!source || Number(source.userId) !== Number(job.userId) || !isOwnedQueueGroup(source.group, job.userId) || source.isDeleted || source.isRemote || source.isEncrypted || source.source ||
				destination.sourceGroupId != null && Number(destination.sourceGroupId) !== Number(source.groupId)) {
				throw new ApiProblemError(403, 'local_publication_source_forbidden', 'The private publication queue is unavailable.');
			}
		}
		assertContentPolicy(job.contentType, job.contentPolicy);
		const group = await assertNativeTarget(app, job.userId, job.target);
		let post;
		if (job.remoteId) {
			post = await app.ms.group.getPostPure(Number(job.remoteId));
			if (!post || Number(post.userId) !== Number(job.userId) || Number(post.groupId) !== Number(group.id) || post.isDeleted || post.status !== PostStatus.Published) {
				throw new ApiProblemError(409, 'native_publication_post_changed', 'The previously created site post was removed or changed.');
			}
			await app.ms.group.applyPostManifestUpdate(job.userId, post, group, {asyncDerivedState: false});
		} else {
			const payload = job.payload;
			if (typeof payload?.text !== 'string' || payload.text.length > 40000 || !Array.isArray(payload.attachments) || payload.attachments.length > 20 || (!payload.text.trim() && !payload.attachments.length)) {
				throw new ApiProblemError(400, 'native_publication_payload_invalid', 'The saved site publication is invalid.');
			}
			const contents = [];
			if (payload.text) {
				const text = await app.ms.content.saveData(job.userId, payload.text, 'publication.txt', {mimeType: 'text/plain', skipFileCatalog: true, driver: {raw: true}});
				contents.push({id: text.id});
			}
			for (const attachment of payload.attachments) {
				const content = typeof attachment?.storageId === 'string' ? await app.ms.database.getContentByStorageAndUserId(attachment.storageId, job.userId) : null;
				if (!content || Number(content.userId) !== Number(job.userId) || content.isDeleted || content.isRemote || content.isEncrypted ||
					!['image/jpeg', 'image/png', 'image/webp'].includes(content.mimeType) || content.mimeType !== attachment.mimeType) {
					throw new ApiProblemError(403, 'native_publication_media_forbidden', 'A saved site image is unavailable.');
				}
				contents.push({id: content.id});
			}
			post = await app.ms.group.createPost(job.userId, {groupId: group.id, status: PostStatus.Published, contents,
				...(payload.sourceImageSet ? {propertiesJson: JSON.stringify({sourceImageSet: normalizeSourceImageSet(payload.sourceImageSet)})} : {})}, {
				asyncDerivedState: false,
				afterPersist: async (created, transaction) => {
					const locked = await Job.findOne({where: claimWhere(job), transaction, lock: transaction.LOCK.UPDATE});
					if (!locked || locked.remoteId) {
						throw new ApiProblemError(409, 'native_publication_claim_changed', 'The site job was resumed by another worker.');
					}
					await locked.update({remoteId: String(created.id)}, {transaction});
				}
			});
		}
		const {publicUrl} = getPublicApiContext(app);
		await Job.update({status: 'posted', remoteId: String(post.id), remoteUrl: `${publicUrl}/#/group/${group.id}/posts/${post.id}`, confirmedAt: new Date(), error: null}, {where: claimWhere(job)});
	}
	return {
		async processNext() {
			const job = await claim();
			if (!job) {
				return false;
			}
			try {
				await publish(job);
			} catch (error) {
				if (error.code === 'native_publication_claim_changed') {
					return true;
				}
				const permanent = error instanceof ApiProblemError && error.status < 500 || ['not_permitted', 'group_not_found', 'post_not_found'].includes(error.message);
				await Job.update({...(permanent ? {status: 'failed'} : {}), error: permanent
					? 'Site Group publication is unavailable. Check the target, images and write permissions.'
					: 'Site Group publication was interrupted. The worker will resume the same post after its processing lease expires.'}, {where: claimWhere(job)});
			}
			return true;
		}
	};
}
