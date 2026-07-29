import {Op} from 'sequelize';
import type {IGeesomeApp} from '../../interface.js';
import {ChatAttachmentUploadState} from './attachmentLifecycle.js';

const defaultAbandonedRetentionMs = 7 * 24 * 60 * 60 * 1000;
const defaultCancelledRetentionMs = 60 * 60 * 1000;
const defaultCleanupClaimTtlMs = 10 * 60 * 1000;
const defaultCleanupRecordRetentionMs = 30 * 24 * 60 * 60 * 1000;
const defaultCleanupLimit = 25;
const maximumCleanupLimit = 100;

export async function cleanupChatAttachmentUploads(
	app: IGeesomeApp,
	models,
	options: any = {}
) {
	const now = getDate(options.now);
	const policy = getChatAttachmentCleanupPolicy({
		...app.config?.chatConfig,
		...options
	});
	const limit = parsePositiveInteger(
		options.limit,
		defaultCleanupLimit,
		maximumCleanupLimit
	);
	const candidates = await models.ChatAttachmentUpload.findAll({
		where: getChatAttachmentCleanupCandidateWhere(now, policy),
		order: [['id', 'ASC']],
		limit
	});
	const result = {
		processed: 0,
		cleaned: 0,
		blocked: 0,
		reconciled: 0,
		pruned: 0,
		failed: 0
	};
	for (const candidate of candidates) {
		try {
			const outcome = await cleanupChatAttachmentUploadCandidate(
				app,
				models,
				candidate.id,
				candidate.contentId,
				now,
				policy,
				options
			);
			result.processed += outcome === 'skipped' ? 0 : 1;
			if (outcome !== 'skipped') {
				result[outcome] += 1;
			}
		} catch (_error) {
			result.processed += 1;
			result.failed += 1;
		}
	}
	return result;
}

export function getChatAttachmentCleanupPolicy(options: any = {}) {
	return {
		abandonedRetentionMs: parseNonNegativeInteger(
			options.attachmentAbandonedRetentionMs,
			defaultAbandonedRetentionMs
		),
		cancelledRetentionMs: parseNonNegativeInteger(
			options.attachmentCancelledRetentionMs,
			defaultCancelledRetentionMs
		),
		cleanupClaimTtlMs: parsePositiveInteger(
			options.attachmentCleanupClaimTtlMs,
			defaultCleanupClaimTtlMs
		),
		cleanupRecordRetentionMs: parseNonNegativeInteger(
			options.attachmentCleanupRecordRetentionMs,
			defaultCleanupRecordRetentionMs
		)
	};
}

async function cleanupChatAttachmentUploadCandidate(
	app: IGeesomeApp,
	models,
	uploadId: number,
	candidateContentId: number | null,
	now: Date,
	policy,
	options
) {
	const claim = await app.ms.database.sequelize.transaction(async transaction => {
		const content = candidateContentId
			? await app.ms.database.models.Content.findByPk(candidateContentId, {
				transaction,
				lock: transaction.LOCK.UPDATE
			})
			: null;
		const upload = await models.ChatAttachmentUpload.findByPk(uploadId, {
			transaction,
			lock: transaction.LOCK.UPDATE
		});
		if (!upload || !isChatAttachmentUploadCleanupDue(upload, now, policy)) {
			return {outcome: 'skipped'};
		}
		if (isTerminalChatAttachmentUpload(upload)) {
			await upload.destroy({transaction});
			return {outcome: 'pruned'};
		}
		if (Number(upload.contentId || 0) !== Number(candidateContentId || 0)) {
			return {outcome: 'skipped'};
		}
		const eventAttachment = upload.contentId
			? await models.ChatEventAttachment.findOne({
				where: {contentId: upload.contentId},
				order: [['chatEventId', 'DESC']],
				transaction
			})
			: null;
		if (eventAttachment) {
			await upload.update({
				state: ChatAttachmentUploadState.Attached,
				chatEventId: eventAttachment.chatEventId,
				attachedAt: upload.attachedAt || now
			}, {transaction});
			return {outcome: 'reconciled'};
		}
		const activeReplacement = await getActiveReplacementUpload(
			models,
			upload,
			transaction
		);
		if (activeReplacement) {
			await upload.update({
				state: ChatAttachmentUploadState.Cleaned
			}, {transaction});
			return {outcome: 'cleaned'};
		}
		if (content && content.isDeleted !== true) {
			const deleteSafety = await app.ms.database.getContentDeleteSafety(content);
			if (!deleteSafety?.safeToDestroyContent) {
				await upload.update({
					state: ChatAttachmentUploadState.CleanupBlocked
				}, {transaction});
				return {outcome: 'blocked'};
			}
			await content.update({
				isDeleted: true,
				deletedAt: now
			}, {transaction});
		}
		if (!upload.contentId && !upload.storageId) {
			await upload.update({
				state: ChatAttachmentUploadState.Cleaned
			}, {transaction});
			return {outcome: 'cleaned'};
		}
		await upload.update({
			state: ChatAttachmentUploadState.CleanupPending
		}, {transaction});
		return {
			outcome: 'claimed',
			userId: upload.userId,
			storageId: upload.storageId || content?.storageId || null
		};
	});
	if (claim.outcome !== 'claimed') {
		return claim.outcome;
	}
	await queueChatAttachmentStorageRemoval(
		app,
		claim.userId,
		claim.storageId,
		options
	);
	await models.ChatAttachmentUpload.update({
		state: ChatAttachmentUploadState.Cleaned
	}, {
		where: {
			id: uploadId,
			state: ChatAttachmentUploadState.CleanupPending
		}
	});
	return 'cleaned';
}

async function getActiveReplacementUpload(models, upload, transaction) {
	if (!upload.contentId) {
		return null;
	}
	return models.ChatAttachmentUpload.findOne({
		where: {
			id: {[Op.ne]: upload.id},
			userId: upload.userId,
			contentId: upload.contentId,
			state: {[Op.in]: [
				ChatAttachmentUploadState.Uploaded,
				ChatAttachmentUploadState.Attached
			]}
		},
		order: [['id', 'DESC']],
		transaction,
		lock: transaction.LOCK.UPDATE
	});
}

function getChatAttachmentCleanupCandidateWhere(now: Date, policy) {
	const cutoffs = getChatAttachmentCleanupCutoffs(now, policy);
	return {
		[Op.or]: [
			{
				state: ChatAttachmentUploadState.Reserved,
				expiresAt: {[Op.lte]: now}
			},
			{
				state: ChatAttachmentUploadState.Uploaded,
				uploadedAt: {[Op.lte]: cutoffs.abandoned}
			},
			{
				state: ChatAttachmentUploadState.Cancelled,
				cancelledAt: {[Op.lte]: cutoffs.cancelled}
			},
			{
				state: ChatAttachmentUploadState.CleanupPending,
				updatedAt: {[Op.lte]: cutoffs.claim}
			},
			{
				state: {[Op.in]: [
					ChatAttachmentUploadState.Attached,
					ChatAttachmentUploadState.CleanupBlocked,
					ChatAttachmentUploadState.Cleaned
				]},
				updatedAt: {[Op.lte]: cutoffs.record}
			}
		]
	};
}

function isChatAttachmentUploadCleanupDue(upload, now: Date, policy) {
	const cutoffs = getChatAttachmentCleanupCutoffs(now, policy);
	if (upload.state === ChatAttachmentUploadState.Reserved) {
		return isDateAtOrBefore(upload.expiresAt, now);
	}
	if (upload.state === ChatAttachmentUploadState.Uploaded) {
		return isDateAtOrBefore(upload.uploadedAt, cutoffs.abandoned);
	}
	if (upload.state === ChatAttachmentUploadState.Cancelled) {
		return isDateAtOrBefore(upload.cancelledAt, cutoffs.cancelled);
	}
	if (upload.state === ChatAttachmentUploadState.CleanupPending) {
		return isDateAtOrBefore(upload.updatedAt, cutoffs.claim);
	}
	if (isTerminalChatAttachmentUpload(upload)) {
		return isDateAtOrBefore(upload.updatedAt, cutoffs.record);
	}
	return false;
}

function isTerminalChatAttachmentUpload(upload) {
	return upload.state === ChatAttachmentUploadState.Attached ||
		upload.state === ChatAttachmentUploadState.CleanupBlocked ||
		upload.state === ChatAttachmentUploadState.Cleaned;
}

function getChatAttachmentCleanupCutoffs(now: Date, policy) {
	return {
		abandoned: new Date(now.getTime() - policy.abandonedRetentionMs),
		cancelled: new Date(now.getTime() - policy.cancelledRetentionMs),
		claim: new Date(now.getTime() - policy.cleanupClaimTtlMs),
		record: new Date(now.getTime() - policy.cleanupRecordRetentionMs)
	};
}

async function queueChatAttachmentStorageRemoval(
	app: IGeesomeApp,
	userId: number,
	storageId,
	options
) {
	if (!storageId) {
		return;
	}
	const storageSpace = app.ms['storageSpace'];
	if (storageSpace?.queueStorageObjectRemoval) {
		await storageSpace.queueStorageObjectRemoval(userId, null, storageId, {
			process: options.processStorageRemoval !== false
		});
		return;
	}
	const deleteSafety = await app.ms.database.getStorageObjectDeleteSafety(storageId);
	if (!deleteSafety.safeToRemovePhysical) {
		return;
	}
	await app.ms.storage.unPin(storageId).catch(() => null);
	await app.ms.storage.remove(storageId).catch(() => null);
}

function getDate(value): Date {
	const date = value instanceof Date ? value : new Date(value || Date.now());
	if (!Number.isFinite(date.getTime())) {
		throw new Error('chat_attachment_cleanup_time_invalid');
	}
	return date;
}

function isDateAtOrBefore(value, cutoff: Date) {
	if (!value) {
		return false;
	}
	const date = new Date(value);
	return Number.isFinite(date.getTime()) && date.getTime() <= cutoff.getTime();
}

function parsePositiveInteger(value, fallback: number, maximum?: number): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		return fallback;
	}
	return maximum ? Math.min(parsed, maximum) : parsed;
}

function parseNonNegativeInteger(value, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		return fallback;
	}
	return parsed;
}
