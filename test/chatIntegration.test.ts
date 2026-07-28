import assert from 'node:assert';
import browserE2eeHelper from 'geesome-libs/src/browserE2eeHelper.js';
import {CorePermissionName} from '../app/modules/database/interface.js';
import type {IGeesomeApp} from '../app/interface.js';

describe('chat persistence', function () {
	this.timeout(60000);

	let app: IGeesomeApp;
	let alice;
	let bob;

	beforeEach(async () => {
		const appConfig: any = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
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
	});
});
