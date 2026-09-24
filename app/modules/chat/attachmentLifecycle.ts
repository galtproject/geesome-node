import {Op} from 'sequelize';
import type {IGeesomeApp} from '../../interface.js';
import {
	getChatAttachmentLimits,
	type IChatAttachmentLimits
} from './attachmentStorage.js';

export enum ChatAttachmentUploadState {
	Reserved = 'reserved',
	Uploaded = 'uploaded',
	Attached = 'attached',
	Cancelled = 'cancelled',
	CleanupPending = 'cleanup_pending',
	CleanupBlocked = 'cleanup_blocked',
	Cleaned = 'cleaned'
}

const defaultReservationTtlMs = 60 * 60 * 1000;
const maximumReservationTtlMs = 24 * 60 * 60 * 1000;
const defaultMaximumPendingReservations = 40;
const defaultMaximumPendingBytes = 200 * 1024 * 1024;

export async function createChatAttachmentUploadReservation(
	app: IGeesomeApp,
	models,
	userId: number,
	expectedBytes,
	options: any = {}
) {
	const now = getDate(options.now);
	const policy = getChatAttachmentUploadPolicy({
		...app.config?.chatConfig,
		...options
	});
	const size = parseExpectedBytes(expectedBytes, policy);
	return app.ms.database.sequelize.transaction(async transaction => {
		await app.ms.database.models.User.findByPk(userId, {
			transaction,
			lock: transaction.LOCK.UPDATE
		});
		const activeWhere = {
			userId,
			state: {[Op.in]: [
				ChatAttachmentUploadState.Reserved,
				ChatAttachmentUploadState.Uploaded
			]},
			expiresAt: {[Op.gt]: now}
		};
		const activeCount = await models.ChatAttachmentUpload.count({
			where: activeWhere,
			transaction
		});
		if (activeCount >= policy.maxPendingAttachmentReservations) {
			throw attachmentLifecycleError(
				'chat_attachment_reservation_count_exceeded',
				429
			);
		}
		const activeBytes = Number(await models.ChatAttachmentUpload.sum(
			'expectedBytes',
			{where: activeWhere, transaction}
		) || 0);
		if (
			!Number.isSafeInteger(activeBytes) ||
			activeBytes + size > policy.maxPendingAttachmentBytes
		) {
			throw attachmentLifecycleError(
				'chat_attachment_pending_quota_exceeded',
				429
			);
		}
		const reservation = await models.ChatAttachmentUpload.create({
			userId,
			expectedBytes: size,
			state: ChatAttachmentUploadState.Reserved,
			expiresAt: new Date(now.getTime() + policy.attachmentReservationTtlMs)
		}, {transaction});
		return serializeChatAttachmentUpload(reservation);
	});
}

export async function bindChatAttachmentUpload(
	app: IGeesomeApp,
	models,
	userId: number,
	content,
	reservationId,
	options: any = {}
) {
	if (!reservationId) {
		return null;
	}
	const normalizedReservationId = requireReservationId(reservationId);
	const now = getDate(options.now);
	return app.ms.database.sequelize.transaction(async transaction => {
		await lockChatAttachmentContents(app, [content], transaction);
		const reservation = await models.ChatAttachmentUpload.findOne({
			where: {reservationId: normalizedReservationId, userId},
			transaction,
			lock: transaction.LOCK.UPDATE
		});
		if (!reservation) {
			throw attachmentLifecycleError('chat_attachment_reservation_not_found', 404);
		}
		if (
			reservation.state === ChatAttachmentUploadState.Uploaded ||
			reservation.state === ChatAttachmentUploadState.Attached
		) {
			assertSameReservationContent(reservation, content);
			return serializeChatAttachmentUpload(reservation);
		}
		if (reservation.state !== ChatAttachmentUploadState.Reserved) {
			throw attachmentLifecycleError('chat_attachment_reservation_not_active', 409);
		}
		if (new Date(reservation.expiresAt).getTime() <= now.getTime()) {
			throw attachmentLifecycleError('chat_attachment_reservation_expired', 409);
		}
		assertExpectedContentSize(reservation, content);
		await reservation.update({
			contentId: content.id,
			storageId: content.storageId,
			state: ChatAttachmentUploadState.Uploaded,
			uploadedAt: now
		}, {transaction});
		return serializeChatAttachmentUpload(reservation);
	});
}

export async function attachChatAttachmentUploads(
	models,
	userId: number,
	contents,
	chatEventId: number,
	transaction,
	options: any = {}
) {
	const contentIds = contents.map(content => Number(content.id));
	if (!contentIds.length) {
		return 0;
	}
	const now = getDate(options.now);
	const uploads = await models.ChatAttachmentUpload.findAll({
		where: {
			userId,
			contentId: {[Op.in]: contentIds}
		},
		order: [['id', 'DESC']],
		transaction,
		lock: transaction.LOCK.UPDATE
	});
	assertLatestAttachmentUploadsCanAttach(uploads);
	const [updated] = await models.ChatAttachmentUpload.update({
		state: ChatAttachmentUploadState.Attached,
		chatEventId,
		attachedAt: now
	}, {
		where: {
			userId,
			contentId: {[Op.in]: contentIds},
			state: ChatAttachmentUploadState.Uploaded
		},
		transaction
	});
	return Number(updated);
}

export async function lockChatAttachmentContents(
	app: IGeesomeApp,
	contents,
	transaction
) {
	const contentIds = [...new Set(contents.map(content => Number(content.id)))];
	if (!contentIds.length) {
		return;
	}
	const locked = await app.ms.database.models.Content.findAll({
		where: {
			id: {[Op.in]: contentIds},
			isDeleted: {[Op.ne]: true}
		},
		transaction,
		lock: transaction.LOCK.UPDATE
	});
	if (locked.length !== contentIds.length) {
		throw attachmentLifecycleError('chat_attachment_content_unavailable', 409);
	}
}

export async function cancelChatAttachmentUpload(
	models,
	userId: number,
	reservationId,
	options: any = {}
) {
	const reservation = await models.ChatAttachmentUpload.findOne({
		where: {
			reservationId: requireReservationId(reservationId),
			userId
		}
	});
	if (!reservation) {
		throw attachmentLifecycleError('chat_attachment_reservation_not_found', 404);
	}
	if (reservation.state === ChatAttachmentUploadState.Attached) {
		throw attachmentLifecycleError('chat_attachment_reservation_attached', 409);
	}
	if (reservation.state === ChatAttachmentUploadState.Cancelled) {
		return serializeChatAttachmentUpload(reservation);
	}
	const [updated] = await models.ChatAttachmentUpload.update({
		state: ChatAttachmentUploadState.Cancelled,
		cancelledAt: getDate(options.now)
	}, {
		where: {
			id: reservation.id,
			state: {[Op.in]: [
				ChatAttachmentUploadState.Reserved,
				ChatAttachmentUploadState.Uploaded
			]}
		}
	});
	const current = await models.ChatAttachmentUpload.findOne({
		where: {id: reservation.id}
	});
	if (!updated && current?.state === ChatAttachmentUploadState.Attached) {
		throw attachmentLifecycleError('chat_attachment_reservation_attached', 409);
	}
	if (!current || current.state !== ChatAttachmentUploadState.Cancelled) {
		throw attachmentLifecycleError('chat_attachment_reservation_not_active', 409);
	}
	return serializeChatAttachmentUpload(current);
}

export function getChatAttachmentUploadPolicy(
	options: IChatAttachmentLimits & {
		attachmentReservationTtlMs?: number | string;
		maxPendingAttachmentReservations?: number | string;
		maxPendingAttachmentBytes?: number | string;
	} = {}
) {
	const attachmentLimits = getChatAttachmentLimits(options);
	return {
		...attachmentLimits,
		attachmentReservationTtlMs: parsePositiveInteger(
			options.attachmentReservationTtlMs,
			defaultReservationTtlMs,
			maximumReservationTtlMs
		),
		maxPendingAttachmentReservations: parsePositiveInteger(
			options.maxPendingAttachmentReservations,
			defaultMaximumPendingReservations
		),
		maxPendingAttachmentBytes: parsePositiveInteger(
			options.maxPendingAttachmentBytes,
			defaultMaximumPendingBytes
		)
	};
}

function assertLatestAttachmentUploadsCanAttach(uploads) {
	const latestByContentId = new Map();
	for (const upload of uploads) {
		const contentId = Number(upload.contentId);
		if (!latestByContentId.has(contentId)) {
			latestByContentId.set(contentId, upload);
		}
	}
	for (const upload of latestByContentId.values()) {
		if (
			upload.state !== ChatAttachmentUploadState.Uploaded &&
			upload.state !== ChatAttachmentUploadState.Attached
		) {
			throw attachmentLifecycleError(
				'chat_attachment_upload_not_attachable',
				409
			);
		}
	}
}

function parseExpectedBytes(
	value,
	policy: {maxAttachmentBytes: number}
): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw attachmentLifecycleError('chat_attachment_size_invalid');
	}
	if (parsed > policy.maxAttachmentBytes) {
		throw attachmentLifecycleError('chat_attachment_too_large', 413);
	}
	return parsed;
}

function parsePositiveInteger(value, fallback: number, maximum?: number): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		return fallback;
	}
	return maximum ? Math.min(parsed, maximum) : parsed;
}

function assertExpectedContentSize(reservation, content) {
	const size = Number(content?.size);
	if (
		!Number.isSafeInteger(size) ||
		size !== Number(reservation.expectedBytes)
	) {
		throw attachmentLifecycleError('chat_attachment_upload_size_mismatch', 409);
	}
	if (!content?.id || !content?.storageId) {
		throw attachmentLifecycleError('chat_attachment_upload_content_invalid', 409);
	}
}

function assertSameReservationContent(reservation, content) {
	if (
		Number(reservation.contentId) !== Number(content?.id) ||
		reservation.storageId !== content?.storageId
	) {
		throw attachmentLifecycleError('chat_attachment_reservation_conflict', 409);
	}
}

function requireReservationId(value): string {
	if (typeof value !== 'string' || !value.trim() || value.length > 100) {
		throw attachmentLifecycleError('chat_attachment_reservation_id_invalid');
	}
	return value.trim();
}

function getDate(value): Date {
	const date = value instanceof Date ? value : new Date(value || Date.now());
	if (Number.isNaN(date.getTime())) {
		throw attachmentLifecycleError('chat_attachment_time_invalid');
	}
	return date;
}

function serializeChatAttachmentUpload(reservation) {
	return {
		reservationId: reservation.reservationId,
		expectedBytes: Number(reservation.expectedBytes),
		state: reservation.state,
		expiresAt: reservation.expiresAt,
		uploadedAt: reservation.uploadedAt || null,
		attachedAt: reservation.attachedAt || null,
		cancelledAt: reservation.cancelledAt || null
	};
}

function attachmentLifecycleError(message: string, code = 400) {
	const error: any = new Error(message);
	error.code = code;
	return error;
}
