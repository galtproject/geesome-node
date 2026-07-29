import assert from 'node:assert';
import browserE2eeHelper from 'geesome-libs/src/browserE2eeHelper.js';
import peerIdHelper from 'geesome-libs/src/peerIdHelper.js';
import {
	chatDeliveryProtocol,
	deliverChatRequest,
	normalizeChatInboxUrl,
	signChatAcknowledgement,
	signChatDelivery,
	verifyChatAcknowledgement,
	verifyChatDelivery
} from '../app/modules/chat/transport.js';

describe('chat transport', function () {
	this.timeout(10000);
	it('authenticates delivery and acknowledgement identities', async () => {
		const senderIdentity = await createTransportIdentity();
		const recipientIdentity = await createTransportIdentity();
		const senderDevice = await browserE2eeHelper.generateDeviceKeys({
			ownerId: senderIdentity.ownerId,
			deviceId: 'sender-browser'
		});
		const recipientDevice = await browserE2eeHelper.generateDeviceKeys({
			ownerId: recipientIdentity.ownerId,
			deviceId: 'recipient-browser'
		});
		const envelope = await browserE2eeHelper.encryptEnvelope(
			'transport secret',
			[recipientDevice.publicBundle],
			senderDevice,
			{
				messageId: 'transport-message-1',
				conversationId: 'transport-conversation-1'
			}
		);
		const deliveryId = `${envelope.messageId}:${recipientIdentity.ownerId}`;
		const delivery = await signChatDelivery({
			version: chatDeliveryProtocol,
			deliveryId,
			sentAt: new Date().toISOString(),
			sender: {
				ownerId: senderIdentity.ownerId,
				publicKey: senderIdentity.publicKey,
				deviceBundle: senderDevice.publicBundle,
				syncUrl: 'https://sender.example/v1/chat/sync'
			},
			recipientOwnerId: recipientIdentity.ownerId,
			sourceSequence: '1',
			envelope
		}, senderIdentity);
		await verifyChatDelivery(delivery);

		const acknowledgement = await signChatAcknowledgement({
			version: chatDeliveryProtocol,
			deliveryId,
			messageId: envelope.messageId,
			eventHash: 'event-hash',
			recipientOwnerId: recipientIdentity.ownerId,
			acceptedSequence: '4',
			headSequence: '7',
			receivedAt: new Date().toISOString()
		}, recipientIdentity);
		await verifyChatAcknowledgement(acknowledgement, {
			deliveryId,
			messageId: envelope.messageId,
			eventHash: 'event-hash',
			recipientOwnerId: recipientIdentity.ownerId,
			publicKey: recipientIdentity.publicKey
		});

		await assert.rejects(
			() => verifyChatDelivery({
				...delivery,
				recipientOwnerId: senderIdentity.ownerId
			}),
			/chat_delivery_signature_invalid/
		);
		await assert.rejects(
			() => verifyChatAcknowledgement(acknowledgement, {
				deliveryId,
				messageId: envelope.messageId,
				eventHash: 'different-event-hash',
				recipientOwnerId: recipientIdentity.ownerId,
				publicKey: recipientIdentity.publicKey
			}),
			/chat_ack_delivery_mismatch/
		);
	});

	it('requires public HTTPS inbox URLs outside explicit test mode', () => {
		assert.equal(
			normalizeChatInboxUrl('https://chat.example/v1/chat/inbox/'),
			'https://chat.example/v1/chat/inbox'
		);
		assert.throws(
			() => normalizeChatInboxUrl('http://127.0.0.1:2052/v1/chat/inbox'),
			/chat_inbox_url_https_required/
		);
		assert.equal(
			normalizeChatInboxUrl(
				'http://127.0.0.1:2052/v1/chat/inbox',
				{allowHttp: true}
			),
			'http://127.0.0.1:2052/v1/chat/inbox'
		);
	});

	it('rejects inbox hostnames that resolve to private addresses', async () => {
		await assert.rejects(
			() => deliverChatRequest(
				'https://chat.example/v1/chat/inbox',
				{} as any,
				{
					lookup: async () => [{address: '127.0.0.1', family: 4}] as any
				}
			),
			/chat_inbox_url_address_not_allowed/
		);
	});
});

async function createTransportIdentity() {
	const peerId = await peerIdHelper.createPeerId();
	return {
		ownerId: peerIdHelper.peerIdToCid(peerId),
		publicKey: peerIdHelper.peerIdToPublicBase64(peerId),
		sign: async data => Buffer.from(await peerId.privKey.sign(data))
	};
}
