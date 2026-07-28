import {createHash} from 'node:crypto';
import {literal, Op} from 'sequelize';
import browserE2eeHelper from 'geesome-libs/src/browserE2eeHelper.js';
import ipfsHelper from 'geesome-libs/src/ipfsHelper.js';
import type {IGeesomeApp} from '../../interface.js';
import {CorePermissionName} from '../database/interface.js';
import IGeesomeChatModule, {ChatEventState, ChatReceiptState} from './interface.js';

const maxDeviceBundleBytes = 64 * 1024;
const maxEnvelopeBytes = 1024 * 1024;
const maxEventListLimit = 100;

export default async function initializeChatModule(app: IGeesomeApp) {
	app.checkModules(['database', 'api']);
	const models = await (await import('./models.js')).default(app.ms.database.sequelize);
	const module = getModule(app, models);
	(await import('./api.js')).default(app, module);
	return module;
}

export function getModule(app: IGeesomeApp, models): IGeesomeChatModule {
	class ChatModule implements IGeesomeChatModule {
		async flushDatabase() {
			await models.ChatEventReceipt.destroy({where: {}});
			await models.ChatEventRecipient.destroy({where: {}});
			await models.ChatEvent.destroy({where: {}});
			await models.ChatConversationHead.destroy({where: {}});
			await models.ChatDevice.destroy({where: {}});
		}

		async registerDevice(userId: number, publicBundle: any) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			assertJsonSize(publicBundle, maxDeviceBundleBytes, 'device_bundle_too_large');
			assertPublicDeviceBundleShape(publicBundle);
			if (!await browserE2eeHelper.verifyDeviceKeyBundle(publicBundle)) {
				throw chatError('device_bundle_invalid');
			}

			const ownerId = await getLocalOwnerId(app, userId);
			if (publicBundle.ownerId !== ownerId) {
				throw chatError('device_owner_mismatch', 403);
			}

			const existingKey = await models.ChatDevice.findOne({where: {keyId: publicBundle.keyId}});
			if (existingKey) {
				assertSameDevice(existingKey, userId, publicBundle);
				await existingKey.update({lastSeenAt: new Date()});
				return serializeDevice(existingKey);
			}

			const existingDevice = await models.ChatDevice.findOne({
				where: {userId, deviceId: publicBundle.deviceId}
			});
			if (existingDevice) {
				throw chatError('device_id_already_registered', 409);
			}

			const device = await models.ChatDevice.create({
				userId,
				ownerId,
				deviceId: publicBundle.deviceId,
				keyId: publicBundle.keyId,
				bundleJson: JSON.stringify(publicBundle),
				lastSeenAt: new Date()
			});
			return serializeDevice(device);
		}

		async getOwnDevices(userId: number, options: {includeRevoked?: boolean} = {}) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			const where: any = {userId};
			if (!options.includeRevoked) {
				where.revokedAt = null;
			}
			const devices = await models.ChatDevice.findAll({
				where,
				order: [['createdAt', 'ASC'], ['id', 'ASC']]
			});
			return devices.map(serializeDevice);
		}

		async getPublicDevices(userId: number, ownerId: string) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			const normalizedOwnerId = requireIdentifier(ownerId, 'owner_id_required');
			const devices = await models.ChatDevice.findAll({
				where: {ownerId: normalizedOwnerId, revokedAt: null},
				order: [['createdAt', 'ASC'], ['id', 'ASC']]
			});
			return devices.map(device => JSON.parse(device.bundleJson));
		}

		async revokeDevice(userId: number, deviceId: string) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			const device = await models.ChatDevice.findOne({
				where: {userId, deviceId: requireIdentifier(deviceId, 'device_id_required')}
			});
			if (!device) {
				throw chatError('device_not_found', 404);
			}
			if (!device.revokedAt) {
				await device.update({revokedAt: new Date()});
			}
			return serializeDevice(device);
		}

		async acceptEncryptedEvent(userId: number, envelope: any) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			assertJsonSize(envelope, maxEnvelopeBytes, 'encrypted_event_too_large');
			assertEncryptedEnvelopeShape(envelope);
			if (!browserE2eeHelper.isEncryptedEnvelope(envelope)) {
				throw chatError('encrypted_envelope_required');
			}

			const senderDevice = await models.ChatDevice.findOne({
				where: {
					userId,
					ownerId: envelope.sender.ownerId,
					deviceId: envelope.sender.deviceId,
					keyId: envelope.sender.keyId,
					revokedAt: null
				}
			});
			if (!senderDevice) {
				throw chatError('active_sender_device_not_found', 403);
			}

			const senderBundle = JSON.parse(senderDevice.bundleJson);
			if (!await browserE2eeHelper.verifyEnvelopeSignature(envelope, senderBundle)) {
				throw chatError('envelope_signature_invalid', 403);
			}

			const localRecipientDevices = await models.ChatDevice.findAll({
				where: {keyId: {[Op.in]: envelope.recipientKeyIds}}
			});
			if (localRecipientDevices.some(device => !!device.revokedAt)) {
				throw chatError('recipient_device_revoked', 409);
			}

			const envelopeJson = JSON.stringify(envelope);
			const eventHash = getEventHash(envelope);
			const existing = await models.ChatEvent.findOne({where: {messageId: envelope.messageId}});
			if (existing) {
				return replayExistingEvent(existing, eventHash);
			}

			try {
				return await app.ms.database.sequelize.transaction(async transaction => {
					const sequence = await allocateConversationSequence(
						models,
						envelope.conversationId,
						transaction
					);
					const event = await models.ChatEvent.create({
						messageId: envelope.messageId,
						conversationId: envelope.conversationId,
						sequence,
						senderUserId: userId,
						senderOwnerId: envelope.sender.ownerId,
						senderDeviceId: envelope.sender.deviceId,
						senderKeyId: envelope.sender.keyId,
						eventHash,
						envelopeJson,
						state: ChatEventState.AcceptedLocal
					}, {transaction});
					const localUsersByKey = new Map(
						localRecipientDevices.map(device => [device.keyId, device.userId])
					);
					await models.ChatEventRecipient.bulkCreate(
						envelope.recipientKeyIds.map(keyId => ({
							chatEventId: event.id,
							userId: localUsersByKey.get(keyId) || null,
							keyId
						})),
						{transaction}
					);
					return {
						event: serializeEvent(event),
						replay: false
					};
				});
			} catch (error) {
				if (!isUniqueConstraintError(error)) {
					throw error;
				}
				const racedEvent = await models.ChatEvent.findOne({where: {messageId: envelope.messageId}});
				if (!racedEvent) {
					throw error;
				}
				return replayExistingEvent(racedEvent, eventHash);
			}
		}

		async getEncryptedEvents(userId: number, conversationId: string, options: any = {}) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			const normalizedConversationId = requireIdentifier(conversationId, 'conversation_id_required');
			const limit = parseListLimit(options.limit);
			const where: any = {
				conversationId: normalizedConversationId,
				[Op.or]: [
					{senderUserId: userId},
					getRecipientAccessPredicate(app, userId)
				]
			};
			if (options.afterSequence !== undefined) {
				where.sequence = {[Op.gt]: parseSequence(options.afterSequence)};
			}

			const result = await models.ChatEvent.findAndCountAll({
				where,
				order: [['sequence', 'ASC'], ['id', 'ASC']],
				limit
			});
			return {
				list: result.rows.map(serializeEvent),
				total: Number(result.count)
			};
		}

		async getConversationHead(userId: number, conversationId: string) {
			const events = await this.getEncryptedEvents(userId, conversationId, {limit: 1});
			if (!events.total) {
				throw chatError('conversation_not_found', 404);
			}
			const head = await models.ChatConversationHead.findOne({
				where: {conversationId}
			});
			return {
				conversationId,
				lastSequence: String(head?.lastSequence || '0')
			};
		}

		async setEventReceipt(userId: number, messageId: string, state: ChatReceiptState) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			if (state !== ChatReceiptState.Received && state !== ChatReceiptState.Read) {
				throw chatError('receipt_state_invalid');
			}
			const event = await models.ChatEvent.findOne({
				where: {messageId: requireIdentifier(messageId, 'message_id_required')},
				include: [{
					association: 'recipients',
					required: true,
					where: {userId}
				}]
			});
			if (!event) {
				throw chatError('event_not_found', 404);
			}

			const now = new Date();
			const [receipt] = await models.ChatEventReceipt.findOrCreate({
				where: {chatEventId: event.id, userId},
				defaults: {
					chatEventId: event.id,
					userId,
					state,
					receivedAt: now,
					readAt: state === ChatReceiptState.Read ? now : null
				}
			});
			const updateData: any = {receivedAt: receipt.receivedAt || now};
			if (state === ChatReceiptState.Read) {
				updateData.state = ChatReceiptState.Read;
				updateData.readAt = receipt.readAt || now;
			}
			await receipt.update(updateData);
			return serializeReceipt(receipt, event.messageId);
		}
	}

	return new ChatModule();
}

async function getLocalOwnerId(app: IGeesomeApp, userId: number): Promise<string> {
	const user = await app.ms.database.getUser(userId);
	const ownerId = user?.storageAccountId || user?.manifestStaticStorageId;
	return requireIdentifier(ownerId, 'chat_owner_identity_missing');
}

async function allocateConversationSequence(models, conversationId: string, transaction): Promise<string> {
	await models.ChatConversationHead.findOrCreate({
		where: {conversationId},
		defaults: {conversationId, lastSequence: '0'},
		transaction
	});
	const head = await models.ChatConversationHead.findOne({
		where: {conversationId},
		transaction,
		lock: transaction.LOCK.UPDATE
	});
	if (!head) {
		throw chatError('conversation_head_not_found', 500);
	}
	const nextSequence = (BigInt(head.lastSequence || 0) + 1n).toString();
	await head.update({lastSequence: nextSequence}, {transaction});
	return nextSequence;
}

function replayExistingEvent(event, eventHash: string) {
	if (event.eventHash !== eventHash) {
		throw chatError('message_id_conflict', 409);
	}
	return {
		event: serializeEvent(event),
		replay: true
	};
}

function serializeDevice(device) {
	return {
		ownerId: device.ownerId,
		deviceId: device.deviceId,
		keyId: device.keyId,
		publicBundle: JSON.parse(device.bundleJson),
		revokedAt: device.revokedAt || null,
		lastSeenAt: device.lastSeenAt || null,
		createdAt: device.createdAt,
		updatedAt: device.updatedAt
	};
}

function serializeEvent(event) {
	return {
		messageId: event.messageId,
		conversationId: event.conversationId,
		sequence: String(event.sequence),
		state: event.state,
		envelope: JSON.parse(event.envelopeJson),
		acceptedAt: event.createdAt
	};
}

function serializeReceipt(receipt, messageId: string) {
	return {
		messageId,
		state: receipt.state,
		receivedAt: receipt.receivedAt,
		readAt: receipt.readAt || null
	};
}

function assertSameDevice(existingDevice, userId: number, publicBundle) {
	if (
		Number(existingDevice.userId) !== Number(userId) ||
		existingDevice.ownerId !== publicBundle.ownerId ||
		existingDevice.deviceId !== publicBundle.deviceId ||
		existingDevice.bundleJson !== JSON.stringify(publicBundle)
	) {
		throw chatError('device_key_conflict', 409);
	}
	if (existingDevice.revokedAt) {
		throw chatError('device_revoked', 409);
	}
}

function assertJsonSize(value, maximumBytes: number, errorCode: string) {
	const json = JSON.stringify(value);
	if (typeof json !== 'string') {
		throw chatError('json_value_required');
	}
	const size = Buffer.byteLength(json, 'utf8');
	if (size > maximumBytes) {
		throw chatError(errorCode, 413);
	}
}

function assertPublicDeviceBundleShape(bundle) {
	if (
		!hasExactKeys(bundle, [
			'createdAt',
			'deviceId',
			'encryption',
			'keyId',
			'ownerId',
			'proof',
			'signing',
			'version'
		]) ||
		!hasExactKeys(bundle.encryption, ['algorithm', 'publicKey']) ||
		!hasExactKeys(bundle.signing, ['algorithm', 'publicKey']) ||
		!hasExactKeys(bundle.proof, ['algorithm', 'signature'])
	) {
		throw chatError('device_bundle_fields_invalid');
	}
}

function assertEncryptedEnvelopeShape(envelope) {
	if (
		!hasExactKeys(envelope, [
			'content',
			'conversationId',
			'createdAt',
			'encoding',
			'messageId',
			'metadata',
			'recipientKeyIds',
			'recipients',
			'sender',
			'signature',
			'type',
			'version'
		]) ||
		!hasExactKeys(envelope.sender, ['deviceId', 'keyId', 'ownerId']) ||
		!hasExactKeys(envelope.content, ['algorithm', 'ciphertext', 'iv']) ||
		!hasExactKeys(envelope.signature, ['algorithm', 'keyId', 'signature']) ||
		!Array.isArray(envelope.recipients) ||
		!envelope.recipients.every(recipient => hasExactKeys(recipient, [
			'algorithm',
			'deviceId',
			'encapsulatedKey',
			'encryptedKey',
			'keyId',
			'ownerId'
		])) ||
		!isSafeEnvelopeMetadata(envelope.metadata)
	) {
		throw chatError('encrypted_envelope_fields_invalid');
	}
}

function isSafeEnvelopeMetadata(metadata): boolean {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return false;
	}
	const allowedKeys = ['attachmentStorageIds', 'keyEpoch', 'kind'];
	if (!Object.keys(metadata).every(key => allowedKeys.includes(key))) {
		return false;
	}
	if (
		metadata.kind !== undefined &&
		!['binary', 'json', 'text'].includes(metadata.kind)
	) {
		return false;
	}
	if (
		metadata.keyEpoch !== undefined &&
		(!Number.isSafeInteger(metadata.keyEpoch) || metadata.keyEpoch < 0)
	) {
		return false;
	}
	if (metadata.attachmentStorageIds !== undefined) {
		if (
			!Array.isArray(metadata.attachmentStorageIds) ||
			metadata.attachmentStorageIds.length > 20 ||
			!metadata.attachmentStorageIds.every(storageId => ipfsHelper.isIpfsHash(storageId))
		) {
			return false;
		}
	}
	return true;
}

function hasExactKeys(value, expectedKeys: string[]): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const keys = Object.keys(value).sort();
	const expected = [...expectedKeys].sort();
	return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function getEventHash(envelope): string {
	return createHash('sha256').update([
		envelope.version,
		envelope.messageId,
		envelope.conversationId,
		envelope.sender.keyId,
		envelope.content.ciphertext,
		envelope.signature.signature
	].join('\n')).digest('hex');
}

function getRecipientAccessPredicate(app: IGeesomeApp, userId: number) {
	const escapedUserId = app.ms.database.sequelize.escape(Number(userId));
	return literal(
		'EXISTS (' +
		'SELECT 1 FROM "chatEventRecipients" AS "chatRecipientAccess" ' +
		'WHERE "chatRecipientAccess"."chatEventId" = "chatEvent"."id" ' +
		`AND "chatRecipientAccess"."userId" = ${escapedUserId}` +
		')'
	);
}

function requireIdentifier(value, errorCode: string): string {
	if (typeof value !== 'string' || !value.trim() || value.length > 500) {
		throw chatError(errorCode);
	}
	return value.trim();
}

function parseListLimit(value): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return 50;
	}
	return Math.min(parsed, maxEventListLimit);
}

function parseSequence(value): string {
	try {
		const sequence = BigInt(value);
		if (sequence < 0n) {
			throw new Error();
		}
		return sequence.toString();
	} catch {
		throw chatError('after_sequence_invalid');
	}
}

function isUniqueConstraintError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function chatError(message: string, code = 400) {
	const error: any = new Error(message);
	error.code = code;
	return error;
}
