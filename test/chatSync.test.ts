import assert from 'node:assert';
import peerIdHelper from 'geesome-libs/src/peerIdHelper.js';
import {
	assertValidChatSyncPage,
	createChatSyncResponse,
	getChatSyncPageCursor
} from '../app/modules/chat/reconciliation.js';
import {
	chatSyncProtocol,
	requestChatSync,
	signChatSyncRequest,
	signChatSyncResponse,
	verifyChatSyncRequest,
	verifyChatSyncResponse
} from '../app/modules/chat/sync.js';

describe('chat reconciliation protocol', function () {
	this.timeout(10000);

	it('authenticates requests, responses, and bounded encrypted pages', async () => {
		const requester = await createTransportIdentity();
		const source = await createTransportIdentity();
		const request = await signChatSyncRequest({
			version: chatSyncProtocol,
			requestId: 'sync-request-1',
			requestedAt: new Date().toISOString(),
			requesterOwnerId: requester.ownerId,
			requesterPublicKey: requester.publicKey,
			sourceOwnerId: source.ownerId,
			conversationId: 'sync-conversation-1',
			afterSourceSequence: '0',
			limit: 2
		}, requester);
		await verifyChatSyncRequest(request);

		const eventRows = [1, 3, 5].map(sequence => createEventRow(
			source.ownerId,
			requester.ownerId,
			sequence
		));
		const models = createSyncModels(eventRows);
		const response = await createChatSyncResponse(
			models,
			request,
			source,
			'https://source.example/v1/chat/sync'
		);
		await verifyChatSyncResponse(response, {
			requestId: request.requestId,
			requesterOwnerId: requester.ownerId,
			sourceOwnerId: source.ownerId,
			sourcePublicKey: source.publicKey,
			conversationId: request.conversationId
		});
		assert.equal(response.headSourceSequence, '5');
		assert.equal(response.hasMore, true);
		assert.deepEqual(
			response.deliveries.map(delivery => delivery.sourceSequence),
			['1', '3']
		);
		assertValidChatSyncPage(response, '0');
		assert.equal(getChatSyncPageCursor(response, '0'), '3');

		await assert.rejects(
			() => verifyChatSyncResponse({
				...response,
				headSourceSequence: '6'
			}, {
				requestId: request.requestId,
				requesterOwnerId: requester.ownerId,
				sourceOwnerId: source.ownerId,
				sourcePublicKey: source.publicKey,
				conversationId: request.conversationId
			}),
			/chat_sync_response_signature_invalid/
		);
	});

	it('rejects incomplete final pages and private DNS sync targets', async () => {
		const requester = await createTransportIdentity();
		const source = await createTransportIdentity();
		const response = await signChatSyncResponse({
			version: chatSyncProtocol,
			requestId: 'sync-request-invalid',
			respondedAt: new Date().toISOString(),
			requesterOwnerId: requester.ownerId,
			sourceOwnerId: source.ownerId,
			conversationId: 'sync-conversation-invalid',
			headSourceSequence: '5',
			hasMore: false,
			deliveries: []
		}, source);
		assert.throws(
			() => assertValidChatSyncPage(response, '0'),
			/chat_sync_incomplete_final_page/
		);
		assert.throws(
			() => assertValidChatSyncPage({
				...response,
				headSourceSequence: '4'
			}, '5'),
			/chat_sync_source_head_regressed/
		);

		await assert.rejects(
			() => requestChatSync(
				'https://sync.example/v1/chat/sync',
				{} as any,
				{
					lookup: async () => [{address: '127.0.0.1', family: 4}] as any
				}
			),
			/chat_sync_address_not_allowed/
		);
	});
});

function createSyncModels(events) {
	return {
		ChatEvent: {
			findOne: async ({where}) => {
				return events
					.filter(event => event.conversationId === where.conversationId)
					.sort((first, second) => Number(second.sourceSequence) - Number(first.sourceSequence))[0] || null;
			},
			findAll: async ({where, limit}) => {
				return events
					.filter(event =>
						event.conversationId === where.conversationId &&
						BigInt(event.sourceSequence) > BigInt(where.sourceSequence[Object.getOwnPropertySymbols(where.sourceSequence)[0]])
					)
					.slice(0, limit);
			}
		}
	};
}

function createEventRow(sourceOwnerId: string, recipientOwnerId: string, sequence: number) {
	return {
		id: sequence,
		messageId: `sync-message-${sequence}`,
		conversationId: 'sync-conversation-1',
		sequence: String(sequence),
		sourceSequence: String(sequence),
		senderOwnerId: sourceOwnerId,
		senderBundleJson: JSON.stringify({keyId: 'source-device'}),
		envelopeJson: JSON.stringify({
			messageId: `sync-message-${sequence}`,
			conversationId: 'sync-conversation-1',
			recipients: [{ownerId: recipientOwnerId}]
		}),
		eventHash: `sync-event-hash-${sequence}`
	};
}

async function createTransportIdentity() {
	const peerId = await peerIdHelper.createPeerId();
	return {
		ownerId: peerIdHelper.peerIdToCid(peerId),
		publicKey: peerIdHelper.peerIdToPublicBase64(peerId),
		sign: async data => Buffer.from(await peerId.privKey.sign(data))
	};
}
