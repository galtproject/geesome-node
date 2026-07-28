import {
	chatDeliveryProtocol,
	deliverChatRequest as sendDefaultChatDeliveryRequest,
	IChatTransportSigner,
	signChatDelivery,
	verifyChatAcknowledgement
} from './transport.js';
import {ChatDeliveryState, IChatDeliveryProcessOptions} from './interface.js';

const defaultDeliveryLimit = 20;
const defaultClaimTtlMs = 5 * 60 * 1000;
const defaultMaximumAttempts = 8;
const minimumRetryDelayMs = 5 * 1000;
const maximumRetryDelayMs = 60 * 60 * 1000;

export interface IProcessChatDeliveryOptions extends IChatDeliveryProcessOptions {
	getSigner(ownerId: string): Promise<IChatTransportSigner>;
	maximumAttempts?: number;
	allowHttp?: boolean;
}

export async function processChatDeliveryQueue(models, options: IProcessChatDeliveryOptions) {
	const now = options.now || new Date();
	const limit = parsePositiveInteger(options.limit, defaultDeliveryLimit);
	const claimTtlMs = parsePositiveInteger(options.claimTtlMs, defaultClaimTtlMs);
	const deliveries = await models.ChatDelivery.claimDue({
		now,
		claimExpiresAt: new Date(now.getTime() + claimTtlMs),
		limit
	});
	const result = {
		processed: 0,
		delivered: 0,
		failed: 0,
		pending: 0
	};
	for (const delivery of deliveries) {
		result.processed += 1;
		try {
			await processChatDelivery(delivery, options, now);
			result.delivered += 1;
		} catch (error) {
			const retryState = await recordChatDeliveryFailure(delivery, error, options, now);
			result[retryState] += 1;
		}
	}
	return result;
}

export function serializeChatDelivery(delivery) {
	return {
		recipientOwnerId: delivery.recipientOwnerId,
		inboxUrl: delivery.inboxUrl,
		state: delivery.state,
		attempts: delivery.attempts,
		nextAttemptAt: delivery.nextAttemptAt,
		deliveredAt: delivery.deliveredAt,
		acknowledgedSequence: delivery.acknowledgedSequence === null
			? null
			: String(delivery.acknowledgedSequence),
		acknowledgedHeadSequence: delivery.acknowledgedHeadSequence === null
			? null
			: String(delivery.acknowledgedHeadSequence),
		lastError: delivery.lastError
	};
}

async function processChatDelivery(
	delivery,
	options: IProcessChatDeliveryOptions,
	now: Date
): Promise<void> {
	const event = delivery.event;
	if (!event) {
		throw new Error('chat_delivery_event_missing');
	}
	const signer = await options.getSigner(event.senderOwnerId);
	const deliveryId = getChatDeliveryId(event.messageId, delivery.recipientOwnerId);
	const payload = await signChatDelivery({
		version: chatDeliveryProtocol,
		deliveryId,
		sentAt: now.toISOString(),
		sender: {
			ownerId: event.senderOwnerId,
			publicKey: signer.publicKey,
			deviceBundle: JSON.parse(event.senderBundleJson)
		},
		recipientOwnerId: delivery.recipientOwnerId,
		sourceSequence: String(event.sourceSequence || event.sequence),
		envelope: JSON.parse(event.envelopeJson)
	}, signer);
	const send = options.deliverChatRequest || ((inboxUrl, input) =>
		sendDefaultChatDeliveryRequest(inboxUrl, input, {allowHttp: options.allowHttp})
	);
	const acknowledgement = await send(delivery.inboxUrl, payload);
	await verifyChatAcknowledgement(acknowledgement, {
		deliveryId,
		messageId: event.messageId,
		eventHash: event.eventHash,
		recipientOwnerId: delivery.recipientOwnerId,
		publicKey: delivery.recipientPublicKey
	});
	await delivery.update({
		state: ChatDeliveryState.Delivered,
		attempts: Number(delivery.attempts || 0) + 1,
		deliveredAt: now,
		acknowledgedSequence: acknowledgement.acceptedSequence,
		acknowledgedHeadSequence: acknowledgement.headSequence,
		lastError: null,
		deliveryClaimedAt: null,
		deliveryClaimExpiresAt: null
	});
}

async function recordChatDeliveryFailure(
	delivery,
	error,
	options: IProcessChatDeliveryOptions,
	now: Date
): Promise<'failed' | 'pending'> {
	const attempts = Number(delivery.attempts || 0) + 1;
	const maximumAttempts = parsePositiveInteger(
		options.maximumAttempts,
		defaultMaximumAttempts
	);
	const failed = attempts >= maximumAttempts;
	await delivery.update({
		state: failed ? ChatDeliveryState.Failed : ChatDeliveryState.Pending,
		attempts,
		nextAttemptAt: failed ? delivery.nextAttemptAt : new Date(
			now.getTime() + getRetryDelayMs(attempts)
		),
		lastError: getErrorMessage(error),
		deliveryClaimedAt: null,
		deliveryClaimExpiresAt: null
	});
	return failed ? 'failed' : 'pending';
}

function getChatDeliveryId(messageId: string, recipientOwnerId: string): string {
	return `${messageId}:${recipientOwnerId}`;
}

function getRetryDelayMs(attempts: number): number {
	return Math.min(
		minimumRetryDelayMs * (2 ** Math.max(0, attempts - 1)),
		maximumRetryDelayMs
	);
}

function getErrorMessage(error): string {
	const message = error?.message || String(error);
	return message.slice(0, 2000);
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}
