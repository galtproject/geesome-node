import assert from 'node:assert';
import peerIdHelper from 'geesome-libs/src/peerIdHelper.js';
import {processChatDeliveryQueue} from '../app/modules/chat/delivery.js';
import {ChatDeliveryState} from '../app/modules/chat/interface.js';
import {
	chatDeliveryProtocol,
	signChatAcknowledgement
} from '../app/modules/chat/transport.js';

describe('chat delivery queue', function () {
	this.timeout(10000);
	it('records a recipient-signed acknowledgement', async () => {
		const sender = await createTransportIdentity();
		const recipient = await createTransportIdentity();
		const row = createDeliveryRow(sender, recipient);
		const models = {
			ChatDelivery: {
				claimDue: async () => [row]
			}
		};
		const result = await processChatDeliveryQueue(models, {
			getSigner: async () => sender,
			deliverChatRequest: async (_inboxUrl, delivery) => {
				return signChatAcknowledgement({
					version: chatDeliveryProtocol,
					deliveryId: delivery.deliveryId,
					messageId: delivery.envelope.messageId,
					eventHash: row.event.eventHash,
					recipientOwnerId: recipient.ownerId,
					acceptedSequence: '8',
					headSequence: '11',
					receivedAt: new Date().toISOString()
				}, recipient);
			}
		});

		assert.deepEqual(result, {
			processed: 1,
			delivered: 1,
			failed: 0,
			pending: 0
		});
		assert.equal(row.state, ChatDeliveryState.Delivered);
		assert.equal(row.acknowledgedSequence, '8');
		assert.equal(row.acknowledgedHeadSequence, '11');
		assert.equal(row.attempts, 1);
	});

	it('releases a failed claim for bounded retry', async () => {
		const sender = await createTransportIdentity();
		const recipient = await createTransportIdentity();
		const row = createDeliveryRow(sender, recipient);
		const result = await processChatDeliveryQueue({
			ChatDelivery: {
				claimDue: async () => [row]
			}
		}, {
			getSigner: async () => sender,
			deliverChatRequest: async () => {
				throw new Error('recipient_offline');
			},
			now: new Date('2026-07-28T12:00:00.000Z')
		});

		assert.equal(result.pending, 1);
		assert.equal(row.state, ChatDeliveryState.Pending);
		assert.equal(row.attempts, 1);
		assert.equal(row.lastError, 'recipient_offline');
		assert.equal(row.deliveryClaimedAt, null);
		assert.equal(row.deliveryClaimExpiresAt, null);
		assert.ok(row.nextAttemptAt > new Date('2026-07-28T12:00:00.000Z'));
	});
});

function createDeliveryRow(sender, recipient) {
	const row: any = {
		id: 1,
		chatEventId: 1,
		recipientOwnerId: recipient.ownerId,
		recipientPublicKey: recipient.publicKey,
		inboxUrl: 'https://recipient.example/v1/chat/inbox',
		state: ChatDeliveryState.Pending,
		attempts: 0,
		nextAttemptAt: new Date(),
		deliveryClaimedAt: new Date(),
		deliveryClaimExpiresAt: new Date(),
		event: {
			id: 1,
			messageId: 'delivery-message-1',
			conversationId: 'delivery-conversation-1',
			sequence: '1',
			sourceSequence: '1',
			senderOwnerId: sender.ownerId,
			senderBundleJson: JSON.stringify({keyId: 'sender-device'}),
			envelopeJson: JSON.stringify({
				messageId: 'delivery-message-1',
				conversationId: 'delivery-conversation-1'
			}),
			eventHash: 'delivery-event-hash'
		}
	};
	row.update = async updateData => {
		Object.assign(row, updateData);
		return row;
	};
	return row;
}

async function createTransportIdentity() {
	const peerId = await peerIdHelper.createPeerId();
	return {
		ownerId: peerIdHelper.peerIdToCid(peerId),
		publicKey: peerIdHelper.peerIdToPublicBase64(peerId),
		sign: async data => Buffer.from(await peerId.privKey.sign(data))
	};
}
