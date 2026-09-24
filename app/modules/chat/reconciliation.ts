import {Op} from 'sequelize';
import {createSignedChatDeliveryPayload} from './delivery.js';
import {
	chatSyncProtocol,
	IChatSyncRequest,
	IChatSyncResponse,
	signChatSyncResponse
} from './sync.js';
import {IChatTransportSigner} from './transport.js';

const maximumSyncPageSize = 10;

export async function createChatSyncResponse(
	models,
	request: IChatSyncRequest,
	signer: IChatTransportSigner,
	sourceSyncUrl: string | null,
	now = new Date()
): Promise<IChatSyncResponse> {
	const limit = parseSyncPageSize(request.limit);
	const recipientInclude = [{
		association: 'recipients',
		attributes: [],
		required: true,
		where: {ownerId: request.requesterOwnerId}
	}];
	const sourceWhere = {
		conversationId: request.conversationId,
		senderOwnerId: request.sourceOwnerId
	};
	const headEvent = await models.ChatEvent.findOne({
		where: sourceWhere,
		include: recipientInclude,
		order: [['sourceSequence', 'DESC'], ['id', 'DESC']]
	});
	const events = await models.ChatEvent.findAll({
		where: {
			...sourceWhere,
			sourceSequence: {[Op.gt]: request.afterSourceSequence}
		},
		include: recipientInclude,
		order: [['sourceSequence', 'ASC'], ['id', 'ASC']],
		limit: limit + 1
	});
	const page = events.slice(0, limit);
	const deliveries = [];
	for (const event of page) {
		deliveries.push(await createSignedChatDeliveryPayload(
			event,
			request.requesterOwnerId,
			signer,
			sourceSyncUrl,
			now
		));
	}
	return signChatSyncResponse({
		version: chatSyncProtocol,
		requestId: request.requestId,
		respondedAt: now.toISOString(),
		requesterOwnerId: request.requesterOwnerId,
		sourceOwnerId: request.sourceOwnerId,
		conversationId: request.conversationId,
		headSourceSequence: String(headEvent?.sourceSequence || '0'),
		hasMore: events.length > limit,
		deliveries
	}, signer);
}

export function assertValidChatSyncPage(
	response: IChatSyncResponse,
	afterSourceSequence: string,
	maximumDeliveries = maximumSyncPageSize
): void {
	const head = parseSequence(response.headSourceSequence);
	let previous = parseSequence(afterSourceSequence);
	if (head < previous) {
		throw new Error('chat_sync_source_head_regressed');
	}
	if (response.deliveries.length > parseSyncPageSize(maximumDeliveries)) {
		throw new Error('chat_sync_page_limit_exceeded');
	}
	if (response.hasMore && !response.deliveries.length) {
		throw new Error('chat_sync_empty_incomplete_page');
	}
	for (const delivery of response.deliveries) {
		const sourceSequence = parseSequence(delivery.sourceSequence);
		if (
			delivery.sender.ownerId !== response.sourceOwnerId ||
			delivery.recipientOwnerId !== response.requesterOwnerId ||
			delivery.envelope?.conversationId !== response.conversationId ||
			sourceSequence <= previous ||
			sourceSequence > head
		) {
			throw new Error('chat_sync_delivery_order_invalid');
		}
		previous = sourceSequence;
	}
	if (!response.hasMore && previous < head) {
		throw new Error('chat_sync_incomplete_final_page');
	}
}

export function getChatSyncPageCursor(
	response: IChatSyncResponse,
	fallback: string
): string {
	const lastDelivery = response.deliveries[response.deliveries.length - 1];
	return lastDelivery
		? parseSequence(lastDelivery.sourceSequence).toString()
		: parseSequence(response.headSourceSequence || fallback).toString();
}

export function parseSyncPageSize(value): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return maximumSyncPageSize;
	}
	return Math.min(parsed, maximumSyncPageSize);
}

function parseSequence(value): bigint {
	try {
		const sequence = BigInt(value);
		if (sequence < 0n || sequence > 9223372036854775807n) {
			throw new Error();
		}
		return sequence;
	} catch (error) {
		throw new Error('chat_sync_sequence_invalid');
	}
}
