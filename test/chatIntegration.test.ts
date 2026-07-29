import assert from 'node:assert';
import {createHash} from 'node:crypto';
import browserE2eeHelper from 'geesome-libs/src/browserE2eeHelper.js';
import {CorePermissionName} from '../app/modules/database/interface.js';
import type {IGeesomeApp} from '../app/interface.js';
import {
	chatDeliveryProtocol,
	signChatDelivery,
	verifyChatAcknowledgement
} from '../app/modules/chat/transport.js';

describe('chat persistence', function () {
	this.timeout(60000);

	let app: IGeesomeApp;
	let alice;
	let bob;

	beforeEach(async () => {
		const appConfig: any = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		appConfig.chatConfig.deliveryWorker = false;
		appConfig.chatConfig.autoProcessDeliveries = false;
		app = await (await import('../app/index.js')).default({
			storageConfig: appConfig.storageConfig,
			port: 7771
		});
		await app.flushDatabase();
		alice = await app.setup({
			email: 'alice@example.com',
			name: 'alice',
			password: 'alice'
		}).then(result => result.user);
		bob = await app.registerUser({
			email: 'bob@example.com',
			name: 'bob',
			password: 'bob',
			permissions: [CorePermissionName.UserAll]
		});
	});

	afterEach(async () => {
		await app.stop();
	});

	it('persists encrypted events, sequences, recipient reads, and receipts in PostgreSQL', async () => {
		const aliceDevice = await browserE2eeHelper.generateDeviceKeys({
			ownerId: alice.storageAccountId,
			deviceId: 'alice-browser'
		});
		const bobDevice = await browserE2eeHelper.generateDeviceKeys({
			ownerId: bob.storageAccountId,
			deviceId: 'bob-browser'
		});
		await app.ms.chat.registerDevice(alice.id, aliceDevice.publicBundle);
		await app.ms.chat.registerDevice(bob.id, bobDevice.publicBundle);
		const envelope = await browserE2eeHelper.encryptEnvelope(
			'database secret',
			[bobDevice.publicBundle],
			aliceDevice,
			{
				messageId: 'postgres-message-1',
				conversationId: 'postgres-conversation-1'
			}
		);

		const accepted = await app.ms.chat.acceptEncryptedEvent(alice.id, envelope);
		assert.equal(accepted.replay, false);
		assert.equal(accepted.event.sequence, '1');
		const bobEvents = await app.ms.chat.getEncryptedEvents(
			bob.id,
			'postgres-conversation-1'
		);
		assert.equal(bobEvents.total, 1);
		assert.equal(bobEvents.list[0].envelope.content.ciphertext, envelope.content.ciphertext);
		assert.equal(JSON.stringify(bobEvents.list[0]).includes('database secret'), false);
		const receipt = await app.ms.chat.setEventReceipt(
			bob.id,
			'postgres-message-1',
			'read' as any
		);
		assert.equal(receipt.state, 'read');
		assert.ok(receipt.receivedAt);
		assert.ok(receipt.readAt);

		const concurrentEnvelopes = await Promise.all([
			browserE2eeHelper.encryptEnvelope(
				'concurrent secret 1',
				[bobDevice.publicBundle],
				aliceDevice,
				{
					messageId: 'postgres-concurrent-message-1',
					conversationId: 'postgres-concurrent-conversation'
				}
			),
			browserE2eeHelper.encryptEnvelope(
				'concurrent secret 2',
				[bobDevice.publicBundle],
				aliceDevice,
				{
					messageId: 'postgres-concurrent-message-2',
					conversationId: 'postgres-concurrent-conversation'
				}
			)
		]);
		const concurrentResults = await Promise.all(
			concurrentEnvelopes.map(item => app.ms.chat.acceptEncryptedEvent(alice.id, item))
		);
		assert.deepEqual(
			concurrentResults.map(item => item.event.sequence).sort(),
			['1', '2']
		);
		const concurrentHead = await app.ms.chat.getConversationHead(
			alice.id,
			'postgres-concurrent-conversation'
		);
		assert.equal(concurrentHead.lastSequence, '2');

		const bobTransportPublicKey = await app.ms.accountStorage
			.getStaticIdPublicKeyByOr(bob.storageAccountId);
		const queuedEnvelope = await browserE2eeHelper.encryptEnvelope(
			'queued transport secret',
			[bobDevice.publicBundle],
			aliceDevice,
			{
				messageId: 'postgres-queued-message-1',
				conversationId: 'postgres-queued-conversation'
			}
		);
		await app.ms.chat.acceptEncryptedEvent(alice.id, queuedEnvelope, {
			recipientEndpoints: [{
				ownerId: bob.storageAccountId,
				publicKey: bobTransportPublicKey,
				inboxUrl: 'https://recipient.example/v1/chat/inbox'
			}]
		});
		const deliveryResult = await app.ms.chat.processDeliveryQueue({
			deliverChatRequest: (_inboxUrl, delivery) =>
				app.ms.chat.acceptRemoteDelivery(delivery)
		});
		assert.equal(deliveryResult.delivered, 1);
		const deliveryRows = await app.ms.chat.getEventDeliveries(
			alice.id,
			queuedEnvelope.messageId
		);
		assert.equal(deliveryRows.length, 1);
		assert.equal(deliveryRows[0].state, 'delivered');
		assert.equal(deliveryRows[0].attempts, 1);
		assert.ok(deliveryRows[0].acknowledgedSequence);
		const secondQueuedEnvelope = await browserE2eeHelper.encryptEnvelope(
			'second queued transport secret',
			[bobDevice.publicBundle],
			aliceDevice,
			{
				messageId: 'postgres-queued-message-2',
				conversationId: queuedEnvelope.conversationId
			}
		);
		await app.ms.chat.acceptEncryptedEvent(alice.id, secondQueuedEnvelope);

		const remoteEnvelope = await browserE2eeHelper.encryptEnvelope(
			'remote transport secret',
			[bobDevice.publicBundle],
			aliceDevice,
			{
				messageId: 'postgres-remote-message-1',
				conversationId: 'postgres-remote-conversation'
			}
		);
		const aliceTransportKey = await app.ms.accountStorage.getAccountPeerId(
			alice.storageAccountId
		);
		const aliceTransportPublicKey = await app.ms.accountStorage
			.getStaticIdPublicKeyByOr(alice.storageAccountId);
		const deliveryId = `${remoteEnvelope.messageId}:${bob.storageAccountId}`;
		const delivery = await signChatDelivery({
			version: chatDeliveryProtocol,
			deliveryId,
			sentAt: new Date().toISOString(),
			sender: {
				ownerId: alice.storageAccountId,
				publicKey: aliceTransportPublicKey,
				deviceBundle: aliceDevice.publicBundle,
				syncUrl: 'https://alice.example/v1/chat/sync'
			},
			recipientOwnerId: bob.storageAccountId,
			sourceSequence: '15',
			envelope: remoteEnvelope
		}, {
			ownerId: alice.storageAccountId,
			publicKey: aliceTransportPublicKey,
			sign: async data => Buffer.from(await aliceTransportKey.privKey.sign(data))
		});
		const acknowledgement = await app.ms.chat.acceptRemoteDelivery(delivery);
		const remoteEventHash = getEnvelopeHash(remoteEnvelope);
		await verifyChatAcknowledgement(acknowledgement, {
			deliveryId,
			messageId: remoteEnvelope.messageId,
			eventHash: remoteEventHash,
			recipientOwnerId: bob.storageAccountId,
			publicKey: bobTransportPublicKey
		});
		const remoteEvents = await app.ms.chat.getEncryptedEvents(
			bob.id,
			remoteEnvelope.conversationId
		);
		assert.equal(remoteEvents.total, 1);
		assert.equal(remoteEvents.list[0].state, 'received_remote');
		assert.equal(remoteEvents.list[0].sourceSequence, '15');
		assert.equal(JSON.stringify(remoteEvents.list[0]).includes('remote transport secret'), false);

		const firstReconciliation = await app.ms.chat.reconcileConversation(
			bob.id,
			queuedEnvelope.conversationId,
			{
				sourceOwnerId: alice.storageAccountId,
				sourcePublicKey: aliceTransportPublicKey,
				syncUrl: 'https://alice.example/v1/chat/sync',
				limit: 1,
				maxPages: 1,
				requestChatSync: (_syncUrl, request) =>
					app.ms.chat.acceptSyncRequest(request)
			}
		);
		assert.equal(firstReconciliation.complete, false);
		assert.equal(firstReconciliation.imported, 0);
		assert.equal(firstReconciliation.replayed, 1);
		assert.equal(firstReconciliation.scanAfterSourceSequence, '1');
		assert.equal(firstReconciliation.verifiedSourceSequence, '0');
		assert.equal(firstReconciliation.sourceHeadSequence, '2');

		const resumedReconciliation = await app.ms.chat.reconcileConversation(
			bob.id,
			queuedEnvelope.conversationId,
			{
				sourceOwnerId: alice.storageAccountId,
				requestChatSync: (_syncUrl, request) =>
					app.ms.chat.acceptSyncRequest(request)
			}
		);
		assert.equal(resumedReconciliation.complete, true);
		assert.equal(resumedReconciliation.imported, 0);
		assert.equal(resumedReconciliation.replayed, 1);
		assert.equal(resumedReconciliation.scanAfterSourceSequence, '2');
		assert.equal(resumedReconciliation.verifiedSourceSequence, '2');

		for (const [messageId, plaintext] of [
			['postgres-queued-message-3', 'third queued transport secret'],
			['postgres-queued-message-4', 'fourth queued transport secret']
		]) {
			const nextEnvelope = await browserE2eeHelper.encryptEnvelope(
				plaintext,
				[bobDevice.publicBundle],
				aliceDevice,
				{
					messageId,
					conversationId: queuedEnvelope.conversationId
				}
			);
			await app.ms.chat.acceptEncryptedEvent(alice.id, nextEnvelope);
		}

		let signalSlowResponse;
		const slowResponseReady = new Promise(resolve => {
			signalSlowResponse = resolve;
		});
		let releaseSlowResponse;
		const slowResponseRelease = new Promise(resolve => {
			releaseSlowResponse = resolve;
		});
		const slowReconciliationPromise = app.ms.chat.reconcileConversation(
			bob.id,
			queuedEnvelope.conversationId,
			{
				sourceOwnerId: alice.storageAccountId,
				limit: 1,
				maxPages: 1,
				requestChatSync: async (_syncUrl, request) => {
					const response = await app.ms.chat.acceptSyncRequest(request);
					signalSlowResponse();
					await slowResponseRelease;
					return response;
				}
			}
		);
		await slowResponseReady;
		const fastReconciliation = await app.ms.chat.reconcileConversation(
			bob.id,
			queuedEnvelope.conversationId,
			{
				sourceOwnerId: alice.storageAccountId,
				requestChatSync: (_syncUrl, request) =>
					app.ms.chat.acceptSyncRequest(request)
			}
		);
		releaseSlowResponse();
		const slowReconciliation = await slowReconciliationPromise;
		assert.equal(fastReconciliation.complete, true);
		assert.equal(fastReconciliation.scanAfterSourceSequence, '4');
		assert.equal(slowReconciliation.complete, true);
		assert.equal(slowReconciliation.scanAfterSourceSequence, '4');
		assert.equal(slowReconciliation.verifiedSourceSequence, '4');
	});
});

function getEnvelopeHash(envelope): string {
	return createHash('sha256').update([
		envelope.version,
		envelope.messageId,
		envelope.conversationId,
		envelope.sender.keyId,
		envelope.content.ciphertext,
		envelope.signature.signature
	].join('\n')).digest('hex');
}
