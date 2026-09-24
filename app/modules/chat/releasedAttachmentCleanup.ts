import {Op} from 'sequelize';
import type {IGeesomeApp} from '../../interface.js';
import {ChatDeliveryState} from './interface.js';
import {
	ChatEventAttachmentRetentionState,
	chatEventAttachmentReleasedStates
} from './attachmentRetention.js';
import {queueChatAttachmentStorageRemoval} from './attachmentStorageRemoval.js';

const defaultReleasedRetentionMs = 7 * 24 * 60 * 60 * 1000;

export async function cleanupReleasedChatEventAttachments(
	app: IGeesomeApp,
	models,
	options: any = {}
) {
	const limit = Number(options.limit || 0);
	if (!Number.isSafeInteger(limit) || limit <= 0) {
		return {processed: 0, cleaned: 0, blocked: 0, failed: 0};
	}
	const now = getDate(options.now);
	const cleanupOptions = {
		...app.config?.chatConfig,
		...options
	};
	const releasedRetentionMs = parseNonNegativeInteger(
		cleanupOptions.attachmentReleasedRetentionMs,
		defaultReleasedRetentionMs
	);
	const candidates = await getReleasedAttachmentCleanupCandidates(
		models,
		new Date(now.getTime() - releasedRetentionMs),
		limit
	);
	const result = {processed: 0, cleaned: 0, blocked: 0, failed: 0};
	for (const candidate of candidates) {
		try {
			const outcome = await cleanupReleasedAttachmentCandidate(
				app,
				models,
				candidate,
				now,
				cleanupOptions
			);
			if (outcome === 'skipped') {
				continue;
			}
			result.processed += 1;
			result[outcome] += 1;
		} catch (_error) {
			result.processed += 1;
			result.failed += 1;
		}
	}
	return result;
}

async function getReleasedAttachmentCleanupCandidates(
	models,
	releasedBefore: Date,
	limit: number
) {
	const retentions = await models.ChatEventAttachmentRetention.findAll({
		where: {
			[Op.or]: [
				{
					state: ChatEventAttachmentRetentionState.Released,
					releasedAt: {[Op.lte]: releasedBefore}
				},
				{state: ChatEventAttachmentRetentionState.CleanupPending}
			]
		},
		order: [['updatedAt', 'ASC'], ['id', 'ASC']],
		limit
	});
	const candidates = new Map<string, {chatEventId: number; storageId: string}>();
	for (const retention of retentions) {
		const key = `${retention.chatEventId}\0${retention.storageId}`;
		if (!candidates.has(key)) {
			candidates.set(key, {
				chatEventId: retention.chatEventId,
				storageId: retention.storageId
			});
		}
	}
	return [...candidates.values()];
}

async function cleanupReleasedAttachmentCandidate(
	app: IGeesomeApp,
	models,
	candidate,
	now: Date,
	options
) {
	const claim = await app.ms.database.sequelize.transaction(async transaction => {
		const event = await models.ChatEvent.findByPk(candidate.chatEventId, {
			transaction,
			lock: transaction.LOCK.UPDATE
		});
		if (!event) {
			return {outcome: 'skipped'};
		}
		const retentions = await models.ChatEventAttachmentRetention.findAll({
			where: {
				chatEventId: candidate.chatEventId,
				storageId: candidate.storageId,
				state: {[Op.in]: chatEventAttachmentReleasedStates}
			},
			transaction,
			lock: transaction.LOCK.UPDATE
		});
		const participantUserIds = await getLocalParticipantUserIds(
			models,
			event,
			transaction
		);
		if (!hasEveryParticipantReleased(participantUserIds, retentions)) {
			await deferRetentionCleanup(models, candidate, now, transaction);
			return {outcome: 'blocked'};
		}
		if (!await areRequiredDeliveriesAcknowledged(
			models,
			event,
			transaction
		)) {
			await deferRetentionCleanup(models, candidate, now, transaction);
			return {outcome: 'blocked'};
		}
		const attachment = await models.ChatEventAttachment.findOne({
			where: {
				chatEventId: event.id,
				storageId: candidate.storageId
			},
			transaction,
			lock: transaction.LOCK.UPDATE
		});
		const contentId = attachment?.contentId || retentions[0]?.contentId || null;
		const content = contentId
			? await app.ms.database.models.Content.findByPk(contentId, {
				transaction,
				lock: transaction.LOCK.UPDATE
			})
			: null;
		if (content && content.isDeleted !== true) {
			const [otherEventAttachments, deleteSafety] = await Promise.all([
				countOtherEventAttachmentContentReferences(
					models,
					attachment,
					content.id,
					transaction
				),
				app.ms.database.getContentDeleteSafety(content)
			]);
			if (
				otherEventAttachments === 0 &&
				deleteSafety?.safeToDestroyContent
			) {
				await content.update({
					isDeleted: true,
					deletedAt: now
				}, {transaction});
			}
		}
		await models.ChatEventAttachmentRetention.update({
			state: ChatEventAttachmentRetentionState.CleanupPending
		}, {
			where: {
				chatEventId: event.id,
				storageId: candidate.storageId,
				state: {[Op.in]: chatEventAttachmentReleasedStates}
			},
			transaction
		});
		if (attachment) {
			await attachment.destroy({transaction});
		}
		return {
			outcome: 'claimed',
			userId: Number(content?.userId || participantUserIds[0]),
			storageId: candidate.storageId
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
	await models.ChatEventAttachmentRetention.update({
		state: ChatEventAttachmentRetentionState.CleanupQueued
	}, {
		where: {
			chatEventId: candidate.chatEventId,
			storageId: candidate.storageId,
			state: ChatEventAttachmentRetentionState.CleanupPending
		}
	});
	return 'cleaned';
}

function countOtherEventAttachmentContentReferences(
	models,
	attachment,
	contentId: number,
	transaction
) {
	const where: any = {contentId};
	if (attachment?.id) {
		where.id = {[Op.ne]: attachment.id};
	}
	return models.ChatEventAttachment.count({where, transaction});
}

async function getLocalParticipantUserIds(models, event, transaction) {
	const recipients = await models.ChatEventRecipient.findAll({
		attributes: ['userId'],
		where: {
			chatEventId: event.id,
			userId: {[Op.ne]: null}
		},
		transaction,
		lock: transaction.LOCK.UPDATE
	});
	return [...new Set([
		event.senderUserId,
		...recipients.map(recipient => recipient.userId)
	]
		.filter(userId => userId !== null && userId !== undefined)
		.map(Number)
	)].sort((left, right) => left - right);
}

function hasEveryParticipantReleased(participantUserIds, retentions) {
	if (!participantUserIds.length) {
		return false;
	}
	const releasedUserIds = new Set(retentions.map(retention =>
		Number(retention.userId)
	));
	return participantUserIds.every(userId => releasedUserIds.has(userId));
}

async function areRequiredDeliveriesAcknowledged(models, event, transaction) {
	const remoteRecipients = await models.ChatEventRecipient.findAll({
		attributes: ['ownerId'],
		where: {
			chatEventId: event.id,
			userId: null
		},
		transaction,
		lock: transaction.LOCK.UPDATE
	});
	const deliveries = await models.ChatDelivery.findAll({
		where: {chatEventId: event.id},
		transaction,
		lock: transaction.LOCK.UPDATE
	});
	const acknowledgedOwnerIds = new Set(deliveries
		.filter(delivery =>
			delivery.state === ChatDeliveryState.Delivered &&
			Boolean(delivery.deliveredAt) &&
			delivery.acknowledgedSequence !== null &&
			delivery.acknowledgedSequence !== undefined
		)
		.map(delivery => delivery.recipientOwnerId)
	);
	return deliveries.every(delivery =>
		delivery.state === ChatDeliveryState.Delivered &&
		Boolean(delivery.deliveredAt) &&
		delivery.acknowledgedSequence !== null &&
		delivery.acknowledgedSequence !== undefined
	) && remoteRecipients.every(recipient =>
		acknowledgedOwnerIds.has(recipient.ownerId)
	);
}

function deferRetentionCleanup(models, candidate, now: Date, transaction) {
	return models.ChatEventAttachmentRetention.update({
		updatedAt: now
	}, {
		where: {
			chatEventId: candidate.chatEventId,
			storageId: candidate.storageId,
			state: {[Op.in]: chatEventAttachmentReleasedStates}
		},
		transaction,
		silent: true
	});
}

function getDate(value): Date {
	const date = value instanceof Date ? value : new Date(value || Date.now());
	if (!Number.isFinite(date.getTime())) {
		throw new Error('chat_attachment_cleanup_time_invalid');
	}
	return date;
}

function parseNonNegativeInteger(value, fallback: number): number {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
