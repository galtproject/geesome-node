import assert from 'node:assert';
import {Op} from 'sequelize';
import browserE2eeHelper from 'geesome-libs/src/browserE2eeHelper.js';
import {getModule as getChatModule} from '../app/modules/chat/index.js';
import {ChatReceiptState} from '../app/modules/chat/interface.js';

describe('chat module', () => {
	it('binds signed public device bundles to the authenticated account identity', async () => {
		const {chat} = createChatHarness();
		const alice = await createDevice('owner-alice', 'alice-browser');

		const registered = await chat.registerDevice(1, alice.publicBundle);
		assert.equal(registered.ownerId, 'owner-alice');
		assert.equal(registered.deviceId, 'alice-browser');
		assert.equal(registered.publicBundle.keyId, alice.publicBundle.keyId);

		const replay = await chat.registerDevice(1, alice.publicBundle);
		assert.equal(replay.keyId, alice.publicBundle.keyId);
		assert.equal((await chat.getOwnDevices(1)).length, 1);

		const wrongOwner = await createDevice('owner-mallory', 'mallory-browser');
		await assert.rejects(
			() => chat.registerDevice(1, wrongOwner.publicBundle),
			/device_owner_mismatch/
		);

		await assert.rejects(
			() => chat.registerDevice(1, {
				...alice.publicBundle,
				privateKeys: {signingKey: 'must-never-reach-the-node'}
			}),
			/device_bundle_fields_invalid/
		);
	});

	it('stores only signed opaque ciphertext and replays identical message ids', async () => {
		const {chat, rows} = createChatHarness();
		const alice = await createDevice('owner-alice', 'alice-browser');
		const bob = await createDevice('owner-bob', 'bob-browser');
		await chat.registerDevice(1, alice.publicBundle);
		await chat.registerDevice(2, bob.publicBundle);
		const envelope = await createEnvelope('secret message', alice, bob, 'message-1');

		const accepted = await chat.acceptEncryptedEvent(1, envelope);
		assert.equal(accepted.replay, false);
		assert.equal(accepted.event.sequence, '1');
		assert.equal(JSON.stringify(accepted.event.envelope).includes('secret message'), false);
		assert.equal(rows.events[0].envelopeJson.includes('secret message'), false);
		assert.equal(rows.recipients[0].userId, 2);

		const replay = await chat.acceptEncryptedEvent(1, JSON.parse(JSON.stringify(envelope)));
		assert.equal(replay.replay, true);
		assert.equal(replay.event.sequence, '1');
		assert.equal(rows.events.length, 1);

		const conflictingEnvelope = await createEnvelope('different message', alice, bob, 'message-1');
		await assert.rejects(
			() => chat.acceptEncryptedEvent(1, conflictingEnvelope),
			/message_id_conflict/
		);

		const plaintextMetadata = await createEnvelope('encrypted body', alice, bob, 'message-metadata');
		plaintextMetadata.metadata = {text: 'plaintext leak'};
		await assert.rejects(
			() => chat.acceptEncryptedEvent(1, plaintextMetadata),
			/encrypted_envelope_fields_invalid/
		);
	});

	it('rejects revoked sender and locally known recipient devices', async () => {
		const {chat} = createChatHarness();
		const alice = await createDevice('owner-alice', 'alice-browser');
		const bob = await createDevice('owner-bob', 'bob-browser');
		await chat.registerDevice(1, alice.publicBundle);
		await chat.registerDevice(2, bob.publicBundle);
		const envelope = await createEnvelope('before revoke', alice, bob, 'message-revoked-recipient');

		await chat.revokeDevice(2, bob.publicBundle.deviceId);
		await assert.rejects(
			() => chat.acceptEncryptedEvent(1, envelope),
			/recipient_device_revoked/
		);

		await chat.revokeDevice(1, alice.publicBundle.deviceId);
		const senderRevokedEnvelope = await createEnvelope(
			'after sender revoke',
			alice,
			bob,
			'message-revoked-sender'
		);
		await assert.rejects(
			() => chat.acceptEncryptedEvent(1, senderRevokedEnvelope),
			/active_sender_device_not_found/
		);
	});

	it('returns ordered recipient events and restricts receipts to recipients', async () => {
		const {chat} = createChatHarness();
		const alice = await createDevice('owner-alice', 'alice-browser');
		const bob = await createDevice('owner-bob', 'bob-browser');
		await chat.registerDevice(1, alice.publicBundle);
		await chat.registerDevice(2, bob.publicBundle);
		await chat.acceptEncryptedEvent(
			1,
			await createEnvelope('first', alice, bob, 'message-first')
		);
		await chat.acceptEncryptedEvent(
			1,
			await createEnvelope('second', alice, bob, 'message-second')
		);

		const bobEvents = await chat.getEncryptedEvents(2, 'conversation-1', {
			afterSequence: '1',
			limit: 10
		});
		assert.equal(bobEvents.total, 1);
		assert.equal(bobEvents.list[0].messageId, 'message-second');
		assert.equal(bobEvents.list[0].sequence, '2');
		assert.deepEqual(await chat.getConversationHead(2, 'conversation-1'), {
			conversationId: 'conversation-1',
			lastSequence: '2'
		});

		const received = await chat.setEventReceipt(2, 'message-second', ChatReceiptState.Received);
		assert.equal(received.state, ChatReceiptState.Received);
		assert.ok(received.receivedAt);
		const read = await chat.setEventReceipt(2, 'message-second', ChatReceiptState.Read);
		assert.equal(read.state, ChatReceiptState.Read);
		assert.ok(read.readAt);

		await assert.rejects(
			() => chat.setEventReceipt(1, 'message-second', ChatReceiptState.Read),
			/event_not_found/
		);
	});
});

async function createDevice(ownerId: string, deviceId: string) {
	return browserE2eeHelper.generateDeviceKeys({
		ownerId,
		deviceId,
		createdAt: '2026-07-28T00:00:00.000Z'
	});
}

async function createEnvelope(message, sender, recipient, messageId: string) {
	return browserE2eeHelper.encryptEnvelope(
		message,
		[recipient.publicBundle],
		sender,
		{
			messageId,
			conversationId: 'conversation-1',
			createdAt: '2026-07-28T00:01:00.000Z'
		}
	);
}

function createChatHarness() {
	const rows = {
		devices: [],
		heads: [],
		events: [],
		recipients: [],
		receipts: []
	};
	const models = createModels(rows);
	const app: any = {
		checkUserCan: async () => true,
		ms: {
			database: {
				getUser: async userId => ({
					id: userId,
					storageAccountId: userId === 1 ? 'owner-alice' : 'owner-bob'
				}),
				sequelize: {
					escape: value => String(Number(value)),
					transaction: async callback => callback({LOCK: {UPDATE: 'UPDATE'}})
				}
			}
		}
	};
	return {
		chat: getChatModule(app, models),
		rows
	};
}

function createModels(rows) {
	return {
		ChatDevice: {
			create: async data => addRow(rows.devices, {revokedAt: null, ...data}),
			findOne: async ({where}) => rows.devices.find(row => matchesWhere(row, where)) || null,
			findAll: async ({where}) => rows.devices
				.filter(row => matchesWhere(row, where))
				.sort(compareRows),
			destroy: async () => clearRows(rows.devices)
		},
		ChatConversationHead: {
			findOrCreate: async ({where, defaults}) => {
				let head = rows.heads.find(row => matchesWhere(row, where));
				if (!head) {
					head = addRow(rows.heads, defaults);
					return [head, true];
				}
				return [head, false];
			},
			findOne: async ({where}) => rows.heads.find(row => matchesWhere(row, where)) || null,
			destroy: async () => clearRows(rows.heads)
		},
		ChatEvent: {
			create: async data => addRow(rows.events, data),
			findOne: async ({where, include = []}) => {
				const event = rows.events.find(row => matchesWhere(row, where));
				if (!event || !include.length) {
					return event || null;
				}
				const recipientUserId = include[0].where?.userId;
				return rows.recipients.some(recipient =>
					recipient.chatEventId === event.id && recipient.userId === recipientUserId
				) ? event : null;
			},
			findAndCountAll: async ({where, limit}) => {
				const or = where[Op.or];
				const senderUserId = or[0].senderUserId;
				const recipientUserId = Number(
					String(or[1].val).match(/"userId" = ([0-9]+)/)?.[1]
				);
				const afterSequence = where.sequence?.[Op.gt];
				const matching = rows.events.filter(event =>
					event.conversationId === where.conversationId &&
					(afterSequence === undefined || BigInt(event.sequence) > BigInt(afterSequence)) &&
					(
						event.senderUserId === senderUserId ||
						rows.recipients.some(recipient =>
							recipient.chatEventId === event.id && recipient.userId === recipientUserId
						)
					)
				).sort((left, right) => Number(BigInt(left.sequence) - BigInt(right.sequence)));
				return {
					rows: matching.slice(0, limit),
					count: matching.length
				};
			},
			destroy: async () => clearRows(rows.events)
		},
		ChatEventRecipient: {
			bulkCreate: async records => records.map(record => addRow(rows.recipients, record)),
			destroy: async () => clearRows(rows.recipients)
		},
		ChatEventReceipt: {
			findOrCreate: async ({where, defaults}) => {
				let receipt = rows.receipts.find(row => matchesWhere(row, where));
				if (!receipt) {
					receipt = addRow(rows.receipts, defaults);
					return [receipt, true];
				}
				return [receipt, false];
			},
			destroy: async () => clearRows(rows.receipts)
		}
	};
}

function addRow(rows, data) {
	const now = new Date('2026-07-28T00:10:00.000Z');
	const row: any = {
		id: rows.length + 1,
		...data,
		createdAt: now,
		updatedAt: now
	};
	row.update = async updateData => {
		Object.assign(row, updateData, {updatedAt: now});
		return row;
	};
	rows.push(row);
	return row;
}

function matchesWhere(row, where) {
	return Object.entries(where || {}).every(([field, expected]: [string, any]) => {
		if (expected && typeof expected === 'object') {
			const symbols = Object.getOwnPropertySymbols(expected);
			if (symbols.includes(Op.in)) {
				return expected[Op.in].includes(row[field]);
			}
		}
		return row[field] === expected;
	});
}

function compareRows(left, right) {
	return Number(left.id) - Number(right.id);
}

function clearRows(rows) {
	const count = rows.length;
	rows.splice(0, rows.length);
	return count;
}
