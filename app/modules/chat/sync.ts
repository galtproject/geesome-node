import {lookup as dnsLookup} from 'node:dns/promises';
import peerIdHelper from 'geesome-libs/src/peerIdHelper.js';
import {
	assertPublicKeyMatchesOwner,
	chatTransportSignatureAlgorithm,
	getChatTransportSigningBytes,
	IChatDeliveryPayload,
	IChatTransportSigner,
	normalizeChatSyncUrl,
	postChatTransportJson
} from './transport.js';

export const chatSyncProtocol = 'geesome-chat-sync-v1';

const maximumClockSkewMs = 5 * 60 * 1000;
const maximumSyncResponseBytes = 12 * 1024 * 1024;

type IChatTransportSignature = {
	algorithm: typeof chatTransportSignatureAlgorithm;
	keyId: string;
	value: string;
};

export interface IChatSyncRequest {
	version: typeof chatSyncProtocol;
	requestId: string;
	requestedAt: string;
	requesterOwnerId: string;
	requesterPublicKey: string;
	sourceOwnerId: string;
	conversationId: string;
	afterSourceSequence: string;
	limit: number;
	signature: IChatTransportSignature;
}

export interface IChatSyncResponse {
	version: typeof chatSyncProtocol;
	requestId: string;
	respondedAt: string;
	requesterOwnerId: string;
	sourceOwnerId: string;
	sourcePublicKey: string;
	conversationId: string;
	headSourceSequence: string;
	hasMore: boolean;
	deliveries: IChatDeliveryPayload[];
	signature: IChatTransportSignature;
}

export async function signChatSyncRequest(
	input: Omit<IChatSyncRequest, 'signature'>,
	signer: IChatTransportSigner
): Promise<IChatSyncRequest> {
	assertSignerOwner(signer, input.requesterOwnerId);
	return signChatSyncValue(input, signer);
}

export async function verifyChatSyncRequest(
	request: IChatSyncRequest,
	now = new Date()
): Promise<void> {
	assertExactKeys(request, [
		'afterSourceSequence',
		'conversationId',
		'limit',
		'requestId',
		'requestedAt',
		'requesterOwnerId',
		'requesterPublicKey',
		'signature',
		'sourceOwnerId',
		'version'
	]);
	assertSyncSignature(request.signature);
	assertSyncProtocol(request.version);
	assertRecentTimestamp(request.requestedAt, now);
	if (request.signature.keyId !== request.requesterOwnerId) {
		throw new Error('chat_sync_request_identity_mismatch');
	}
	await assertPublicKeyMatchesOwner(
		request.requesterPublicKey,
		request.requesterOwnerId
	);
	await verifySignedChatSyncValue(
		request,
		request.requesterPublicKey,
		'chat_sync_request_signature_invalid'
	);
}

export async function signChatSyncResponse(
	input: Omit<IChatSyncResponse, 'sourcePublicKey' | 'signature'>,
	signer: IChatTransportSigner
): Promise<IChatSyncResponse> {
	assertSignerOwner(signer, input.sourceOwnerId);
	return signChatSyncValue({
		...input,
		sourcePublicKey: signer.publicKey
	}, signer);
}

export async function verifyChatSyncResponse(
	response: IChatSyncResponse,
	expected: {
		requestId: string;
		requesterOwnerId: string;
		sourceOwnerId: string;
		sourcePublicKey: string;
		conversationId: string;
	},
	now = new Date()
): Promise<void> {
	assertExactKeys(response, [
		'conversationId',
		'deliveries',
		'hasMore',
		'headSourceSequence',
		'requestId',
		'requesterOwnerId',
		'respondedAt',
		'signature',
		'sourceOwnerId',
		'sourcePublicKey',
		'version'
	]);
	assertSyncSignature(response.signature);
	assertSyncProtocol(response.version);
	assertRecentTimestamp(response.respondedAt, now);
	if (
		response.requestId !== expected.requestId ||
		response.requesterOwnerId !== expected.requesterOwnerId ||
		response.sourceOwnerId !== expected.sourceOwnerId ||
		response.sourcePublicKey !== expected.sourcePublicKey ||
		response.conversationId !== expected.conversationId ||
		response.signature.keyId !== expected.sourceOwnerId
	) {
		throw new Error('chat_sync_response_identity_mismatch');
	}
	if (!Array.isArray(response.deliveries) || typeof response.hasMore !== 'boolean') {
		throw new Error('chat_sync_response_fields_invalid');
	}
	await assertPublicKeyMatchesOwner(response.sourcePublicKey, response.sourceOwnerId);
	await verifySignedChatSyncValue(
		response,
		response.sourcePublicKey,
		'chat_sync_response_signature_invalid'
	);
}

export async function requestChatSync(
	syncUrl: string,
	request: IChatSyncRequest,
	options: {
		timeoutMs?: number;
		allowHttp?: boolean;
		lookup?: typeof dnsLookup;
	} = {}
): Promise<IChatSyncResponse> {
	return postChatTransportJson(
		normalizeChatSyncUrl(syncUrl, options),
		{request},
		{
			timeoutMs: options.timeoutMs,
			lookup: options.lookup,
			maximumResponseBytes: maximumSyncResponseBytes,
			errorPrefix: 'chat_sync'
		}
	);
}

async function signChatSyncValue(input, signer: IChatTransportSigner) {
	const signature = await signer.sign(getChatTransportSigningBytes(input));
	return {
		...input,
		signature: {
			algorithm: chatTransportSignatureAlgorithm,
			keyId: signer.ownerId,
			value: signature.toString('base64')
		}
	};
}

async function verifySignedChatSyncValue(value, publicKey: string, errorCode: string) {
	const {signature, ...unsignedValue} = value;
	const valid = await peerIdHelper.verifyWithPublicKeyBase64(
		publicKey,
		getChatTransportSigningBytes(unsignedValue),
		Buffer.from(signature.value, 'base64')
	);
	if (!valid) {
		throw new Error(errorCode);
	}
}

function assertSignerOwner(signer: IChatTransportSigner, ownerId: string): void {
	if (signer.ownerId !== ownerId) {
		throw new Error('chat_sync_signer_owner_mismatch');
	}
}

function assertSyncProtocol(version: string): void {
	if (version !== chatSyncProtocol) {
		throw new Error('chat_sync_version_invalid');
	}
}

function assertSyncSignature(signature): void {
	assertExactKeys(signature, ['algorithm', 'keyId', 'value']);
	if (
		signature.algorithm !== chatTransportSignatureAlgorithm ||
		typeof signature.keyId !== 'string' ||
		typeof signature.value !== 'string'
	) {
		throw new Error('chat_sync_signature_invalid');
	}
}

function assertRecentTimestamp(value: string, now: Date): void {
	const timestamp = new Date(value).getTime();
	if (
		!Number.isFinite(timestamp) ||
		Math.abs(now.getTime() - timestamp) > maximumClockSkewMs
	) {
		throw new Error('chat_sync_timestamp_out_of_range');
	}
}

function assertExactKeys(value, expectedKeys: string[]): void {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('chat_sync_fields_invalid');
	}
	const keys = Object.keys(value).sort();
	const expected = [...expectedKeys].sort();
	if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
		throw new Error('chat_sync_fields_invalid');
	}
}
