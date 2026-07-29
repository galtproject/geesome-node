import assert from 'node:assert';
import {Op} from 'sequelize';
import browserE2eeHelper from 'geesome-libs/src/browserE2eeHelper.js';
import {getModule as getChatModule} from '../app/modules/chat/index.js';
import {ChatReceiptState} from '../app/modules/chat/interface.js';
import {ChatAttachmentUploadState} from '../app/modules/chat/attachmentLifecycle.js';

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

	it('retains only attachment ciphertext owned by the authenticated sender', async () => {
		const {chat, rows} = createChatHarness({
			contents: [{id: 7, userId: 1, storageId: testAttachmentStorageId, size: 32}]
		});
		const alice = await createDevice('owner-alice', 'alice-browser');
		const bob = await createDevice('owner-bob', 'bob-browser');
		await chat.registerDevice(1, alice.publicBundle);
		await chat.registerDevice(2, bob.publicBundle);
		const envelope = await createEnvelope(
			'encrypted attachment descriptor',
			alice,
			bob,
			'message-attachment',
			{attachmentStorageIds: [testAttachmentStorageId]}
		);

		await chat.acceptEncryptedEvent(1, envelope);
		assert.deepEqual(rows.attachments.map(row => ({
			chatEventId: row.chatEventId,
			contentId: row.contentId,
			storageId: row.storageId
		})), [{
			chatEventId: rows.events[0].id,
			contentId: 7,
			storageId: testAttachmentStorageId
		}]);

		const unownedEnvelope = await createEnvelope(
			'encrypted attachment descriptor',
			alice,
			bob,
			'message-unowned-attachment',
			{attachmentStorageIds: [testUnownedAttachmentStorageId]}
		);
		await assert.rejects(
			() => chat.acceptEncryptedEvent(1, unownedEnvelope),
			/chat_attachment_not_owned/
		);
		const duplicateEnvelope = await createEnvelope(
			'encrypted duplicate attachment descriptor',
			alice,
			bob,
			'message-duplicate-attachment',
			{attachmentStorageIds: [testAttachmentStorageId, testAttachmentStorageId]}
		);
		await assert.rejects(
			() => chat.acceptEncryptedEvent(1, duplicateEnvelope),
			/encrypted_envelope_fields_invalid/
		);
		assert.equal(rows.events.length, 1);
	});

	it('records committed attachment release separately for each participant', async () => {
		const {chat, rows} = createChatHarness({
			contents: [{id: 7, userId: 1, storageId: testAttachmentStorageId, size: 32}]
		});
		const alice = await createDevice('owner-alice', 'alice-browser');
		const bob = await createDevice('owner-bob', 'bob-browser');
		await chat.registerDevice(1, alice.publicBundle);
		await chat.registerDevice(2, bob.publicBundle);
		const envelope = await createEnvelope(
			'encrypted attachment descriptor',
			alice,
			bob,
			'message-release-attachment',
			{attachmentStorageIds: [testAttachmentStorageId]}
		);
		await chat.acceptEncryptedEvent(1, envelope);

		const aliceRelease = await chat.releaseEventAttachment(
			1,
			'message-release-attachment',
			testAttachmentStorageId
		);
		const replay = await chat.releaseEventAttachment(
			1,
			'message-release-attachment',
			testAttachmentStorageId
		);
		assert.equal(aliceRelease.state, 'released');
		assert.equal(replay.releasedAt, aliceRelease.releasedAt);
		assert.equal(rows.attachmentRetentions.length, 1);
		assert.equal(rows.attachments.length, 1);
		assert.equal(rows.contents[0].isDeleted, false);

		const aliceEvents = await chat.getEncryptedEvents(1, 'conversation-1');
		const bobEvents = await chat.getEncryptedEvents(2, 'conversation-1');
		assert.deepEqual(
			aliceEvents.list[0].releasedAttachmentStorageIds,
			[testAttachmentStorageId]
		);
		assert.deepEqual(bobEvents.list[0].releasedAttachmentStorageIds, []);

		await chat.releaseEventAttachment(
			2,
			'message-release-attachment',
			testAttachmentStorageId
		);
		assert.equal(rows.attachmentRetentions.length, 2);
		await assert.rejects(
			() => chat.releaseEventAttachment(
				3,
				'message-release-attachment',
				testAttachmentStorageId
			),
			/event_not_found/
		);
		await assert.rejects(
			() => chat.releaseEventAttachment(
				1,
				'message-release-attachment',
				testUnownedAttachmentStorageId
			),
			/chat_attachment_not_found/
		);
	});

	it('rejects sender-owned ciphertext that exceeds configured chat limits', async () => {
		const {chat, rows} = createChatHarness({
			contents: [{id: 7, userId: 1, storageId: testAttachmentStorageId, size: 33}],
			chatConfig: {
				maxAttachmentBytes: 32,
				maxEventAttachmentBytes: 64
			}
		});
		const alice = await createDevice('owner-alice', 'alice-browser');
		const bob = await createDevice('owner-bob', 'bob-browser');
		await chat.registerDevice(1, alice.publicBundle);
		await chat.registerDevice(2, bob.publicBundle);
		const envelope = await createEnvelope(
			'encrypted attachment descriptor',
			alice,
			bob,
			'message-oversized-attachment',
			{attachmentStorageIds: [testAttachmentStorageId]}
		);

		await assert.rejects(
			() => chat.acceptEncryptedEvent(1, envelope),
			/chat_attachment_too_large/
		);
		assert.equal(rows.events.length, 0);
		assert.equal(rows.attachments.length, 0);
	});

	it('tracks reserved ciphertext from upload through accepted event', async () => {
		const content = {
			id: 7,
			userId: 1,
			storageId: testAttachmentStorageId,
			size: 32
		};
		const {chat, rows} = createChatHarness({
			contents: [content],
			chatConfig: {
				maxPendingAttachmentReservations: 1,
				maxPendingAttachmentBytes: 64
			}
		});
		const reservation = await chat.createAttachmentUploadReservation(1, 32);
		assert.equal(reservation.state, ChatAttachmentUploadState.Reserved);
		await assert.rejects(
			() => chat.createAttachmentUploadReservation(1, 32),
			/chat_attachment_reservation_count_exceeded/
		);

		const uploaded = await chat.afterContentAdding(1, content, {
			chatAttachmentReservationId: reservation.reservationId
		});
		assert.equal(uploaded.state, ChatAttachmentUploadState.Uploaded);

		const alice = await createDevice('owner-alice', 'alice-browser');
		const bob = await createDevice('owner-bob', 'bob-browser');
		await chat.registerDevice(1, alice.publicBundle);
		await chat.registerDevice(2, bob.publicBundle);
		const envelope = await createEnvelope(
			'encrypted attachment descriptor',
			alice,
			bob,
			'message-reserved-attachment',
			{attachmentStorageIds: [testAttachmentStorageId]}
		);
		await chat.acceptEncryptedEvent(1, envelope);

		assert.equal(rows.uploads[0].state, ChatAttachmentUploadState.Attached);
		assert.equal(rows.uploads[0].chatEventId, rows.events[0].id);
		await assert.rejects(
			() => chat.cancelAttachmentUploadReservation(
				1,
				reservation.reservationId
			),
			/chat_attachment_reservation_attached/
		);
	});

	it('rejects cancelled and incorrectly sized attachment uploads', async () => {
		const cancelledContent = {
			id: 8,
			userId: 1,
			storageId: testAttachmentStorageId,
			size: 32
		};
		const wrongSizeContent = {
			id: 9,
			userId: 1,
			storageId: testAttachmentStorageId,
			size: 31
		};
		const {chat, rows} = createChatHarness({
			contents: [cancelledContent, wrongSizeContent]
		});
		const cancelled = await chat.createAttachmentUploadReservation(1, 32);
		await chat.cancelAttachmentUploadReservation(1, cancelled.reservationId);
		await assert.rejects(
			() => chat.afterContentAdding(1, rows.contents[0], {
				chatAttachmentReservationId: cancelled.reservationId
			}),
			/chat_attachment_reservation_not_active/
		);

		const wrongSize = await chat.createAttachmentUploadReservation(1, 32);
		await assert.rejects(
			() => chat.afterContentAdding(1, rows.contents[1], {
				chatAttachmentReservationId: wrongSize.reservationId
			}),
			/chat_attachment_upload_size_mismatch/
		);
	});

	it('cleans expired reservations and cancelled uploaded ciphertext', async () => {
		const content = {
			id: 10,
			userId: 1,
			storageId: testAttachmentStorageId,
			size: 32
		};
		const {chat, rows} = createChatHarness({contents: [content]});
		const expired = await chat.createAttachmentUploadReservation(1, 32);
		const upload = await chat.createAttachmentUploadReservation(1, 32);
		await chat.afterContentAdding(1, rows.contents[0], {
			chatAttachmentReservationId: upload.reservationId
		});
		await chat.cancelAttachmentUploadReservation(1, upload.reservationId);

		const result = await chat.processAttachmentCleanup({
			now: new Date(Date.now() + 2 * 60 * 60 * 1000),
			attachmentCancelledRetentionMs: 0,
			processStorageRemoval: false
		});

		assert.equal(result.cleaned, 2);
		assert.equal(rows.contents[0].isDeleted, true);
		assert.equal(rows.uploads.find(row =>
			row.reservationId === expired.reservationId
		).state, ChatAttachmentUploadState.Cleaned);
		assert.equal(rows.uploads.find(row =>
			row.reservationId === upload.reservationId
		).state, ChatAttachmentUploadState.Cleaned);
		assert.equal(rows.storageRemovalQueue.length, 1);
		assert.equal(rows.storageRemovalQueue[0][2], testAttachmentStorageId);
	});

	it('keeps ciphertext reused by a newer active upload reservation', async () => {
		const content = {
			id: 12,
			userId: 1,
			storageId: testAttachmentStorageId,
			size: 32
		};
		const {chat, rows} = createChatHarness({contents: [content]});
		const cancelled = await chat.createAttachmentUploadReservation(1, 32);
		await chat.afterContentAdding(1, rows.contents[0], {
			chatAttachmentReservationId: cancelled.reservationId
		});
		await chat.cancelAttachmentUploadReservation(
			1,
			cancelled.reservationId
		);
		const replacement = await chat.createAttachmentUploadReservation(1, 32);
		await chat.afterContentAdding(1, rows.contents[0], {
			chatAttachmentReservationId: replacement.reservationId
		});

		const result = await chat.processAttachmentCleanup({
			now: new Date(Date.now() + 2 * 60 * 60 * 1000),
			attachmentCancelledRetentionMs: 0,
			processStorageRemoval: false
		});

		assert.equal(result.cleaned, 1);
		assert.equal(rows.contents[0].isDeleted, false);
		assert.equal(rows.storageRemovalQueue.length, 0);
		assert.equal(rows.uploads.find(row =>
			row.reservationId === replacement.reservationId
		).state, ChatAttachmentUploadState.Uploaded);
	});

	it('rejects event attachment reservations already claimed for cleanup', async () => {
		const content = {
			id: 11,
			userId: 1,
			storageId: testAttachmentStorageId,
			size: 32
		};
		const {chat, rows} = createChatHarness({contents: [content]});
		const reservation = await chat.createAttachmentUploadReservation(1, 32);
		await chat.afterContentAdding(1, rows.contents[0], {
			chatAttachmentReservationId: reservation.reservationId
		});
		await rows.uploads[0].update({
			state: ChatAttachmentUploadState.CleanupPending
		});
		const alice = await createDevice('owner-alice', 'alice-browser');
		const bob = await createDevice('owner-bob', 'bob-browser');
		await chat.registerDevice(1, alice.publicBundle);
		await chat.registerDevice(2, bob.publicBundle);
		const envelope = await createEnvelope(
			'encrypted attachment descriptor',
			alice,
			bob,
			'message-cleanup-claimed-attachment',
			{attachmentStorageIds: [testAttachmentStorageId]}
		);

		await assert.rejects(
			() => chat.acceptEncryptedEvent(1, envelope),
			/chat_attachment_upload_not_attachable/
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

const testAttachmentStorageId = 'QmYwAPJzv5CZsnAzt8auVZRnGi9iS3hBghG9V1sA9j3z2H';
const testUnownedAttachmentStorageId = 'QmPChd2hVbrJ6i4y6XvYxQm8Y8hWgX9kL4nR7tV2cD5fEa';

async function createEnvelope(message, sender, recipient, messageId: string, metadata?) {
	return browserE2eeHelper.encryptEnvelope(
		message,
		[recipient.publicBundle],
		sender,
		{
			messageId,
			conversationId: 'conversation-1',
			createdAt: '2026-07-28T00:01:00.000Z',
			metadata
		}
	);
}

function createChatHarness(options: any = {}) {
	const rows: any = {
		devices: [],
		heads: [],
		events: [],
		attachments: [],
		attachmentRetentions: [],
		uploads: [],
		recipients: [],
		receipts: [],
		contents: [],
		storageRemovalQueue: []
	};
	for (const content of options.contents || []) {
		addRow(rows.contents, {isDeleted: false, ...content});
	}
	const models = createModels(rows);
	const app: any = {
		config: {
			chatConfig: options.chatConfig || {}
		},
		checkUserCan: async () => true,
		ms: {
			database: {
				models: {
					User: {
						findByPk: async userId => ({id: userId})
					},
					Content: {
						findAll: async ({where}) => rows.contents.filter(
							content => matchesWhere(content, where)
						),
						findByPk: async contentId => rows.contents.find(
							content => content.id === contentId
						) || null
					}
				},
				getContentByStorageIdListAndUserId: async (storageIds, userId) => {
					return rows.contents.filter(content =>
						content.userId === userId && storageIds.includes(content.storageId)
					);
				},
				getUser: async userId => ({
					id: userId,
					storageAccountId: userId === 1 ? 'owner-alice' : 'owner-bob'
				}),
				getContentDeleteSafety: async content =>
					options.getContentDeleteSafety?.(content) || {
						safeToDestroyContent: true,
						contentBlockers: []
					},
				getStorageObjectDeleteSafety: async () => ({
					safeToRemovePhysical: true
				}),
				sequelize: {
					escape: value => String(Number(value)),
					transaction: async callback => callback({LOCK: {UPDATE: 'UPDATE'}})
				}
			},
			storageSpace: {
				queueStorageObjectRemoval: async (...args) => {
					rows.storageRemovalQueue.push(args);
				}
			},
			storage: {
				unPin: async () => null,
				remove: async () => null
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
			findOne: async ({where}) => rows.recipients.find(
				row => matchesWhere(row, where)
			) || null,
			destroy: async () => clearRows(rows.recipients)
		},
		ChatEventAttachment: {
			bulkCreate: async records => records.map(record => addRow(rows.attachments, record)),
			findOne: async ({where}) => rows.attachments.find(
				row => matchesWhere(row, where)
			) || null,
			destroy: async () => clearRows(rows.attachments)
		},
		ChatEventAttachmentRetention: {
			findOne: async ({where}) => rows.attachmentRetentions.find(
				row => matchesWhere(row, where)
			) || null,
			findOrCreate: async ({where, defaults}) => {
				let retention = rows.attachmentRetentions.find(
					row => matchesWhere(row, where)
				);
				if (!retention) {
					retention = addRow(rows.attachmentRetentions, defaults);
					return [retention, true];
				}
				return [retention, false];
			},
			findAll: async ({where}) => rows.attachmentRetentions.filter(
				row => matchesWhere(row, where)
			),
			destroy: async () => clearRows(rows.attachmentRetentions)
		},
		ChatAttachmentUpload: {
			create: async data => addRow(rows.uploads, {
				reservationId: `reservation-${rows.uploads.length + 1}`,
				...data
			}),
			count: async ({where}) => rows.uploads.filter(row => matchesWhere(row, where)).length,
			sum: async (field, {where}) => rows.uploads
				.filter(row => matchesWhere(row, where))
				.reduce((sum, row) => sum + Number(row[field]), 0),
			findOne: async ({where}) => rows.uploads.find(row => matchesWhere(row, where)) || null,
			findByPk: async id => rows.uploads.find(row => row.id === id) || null,
			findAll: async ({where, order = [['id', 'ASC']], limit}) => {
				const direction = order[0][1];
				const matching = rows.uploads
					.filter(row => matchesWhere(row, where))
					.sort((left, right) => direction === 'DESC'
						? Number(right.id) - Number(left.id)
						: Number(left.id) - Number(right.id));
				return matching.slice(0, limit);
			},
			update: async (updateData, {where}) => {
				const matching = rows.uploads.filter(row => matchesWhere(row, where));
				for (const row of matching) {
					await row.update(updateData);
				}
				return [matching.length];
			},
			destroy: async () => clearRows(rows.uploads)
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
	row.destroy = async () => {
		const index = rows.indexOf(row);
		if (index >= 0) {
			rows.splice(index, 1);
		}
	};
	rows.push(row);
	return row;
}

function matchesWhere(row, where) {
	const alternatives = where?.[Op.or];
	if (alternatives && !alternatives.some(item => matchesWhere(row, item))) {
		return false;
	}
	return Object.entries(where || {}).every(([field, expected]: [string, any]) => {
		if (expected && typeof expected === 'object') {
			const symbols = Object.getOwnPropertySymbols(expected);
			if (symbols.includes(Op.in)) {
				return expected[Op.in].includes(row[field]);
			}
			if (symbols.includes(Op.gt)) {
				return row[field] > expected[Op.gt];
			}
			if (symbols.includes(Op.lte)) {
				return row[field] <= expected[Op.lte];
			}
			if (symbols.includes(Op.ne)) {
				return row[field] !== expected[Op.ne];
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
