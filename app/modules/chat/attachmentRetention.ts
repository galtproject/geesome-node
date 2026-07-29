import {Op} from 'sequelize';
import type {IGeesomeApp} from '../../interface.js';
import {CorePermissionName} from '../database/interface.js';

export enum ChatEventAttachmentRetentionState {
	Released = 'released',
	CleanupPending = 'cleanup_pending',
	CleanupQueued = 'cleanup_queued'
}

export const chatEventAttachmentReleasedStates = Object.values(
	ChatEventAttachmentRetentionState
);

export async function releaseChatEventAttachment(
	app: IGeesomeApp,
	models,
	userId: number,
	messageId: string,
	storageId: string,
	options: any = {}
) {
	await app.checkUserCan(userId, CorePermissionName.UserSaveData);
	const normalizedMessageId = requireIdentifier(
		messageId,
		'message_id_required',
		200
	);
	const normalizedStorageId = requireIdentifier(
		storageId,
		'chat_attachment_storage_id_required',
		200
	);
	return app.ms.database.sequelize.transaction(async transaction => {
		const event = await models.ChatEvent.findOne({
			where: {messageId: normalizedMessageId},
			transaction,
			lock: transaction.LOCK.UPDATE
		});
		if (
			!event ||
			!await canUserAccessChatEvent(models, event, userId, transaction)
		) {
			throw retentionError('event_not_found', 404);
		}
		const existingRelease = await models.ChatEventAttachmentRetention.findOne({
			where: {
				chatEventId: event.id,
				storageId: normalizedStorageId,
				userId
			},
			transaction,
			lock: transaction.LOCK.UPDATE
		});
		if (existingRelease) {
			return serializeChatEventAttachmentRelease(event, existingRelease);
		}
		const attachment = await models.ChatEventAttachment.findOne({
			where: {
				chatEventId: event.id,
				storageId: normalizedStorageId
			},
			transaction,
			lock: transaction.LOCK.UPDATE
		});
		if (!attachment) {
			throw retentionError('chat_attachment_not_found', 404);
		}
		const releasedAt = getDate(options.now);
		const [release] = await models.ChatEventAttachmentRetention.findOrCreate({
			where: {
				chatEventId: event.id,
				storageId: normalizedStorageId,
				userId
			},
			defaults: {
				chatEventId: event.id,
				contentId: attachment.contentId || null,
				storageId: normalizedStorageId,
				userId,
				state: ChatEventAttachmentRetentionState.Released,
				releasedAt
			},
			transaction
		});
		return serializeChatEventAttachmentRelease(event, release);
	});
}

export async function getReleasedChatEventAttachments(
	models,
	userId: number,
	chatEventIds: number[]
) {
	if (!chatEventIds.length) {
		return new Map<number, string[]>();
	}
	const releases = await models.ChatEventAttachmentRetention.findAll({
		where: {
			userId,
			chatEventId: {[Op.in]: chatEventIds},
			state: {[Op.in]: chatEventAttachmentReleasedStates}
		},
		order: [['id', 'ASC']]
	});
	const storageIdsByEventId = new Map<number, string[]>();
	for (const release of releases) {
		const eventStorageIds = storageIdsByEventId.get(release.chatEventId) || [];
		eventStorageIds.push(release.storageId);
		storageIdsByEventId.set(release.chatEventId, eventStorageIds);
	}
	return storageIdsByEventId;
}

async function canUserAccessChatEvent(models, event, userId: number, transaction) {
	if (Number(event.senderUserId) === Number(userId)) {
		return true;
	}
	return Boolean(await models.ChatEventRecipient.findOne({
		where: {
			chatEventId: event.id,
			userId
		},
		transaction
	}));
}

function serializeChatEventAttachmentRelease(event, release) {
	return {
		messageId: event.messageId,
		storageId: release.storageId,
		state: ChatEventAttachmentRetentionState.Released,
		releasedAt: release.releasedAt
	};
}

function requireIdentifier(value, errorCode: string, maximumLength: number) {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value.length > maximumLength
	) {
		throw retentionError(errorCode);
	}
	return value.trim();
}

function getDate(value): Date {
	const date = value instanceof Date ? value : new Date(value || Date.now());
	if (!Number.isFinite(date.getTime())) {
		throw retentionError('chat_attachment_release_time_invalid');
	}
	return date;
}

function retentionError(message: string, code = 400) {
	const error: any = new Error(message);
	error.code = code;
	return error;
}
