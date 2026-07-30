import axios from 'axios';
import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import commonHelper from 'geesome-libs/src/common.js';
import peerIdHelper from 'geesome-libs/src/peerIdHelper.js';
import {createSafeHttpsAgent} from '../../helpers/safeHttpsAgent.js';

export const chatDeliveryProtocol = 'geesome-chat-delivery-v1';
export const chatTransportSignatureAlgorithm = 'libp2p-key-v1';

const defaultRequestTimeoutMs = 15 * 1000;
const maximumResponseBytes = 64 * 1024;
const maximumClockSkewMs = 5 * 60 * 1000;

export interface IChatTransportSigner {
	ownerId: string;
	publicKey: string;
	sign(data: Buffer): Promise<Buffer>;
}

export interface IChatDeliveryPayload {
	version: typeof chatDeliveryProtocol;
	deliveryId: string;
	sentAt: string;
	sender: {
		ownerId: string;
		publicKey: string;
		deviceBundle: any;
		syncUrl: string | null;
	};
	recipientOwnerId: string;
	sourceSequence: string;
	envelope: any;
	signature: {
		algorithm: typeof chatTransportSignatureAlgorithm;
		keyId: string;
		value: string;
	};
}

export interface IChatDeliveryAcknowledgement {
	version: typeof chatDeliveryProtocol;
	deliveryId: string;
	messageId: string;
	eventHash: string;
	recipientOwnerId: string;
	acceptedSequence: string;
	headSequence: string;
	receivedAt: string;
	publicKey: string;
	signature: {
		algorithm: typeof chatTransportSignatureAlgorithm;
		keyId: string;
		value: string;
	};
}

export async function signChatDelivery(
	input: Omit<IChatDeliveryPayload, 'signature'>,
	signer: IChatTransportSigner
): Promise<IChatDeliveryPayload> {
	assertSignerMatchesOwner(signer, input.sender.ownerId);
	const signature = await signer.sign(getSigningBytes(input));
	return {
		...input,
		signature: {
			algorithm: chatTransportSignatureAlgorithm,
			keyId: signer.ownerId,
			value: signature.toString('base64')
		}
	};
}

export async function verifyChatDelivery(
	delivery: IChatDeliveryPayload,
	now = new Date()
): Promise<void> {
	assertExactKeys(delivery, [
		'deliveryId',
		'envelope',
		'recipientOwnerId',
		'sender',
		'sentAt',
		'signature',
		'sourceSequence',
		'version'
	]);
	assertExactKeys(delivery.sender, ['deviceBundle', 'ownerId', 'publicKey', 'syncUrl']);
	assertTransportSignatureShape(delivery.signature);
	if (delivery.version !== chatDeliveryProtocol) {
		throw new Error('chat_delivery_version_invalid');
	}
	assertRecentTimestamp(delivery.sentAt, now);
	if (delivery.signature.keyId !== delivery.sender.ownerId) {
		throw new Error('chat_delivery_signature_owner_mismatch');
	}
	await assertPublicKeyMatchesOwner(delivery.sender.publicKey, delivery.sender.ownerId);
	if (delivery.sender.syncUrl !== null) {
		normalizeChatSyncUrl(delivery.sender.syncUrl);
	}
	const {signature, ...unsignedDelivery} = delivery;
	const valid = await peerIdHelper.verifyWithPublicKeyBase64(
		delivery.sender.publicKey,
		getSigningBytes(unsignedDelivery),
		Buffer.from(signature.value, 'base64')
	);
	if (!valid) {
		throw new Error('chat_delivery_signature_invalid');
	}
}

export async function signChatAcknowledgement(
	input: Omit<IChatDeliveryAcknowledgement, 'publicKey' | 'signature'>,
	signer: IChatTransportSigner
): Promise<IChatDeliveryAcknowledgement> {
	assertSignerMatchesOwner(signer, input.recipientOwnerId);
	const unsignedAcknowledgement = {
		...input,
		publicKey: signer.publicKey
	};
	const signature = await signer.sign(getSigningBytes(unsignedAcknowledgement));
	return {
		...unsignedAcknowledgement,
		signature: {
			algorithm: chatTransportSignatureAlgorithm,
			keyId: signer.ownerId,
			value: signature.toString('base64')
		}
	};
}

export async function verifyChatAcknowledgement(
	acknowledgement: IChatDeliveryAcknowledgement,
	expected: {
		deliveryId: string;
		messageId: string;
		eventHash: string;
		recipientOwnerId: string;
		publicKey: string;
	}
): Promise<void> {
	assertExactKeys(acknowledgement, [
		'acceptedSequence',
		'deliveryId',
		'eventHash',
		'headSequence',
		'messageId',
		'publicKey',
		'receivedAt',
		'recipientOwnerId',
		'signature',
		'version'
	]);
	assertTransportSignatureShape(acknowledgement.signature);
	if (acknowledgement.version !== chatDeliveryProtocol) {
		throw new Error('chat_ack_version_invalid');
	}
	if (
		acknowledgement.deliveryId !== expected.deliveryId ||
		acknowledgement.messageId !== expected.messageId ||
		acknowledgement.eventHash !== expected.eventHash ||
		acknowledgement.recipientOwnerId !== expected.recipientOwnerId
	) {
		throw new Error('chat_ack_delivery_mismatch');
	}
	if (
		acknowledgement.publicKey !== expected.publicKey ||
		acknowledgement.signature.keyId !== expected.recipientOwnerId
	) {
		throw new Error('chat_ack_identity_mismatch');
	}
	await assertPublicKeyMatchesOwner(acknowledgement.publicKey, expected.recipientOwnerId);
	const {signature, ...unsignedAcknowledgement} = acknowledgement;
	const valid = await peerIdHelper.verifyWithPublicKeyBase64(
		acknowledgement.publicKey,
		getSigningBytes(unsignedAcknowledgement),
		Buffer.from(signature.value, 'base64')
	);
	if (!valid) {
		throw new Error('chat_ack_signature_invalid');
	}
}

export async function deliverChatRequest(
	inboxUrl: string,
	delivery: IChatDeliveryPayload,
	options: {timeoutMs?: number; allowHttp?: boolean; lookup?: typeof dnsLookup} = {}
): Promise<IChatDeliveryAcknowledgement> {
	return postChatTransportJson(
		normalizeChatInboxUrl(inboxUrl, options),
		{delivery},
		{
			timeoutMs: options.timeoutMs,
			lookup: options.lookup,
			maximumResponseBytes
		}
	);
}

export async function postChatTransportJson(
	url: string,
	body: any,
	options: {
		timeoutMs?: number;
		lookup?: typeof dnsLookup;
		maximumResponseBytes?: number;
		errorPrefix?: string;
	} = {}
): Promise<any> {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		parsePositiveInteger(options.timeoutMs, defaultRequestTimeoutMs)
	);
	let httpsAgent;
	try {
		if (url.startsWith('https:')) {
				httpsAgent = await createSafeHttpsAgent(new URL(url).hostname, {
					lookup: options.lookup || dnsLookup,
					errorPrefix: options.errorPrefix || 'chat_inbox_url'
				});
			}
			const response = await axios.post(url, body, {
			headers: {'content-type': 'application/json'},
			maxRedirects: 0,
			maxContentLength: parsePositiveInteger(
				options.maximumResponseBytes,
				maximumResponseBytes
			),
			signal: controller.signal,
			timeout: parsePositiveInteger(options.timeoutMs, defaultRequestTimeoutMs),
			httpsAgent
		});
		return response.data as IChatDeliveryAcknowledgement;
	} catch (error) {
		if (error?.response?.status) {
			throw createChatTransportHttpError(
				options.errorPrefix || 'chat_delivery',
				error.response.status
			);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
		httpsAgent?.destroy();
	}
}

export function normalizeChatInboxUrl(
	value: string,
	options: {allowHttp?: boolean} = {}
): string {
	return normalizeChatTransportUrl(value, options, 'chat_inbox_url');
}

export function normalizeChatSyncUrl(
	value: string,
	options: {allowHttp?: boolean} = {}
): string {
	return normalizeChatTransportUrl(value, options, 'chat_sync_url');
}

function normalizeChatTransportUrl(
	value: string,
	options: {allowHttp?: boolean},
	errorPrefix: string
): string {
	let url: URL;
	try {
		url = new URL(String(value || ''));
	} catch (error) {
		throw new Error(`${errorPrefix}_invalid`);
	}
	const allowHttp = options.allowHttp === true && url.protocol === 'http:';
	if (url.protocol !== 'https:' && !allowHttp) {
		throw new Error(`${errorPrefix}_https_required`);
	}
	if (url.username || url.password || url.search || url.hash) {
		throw new Error(`${errorPrefix}_invalid`);
	}
	if (isPrivateChatHostname(url.hostname) && !allowHttp) {
		throw new Error(`${errorPrefix}_private_host`);
	}
	url.pathname = url.pathname.replace(/\/+$/, '');
	return url.toString();
}

export function getChatTransportSigningBytes(value): Buffer {
	return Buffer.from(JSON.stringify(commonHelper.sortObject(value)), 'utf8');
}

export async function assertPublicKeyMatchesOwner(
	publicKey: string,
	ownerId: string
): Promise<void> {
	const peerId = await peerIdHelper.createPeerIdFromPublicBase64(publicKey);
	if (peerIdHelper.peerIdToCid(peerId) !== ownerId) {
		throw new Error('chat_transport_public_key_owner_mismatch');
	}
}

function getSigningBytes(value): Buffer {
	return getChatTransportSigningBytes(value);
}

function assertSignerMatchesOwner(signer: IChatTransportSigner, ownerId: string): void {
	if (signer.ownerId !== ownerId) {
		throw new Error('chat_transport_signer_owner_mismatch');
	}
}

function assertTransportSignatureShape(signature): void {
	assertExactKeys(signature, ['algorithm', 'keyId', 'value']);
	if (
		signature.algorithm !== chatTransportSignatureAlgorithm ||
		typeof signature.keyId !== 'string' ||
		typeof signature.value !== 'string'
	) {
		throw new Error('chat_transport_signature_invalid');
	}
}

function assertRecentTimestamp(value: string, now: Date): void {
	const timestamp = new Date(value).getTime();
	if (!Number.isFinite(timestamp)) {
		throw new Error('chat_delivery_timestamp_invalid');
	}
	if (Math.abs(now.getTime() - timestamp) > maximumClockSkewMs) {
		throw new Error('chat_delivery_timestamp_out_of_range');
	}
}

function assertExactKeys(value, expectedKeys: string[]): void {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('chat_transport_fields_invalid');
	}
	const keys = Object.keys(value).sort();
	const expected = [...expectedKeys].sort();
	if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
		throw new Error('chat_transport_fields_invalid');
	}
}

function isPrivateChatHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
		return true;
	}
	const addressType = isIP(normalized);
	if (addressType === 4) {
		const [first, second] = normalized.split('.').map(Number);
		return first === 10 ||
			first === 127 ||
			(first === 169 && second === 254) ||
			(first === 172 && second >= 16 && second <= 31) ||
			(first === 192 && second === 168);
	}
	if (addressType === 6) {
		return normalized === '::1' ||
			normalized.startsWith('fc') ||
			normalized.startsWith('fd') ||
			normalized.startsWith('fe80:');
	}
	return false;
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}

function createChatTransportHttpError(prefix: string, statusValue): Error {
	const status = Number(statusValue);
	const error: any = new Error(`${prefix}_http_${status}`);
	error.statusCode = status;
	error.retryable = status === 408 ||
		status === 425 ||
		status === 429 ||
		status >= 500;
	return error;
}
