import {createHash, randomUUID} from 'node:crypto';
import {literal, Op} from 'sequelize';
import browserE2eeHelper from 'geesome-libs/src/browserE2eeHelper.js';
import ipfsHelper from 'geesome-libs/src/ipfsHelper.js';
import type {IBackgroundWorker} from '../../backgroundWorker.js';
import type {IGeesomeApp} from '../../interface.js';
import {CorePermissionName} from '../database/interface.js';
import {
	processChatDeliveryQueue,
	serializeChatDelivery
} from './delivery.js';
import {
	assertValidChatSyncPage,
	createChatSyncResponse,
	getChatSyncPageCursor,
	parseSyncPageSize
} from './reconciliation.js';
import {processChatReconciliationQueue} from './reconciliationQueue.js';
import IGeesomeChatModule, {
	ChatDeliveryState,
	ChatEventState,
	ChatReceiptState,
	IChatDeliveryProcessOptions,
	IChatReconcileOptions,
	IChatReconciliationProcessOptions,
	IChatRecipientEndpoint
} from './interface.js';
import {
	chatSyncProtocol,
	IChatSyncRequest,
	requestChatSync,
	signChatSyncRequest,
	verifyChatSyncRequest,
	verifyChatSyncResponse
} from './sync.js';
import {
	assertPublicKeyMatchesOwner,
	chatDeliveryProtocol,
	IChatDeliveryPayload,
	IChatTransportSigner,
	normalizeChatInboxUrl,
	normalizeChatSyncUrl,
	signChatAcknowledgement,
	verifyChatDelivery
} from './transport.js';
import {buildChatPublicNodeInfoResponse} from './publicNodeInfo.js';
import {
	assertOwnedChatAttachmentQuota,
	pinRemoteChatAttachments
} from './attachmentStorage.js';

const maxDeviceBundleBytes = 64 * 1024;
const maxEnvelopeBytes = 1024 * 1024;
const maxEventListLimit = 100;
const maxSyncRequestBytes = 128 * 1024;
const defaultSyncMaximumPages = 5;
const maximumSyncMaximumPages = 20;

export default async function initializeChatModule(app: IGeesomeApp, options: any = {}) {
	app.checkModules(['database', 'api']);
	const models = options.models || await (await import('./models.js')).default(
		app.ms.database.sequelize
	);
	app.ms.database.registerStorageIdReferenceSource?.({
		model: models.ChatEventAttachment,
		columns: ['storageId']
	});
	const module = getModule(app, models, options);
	(await import('./api.js')).default(app, module);
	module.setDeliveryWorker((await import('./cron.js')).default(app, module));
	return module;
}

export function getModule(app: IGeesomeApp, models, options: any = {}): IGeesomeChatModule {
	class ChatModule implements IGeesomeChatModule {
		deliveryWorker: IBackgroundWorker | null = null;
		deliveryProcessPromise: Promise<any> | null = null;

		setDeliveryWorker(worker: IBackgroundWorker | null) {
			this.deliveryWorker = worker;
		}

		async stop() {
			const worker = this.deliveryWorker;
			this.deliveryWorker = null;
			await worker?.stop();
			await this.deliveryProcessPromise;
		}

		async flushDatabase() {
			await models.ChatEventReceipt.destroy({where: {}});
			await models.ChatDelivery.destroy({where: {}});
			await models.ChatSyncJob.destroy({where: {}});
			await models.ChatSyncState.destroy({where: {}});
			await models.ChatEventAttachment.destroy({where: {}});
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

		async getPublicDevices(ownerId: string) {
			const normalizedOwnerId = requireIdentifier(ownerId, 'owner_id_required');
			const devices = await models.ChatDevice.findAll({
				where: {ownerId: normalizedOwnerId, revokedAt: null},
				order: [['createdAt', 'ASC'], ['id', 'ASC']]
			});
			return devices.map(device => JSON.parse(device.bundleJson));
		}

		async getPublicNodeInfo() {
			return buildChatPublicNodeInfoResponse(getChatPublicUrl(app));
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

		async acceptEncryptedEvent(
			userId: number,
			envelope: any,
			eventOptions: {recipientEndpoints?: IChatRecipientEndpoint[]} = {}
		) {
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
			const attachmentStorageIds = getAttachmentStorageIds(envelope);
			const recipientEndpoints = await normalizeRecipientEndpoints(
				envelope,
				eventOptions.recipientEndpoints,
				{allowHttp: options.allowHttp === true}
			);
			const existing = await models.ChatEvent.findOne({where: {messageId: envelope.messageId}});
			if (existing) {
				const result = replayExistingEvent(existing, eventHash);
				await enqueueChatDeliveries(
					models,
					existing,
					recipientEndpoints,
					new Date()
				);
				if (recipientEndpoints.length && shouldAutoProcessChatDeliveries(app)) {
					this.startDeliveryQueueProcessing();
				}
				return result;
			}
			const attachmentContents = await getOwnedAttachmentContents(
				app,
				userId,
				attachmentStorageIds
			);
			assertOwnedChatAttachmentQuota(attachmentContents, getAttachmentLimits(app));

			try {
				const result = await app.ms.database.sequelize.transaction(async transaction => {
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
						senderBundleJson: senderDevice.bundleJson,
						sourceSequence: sequence,
						sourceSyncUrl: getChatSyncUrl(app),
						eventHash,
						envelopeJson,
						state: ChatEventState.AcceptedLocal
					}, {transaction});
					const localUsersByKey = new Map(
						localRecipientDevices.map(device => [device.keyId, device.userId])
					);
					const recipientOwnersByKey = new Map(
						envelope.recipients.map(recipient => [recipient.keyId, recipient.ownerId])
					);
					await models.ChatEventRecipient.bulkCreate(
						envelope.recipientKeyIds.map(keyId => ({
							chatEventId: event.id,
							userId: localUsersByKey.get(keyId) || null,
							ownerId: recipientOwnersByKey.get(keyId),
							keyId
						})),
						{transaction}
					);
					await models.ChatEventAttachment.bulkCreate(
						attachmentContents.map(content => ({
							chatEventId: event.id,
							contentId: content.id,
							storageId: content.storageId
						})),
						{transaction}
					);
					await enqueueChatDeliveries(
						models,
						event,
						recipientEndpoints,
						new Date(),
						transaction
					);
					return {
						event: serializeEvent(event),
						replay: false
					};
				});
				if (recipientEndpoints.length && shouldAutoProcessChatDeliveries(app)) {
					this.startDeliveryQueueProcessing();
				}
				return result;
			} catch (error) {
				if (!isUniqueConstraintError(error)) {
					throw error;
				}
				const racedEvent = await models.ChatEvent.findOne({where: {messageId: envelope.messageId}});
				if (!racedEvent) {
					throw error;
				}
				const result = replayExistingEvent(racedEvent, eventHash);
				await enqueueChatDeliveries(
					models,
					racedEvent,
					recipientEndpoints,
					new Date()
				);
				if (recipientEndpoints.length && shouldAutoProcessChatDeliveries(app)) {
					this.startDeliveryQueueProcessing();
				}
				return result;
			}
		}

		async acceptRemoteDelivery(delivery: IChatDeliveryPayload) {
			assertJsonSize(delivery, maxEnvelopeBytes + maxDeviceBundleBytes, 'chat_delivery_too_large');
			await verifyChatDelivery(delivery);
			const envelope = delivery.envelope;
			assertEncryptedEnvelopeShape(envelope);
			assertPublicDeviceBundleShape(delivery.sender.deviceBundle);
			if (!browserE2eeHelper.isEncryptedEnvelope(envelope)) {
				throw chatError('encrypted_envelope_required');
			}
			if (
				delivery.deliveryId !== getChatDeliveryId(
					envelope.messageId,
					delivery.recipientOwnerId
				) ||
				delivery.sender.ownerId !== envelope.sender.ownerId ||
				delivery.sender.deviceBundle.ownerId !== envelope.sender.ownerId ||
				delivery.sender.deviceBundle.deviceId !== envelope.sender.deviceId ||
				delivery.sender.deviceBundle.keyId !== envelope.sender.keyId
			) {
				throw chatError('chat_delivery_envelope_mismatch', 403);
			}
			if (
				!await browserE2eeHelper.verifyDeviceKeyBundle(delivery.sender.deviceBundle) ||
				!await browserE2eeHelper.verifyEnvelopeSignature(
					envelope,
					delivery.sender.deviceBundle
				)
			) {
				throw chatError('envelope_signature_invalid', 403);
			}
			const recipientKeyIds = envelope.recipients
				.filter(recipient => recipient.ownerId === delivery.recipientOwnerId)
				.map(recipient => recipient.keyId);
			if (!recipientKeyIds.length) {
				throw chatError('chat_delivery_recipient_missing', 403);
			}
			const localRecipientDevices = await models.ChatDevice.findAll({
				where: {
					ownerId: delivery.recipientOwnerId,
					keyId: {[Op.in]: recipientKeyIds},
					revokedAt: null
				}
			});
			if (!localRecipientDevices.length) {
				throw chatError('chat_delivery_recipient_device_not_found', 404);
			}

			const attachmentStorageIds = getAttachmentStorageIds(envelope);
			await pinRemoteChatAttachments(app.ms.storage, attachmentStorageIds, {
				timeoutMs: app.config.chatConfig?.attachmentPinTimeoutMs,
				...getAttachmentLimits(app)
			});
			const eventHash = getEventHash(envelope);
			const existing = await models.ChatEvent.findOne({
				where: {messageId: envelope.messageId}
			});
			const event = existing || await app.ms.database.sequelize.transaction(
				async transaction => createRemoteChatEvent(
					models,
					envelope,
					delivery,
					localRecipientDevices,
					eventHash,
					transaction
				)
			);
			if (existing) {
				replayExistingEvent(existing, eventHash);
			}
			await rememberChatSyncSource(models, delivery);
			const head = await models.ChatConversationHead.findOne({
				where: {conversationId: envelope.conversationId}
			});
			const signer = await getChatTransportSigner(app, delivery.recipientOwnerId);
			const receivedAt = new Date();
			return signChatAcknowledgement({
				version: chatDeliveryProtocol,
				deliveryId: delivery.deliveryId,
				messageId: envelope.messageId,
				eventHash,
				recipientOwnerId: delivery.recipientOwnerId,
				acceptedSequence: String(event.sequence),
				headSequence: String(head?.lastSequence || event.sequence),
				receivedAt: receivedAt.toISOString()
			}, signer);
		}

		async acceptSyncRequest(request: IChatSyncRequest) {
			assertJsonSize(request, maxSyncRequestBytes, 'chat_sync_request_too_large');
			await verifyChatSyncRequest(request);
			requireIdentifier(request.requestId, 'chat_sync_request_id_required');
			requireIdentifier(request.conversationId, 'conversation_id_required');
			requireIdentifier(request.requesterOwnerId, 'chat_sync_requester_required');
			requireIdentifier(request.sourceOwnerId, 'chat_sync_source_required');
			parseSequence(request.afterSourceSequence);
			parseSyncPageSize(request.limit);
			const signer = await getChatTransportSigner(app, request.sourceOwnerId);
			return createChatSyncResponse(
				models,
				request,
				signer,
				getChatSyncUrl(app)
			);
		}

		async reconcileConversation(
			userId: number,
			conversationId: string,
			reconcileOptions: IChatReconcileOptions = {} as IChatReconcileOptions
		) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			const normalizedConversationId = requireIdentifier(
				conversationId,
				'conversation_id_required'
			);
			const recipientOwnerId = await getLocalOwnerId(app, userId);
			const sourceOwnerId = requireIdentifier(
				reconcileOptions?.sourceOwnerId,
				'chat_sync_source_required'
			);
			let state = await models.ChatSyncState.findOne({
				where: {
					conversationId: normalizedConversationId,
					recipientOwnerId,
					sourceOwnerId
				}
			});
			const sourcePublicKey = reconcileOptions?.sourcePublicKey ||
				state?.sourcePublicKey;
			const syncUrl = normalizeChatSyncUrl(
				reconcileOptions?.syncUrl || state?.syncUrl,
				{allowHttp: options.allowHttp === true}
			);
			await assertPublicKeyMatchesOwner(sourcePublicKey, sourceOwnerId);
			if (!state) {
				state = await models.ChatSyncState.create({
					conversationId: normalizedConversationId,
					recipientOwnerId,
					sourceOwnerId,
					sourcePublicKey,
					syncUrl,
					verifiedSourceSequence: '0',
					scanAfterSourceSequence: '0'
				});
			} else if (
				state.sourcePublicKey !== sourcePublicKey ||
				state.syncUrl !== syncUrl
			) {
				await state.update({sourcePublicKey, syncUrl});
			}

			const signer = await getChatTransportSigner(app, recipientOwnerId);
			const sendSyncRequest = reconcileOptions.requestChatSync ||
				options.requestChatSync ||
				((url, request) => requestChatSync(url, request, {
					allowHttp: options.allowHttp === true
				}));
			const maximumPages = parseMaximumSyncPages(reconcileOptions.maxPages);
			const pageSize = parseSyncPageSize(reconcileOptions.limit);
			let scanAfterSourceSequence = String(state.scanAfterSourceSequence || '0');
			let imported = 0;
			let replayed = 0;
			let pages = 0;
			let complete = false;
			let sourceHeadSequence = String(state.lastSourceHeadSequence || '0');
			try {
				while (pages < maximumPages && !complete) {
					const request = await signChatSyncRequest({
						version: chatSyncProtocol,
						requestId: randomUUID(),
						requestedAt: new Date().toISOString(),
						requesterOwnerId: recipientOwnerId,
						requesterPublicKey: signer.publicKey,
						sourceOwnerId,
						conversationId: normalizedConversationId,
						afterSourceSequence: scanAfterSourceSequence,
						limit: pageSize
					}, signer);
					const response = await sendSyncRequest(syncUrl, request);
					await verifyChatSyncResponse(response, {
						requestId: request.requestId,
						requesterOwnerId: recipientOwnerId,
						sourceOwnerId,
						sourcePublicKey,
						conversationId: normalizedConversationId
					});
					assertValidChatSyncPage(
						response,
						scanAfterSourceSequence,
						pageSize
					);
					for (const delivery of response.deliveries) {
						const existingEvent = await models.ChatEvent.findOne({
							where: {messageId: delivery.envelope.messageId}
						});
						await this.acceptRemoteDelivery(delivery);
						if (existingEvent) {
							replayed += 1;
						} else {
							imported += 1;
						}
					}
					pages += 1;
					sourceHeadSequence = response.headSourceSequence;
					scanAfterSourceSequence = getChatSyncPageCursor(
						response,
						scanAfterSourceSequence
					);
					state = await persistChatSyncProgress(app, models, state.id, {
						scanAfterSourceSequence,
						sourceHeadSequence,
						pageComplete: !response.hasMore
					});
					scanAfterSourceSequence = String(state.scanAfterSourceSequence);
					sourceHeadSequence = String(state.lastSourceHeadSequence);
					complete = BigInt(parseSequence(state.verifiedSourceSequence)) >=
						BigInt(parseSequence(state.lastSourceHeadSequence));
				}
			} catch (error) {
				await state.update({lastError: getBoundedErrorMessage(error)});
				throw error;
			}
			return {
				conversationId: normalizedConversationId,
				sourceOwnerId,
				imported,
				replayed,
				pages,
				complete,
				scanAfterSourceSequence,
				verifiedSourceSequence: String(state.verifiedSourceSequence),
				sourceHeadSequence
			};
		}

		async processReconciliationQueue(
			processOptions: IChatReconciliationProcessOptions = {}
		) {
			return processChatReconciliationQueue(models, {
				...processOptions,
				reconcile: (userId, state) => this.reconcileConversation(
					userId,
					state.conversationId,
					{
						sourceOwnerId: state.sourceOwnerId,
						sourcePublicKey: state.sourcePublicKey,
						syncUrl: state.syncUrl,
						limit: processOptions.pageLimit,
						maxPages: processOptions.maxPages,
						requestChatSync: processOptions.requestChatSync
					}
				)
			});
		}

		async processDeliveryQueue(processOptions: IChatDeliveryProcessOptions = {}) {
			return processChatDeliveryQueue(models, {
				...processOptions,
				allowHttp: options.allowHttp === true,
				deliverChatRequest: processOptions.deliverChatRequest ||
					options.deliverChatRequest,
				getSigner: ownerId => getChatTransportSigner(app, ownerId),
				sourceSyncUrl: getChatSyncUrl(app)
			});
		}

		startDeliveryQueueProcessing() {
			if (this.deliveryProcessPromise) {
				return;
			}
			this.deliveryProcessPromise = this.processDeliveryQueue()
				.catch(error => console.error('processChatDeliveryQueue error', error))
				.finally(() => {
					this.deliveryProcessPromise = null;
				});
		}

		async getEventDeliveries(userId: number, messageId: string) {
			await app.checkUserCan(userId, CorePermissionName.UserSaveData);
			const event = await models.ChatEvent.findOne({
				where: {
					messageId: requireIdentifier(messageId, 'message_id_required'),
					senderUserId: userId
				}
			});
			if (!event) {
				throw chatError('event_not_found', 404);
			}
			const deliveries = await models.ChatDelivery.findAll({
				where: {chatEventId: event.id},
				order: [['id', 'ASC']]
			});
			return deliveries.map(serializeChatDelivery);
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

async function createRemoteChatEvent(
	models,
	envelope,
	delivery: IChatDeliveryPayload,
	localRecipientDevices,
	eventHash: string,
	transaction
) {
	const sequence = await allocateConversationSequence(
		models,
		envelope.conversationId,
		transaction
	);
	const event = await models.ChatEvent.create({
		messageId: envelope.messageId,
		conversationId: envelope.conversationId,
		sequence,
		senderUserId: null,
		senderOwnerId: envelope.sender.ownerId,
		senderDeviceId: envelope.sender.deviceId,
		senderKeyId: envelope.sender.keyId,
		senderBundleJson: JSON.stringify(delivery.sender.deviceBundle),
		sourceSequence: parseSequence(delivery.sourceSequence),
		sourceSyncUrl: delivery.sender.syncUrl,
		eventHash,
		envelopeJson: JSON.stringify(envelope),
		state: ChatEventState.ReceivedRemote
	}, {transaction});
	const localUsersByKey = new Map(
		localRecipientDevices.map(device => [device.keyId, device.userId])
	);
	await models.ChatEventRecipient.bulkCreate(
		envelope.recipients.map(recipient => ({
			chatEventId: event.id,
			userId: localUsersByKey.get(recipient.keyId) || null,
			ownerId: recipient.ownerId,
			keyId: recipient.keyId
		})),
		{transaction}
	);
	await models.ChatEventAttachment.bulkCreate(
		getAttachmentStorageIds(envelope).map(storageId => ({
			chatEventId: event.id,
			contentId: null,
			storageId
		})),
		{transaction}
	);
	return event;
}

async function rememberChatSyncSource(models, delivery: IChatDeliveryPayload) {
	if (!delivery.sender.syncUrl) {
		return;
	}
	const now = new Date();
	const where = {
		conversationId: delivery.envelope.conversationId,
		recipientOwnerId: delivery.recipientOwnerId,
		sourceOwnerId: delivery.sender.ownerId
	};
	const [state, created] = await models.ChatSyncState.findOrCreate({
		where,
		defaults: {
			...where,
			sourcePublicKey: delivery.sender.publicKey,
			syncUrl: delivery.sender.syncUrl,
			verifiedSourceSequence: '0',
			scanAfterSourceSequence: '0',
			lastSourceHeadSequence: delivery.sourceSequence
		}
	});
	const observedSourceHeadSequence = maximumSequence(
		state.lastSourceHeadSequence || '0',
		delivery.sourceSequence
	);
	const hasNewSourceHead = observedSourceHeadSequence !==
		String(state.lastSourceHeadSequence || '0');
	if (
		state.sourcePublicKey !== delivery.sender.publicKey ||
		state.syncUrl !== delivery.sender.syncUrl ||
		hasNewSourceHead
	) {
		await state.update({
			sourcePublicKey: delivery.sender.publicKey,
			syncUrl: delivery.sender.syncUrl,
			lastSourceHeadSequence: observedSourceHeadSequence
		});
	}
	await scheduleChatSyncJob(models, state, now, created || hasNewSourceHead);
}

async function scheduleChatSyncJob(
	models,
	state,
	now: Date,
	expedite: boolean
) {
	const [job, created] = await models.ChatSyncJob.findOrCreate({
		where: {chatSyncStateId: state.id},
		defaults: {
			chatSyncStateId: state.id,
			recipientOwnerId: state.recipientOwnerId,
			nextAttemptAt: now
		}
	});
	if (!created && expedite && job.nextAttemptAt > now) {
		await job.update({nextAttemptAt: now});
	}
}

async function persistChatSyncProgress(
	app: IGeesomeApp,
	models,
	stateId: number,
	progress: {
		scanAfterSourceSequence: string;
		sourceHeadSequence: string;
		pageComplete: boolean;
	}
) {
	return app.ms.database.sequelize.transaction(async transaction => {
		const state = await models.ChatSyncState.findByPk(stateId, {
			transaction,
			lock: transaction.LOCK.UPDATE
		});
		if (!state) {
			throw chatError('chat_sync_state_not_found', 404);
		}
		const scanAfterSourceSequence = maximumSequence(
			state.scanAfterSourceSequence,
			progress.scanAfterSourceSequence
		);
		const lastSourceHeadSequence = maximumSequence(
			state.lastSourceHeadSequence || '0',
			progress.sourceHeadSequence
		);
		const verifiedSourceSequence = progress.pageComplete
			? maximumSequence(
				state.verifiedSourceSequence,
				progress.sourceHeadSequence
			)
			: String(state.verifiedSourceSequence);
		await state.update({
			scanAfterSourceSequence,
			lastSourceHeadSequence,
			verifiedSourceSequence,
			lastSyncedAt: new Date(),
			lastError: null
		}, {transaction});
		return state;
	});
}

async function enqueueChatDeliveries(
	models,
	event,
	endpoints: IChatRecipientEndpoint[],
	now: Date,
	transaction = undefined
): Promise<void> {
	for (const endpoint of endpoints) {
		await models.ChatDelivery.findOrCreate({
			where: {
				chatEventId: event.id,
				recipientOwnerId: endpoint.ownerId
			},
			defaults: {
				chatEventId: event.id,
				recipientOwnerId: endpoint.ownerId,
				recipientPublicKey: endpoint.publicKey,
				inboxUrl: endpoint.inboxUrl,
				state: ChatDeliveryState.Pending,
				attempts: 0,
				nextAttemptAt: now
			},
			transaction
		});
	}
}

async function normalizeRecipientEndpoints(
	envelope,
	endpoints: IChatRecipientEndpoint[] | undefined,
	options: {allowHttp?: boolean}
): Promise<IChatRecipientEndpoint[]> {
	if (endpoints === undefined) {
		return [];
	}
	if (!Array.isArray(endpoints) || endpoints.length > 20) {
		throw chatError('chat_recipient_endpoints_invalid');
	}
	const recipientOwnerIds = new Set(
		envelope.recipients.map(recipient => recipient.ownerId)
	);
	const normalizedEndpoints: IChatRecipientEndpoint[] = [];
	const seenOwnerIds = new Set<string>();
	for (const endpoint of endpoints) {
		if (!hasExactKeys(endpoint, ['inboxUrl', 'ownerId', 'publicKey'])) {
			throw chatError('chat_recipient_endpoint_fields_invalid');
		}
		const ownerId = requireIdentifier(endpoint.ownerId, 'chat_recipient_owner_id_required');
		if (!recipientOwnerIds.has(ownerId)) {
			throw chatError('chat_recipient_endpoint_not_in_envelope');
		}
		if (seenOwnerIds.has(ownerId)) {
			throw chatError('chat_recipient_endpoint_duplicate');
		}
		await assertPublicKeyMatchesOwner(endpoint.publicKey, ownerId);
		seenOwnerIds.add(ownerId);
		normalizedEndpoints.push({
			ownerId,
			publicKey: endpoint.publicKey,
			inboxUrl: normalizeChatInboxUrl(endpoint.inboxUrl, options)
		});
	}
	return normalizedEndpoints;
}

async function getChatTransportSigner(
	app: IGeesomeApp,
	ownerId: string
): Promise<IChatTransportSigner> {
	const peerId = await app.ms.accountStorage.getAccountPeerId(ownerId);
	const publicKey = await app.ms.accountStorage.getStaticIdPublicKeyByOr(ownerId);
	if (!peerId?.privKey || !publicKey) {
		throw chatError('chat_transport_signing_identity_missing', 500);
	}
	await assertPublicKeyMatchesOwner(publicKey, ownerId);
	return {
		ownerId,
		publicKey,
		sign: data => peerId.privKey.sign(data).then(signature => Buffer.from(signature))
	};
}

async function getLocalOwnerId(app: IGeesomeApp, userId: number): Promise<string> {
	const user = await app.ms.database.getUser(userId);
	const ownerId = user?.storageAccountId || user?.manifestStaticStorageId;
	return requireIdentifier(ownerId, 'chat_owner_identity_missing');
}

function getChatPublicUrl(app: IGeesomeApp): string | null {
	const rawUrl = String(app.config?.chatConfig?.publicUrl || '').trim();
	if (!rawUrl) {
		return null;
	}
	try {
		const url = new URL(rawUrl);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return null;
		}
		return `${url.protocol}//${url.host}`;
	} catch (error) {
		return null;
	}
}

function getChatSyncUrl(app: IGeesomeApp): string | null {
	const publicUrl = getChatPublicUrl(app);
	return publicUrl ? `${publicUrl}/v1/chat/sync` : null;
}

function shouldAutoProcessChatDeliveries(app: IGeesomeApp): boolean {
	return app.config.chatConfig?.autoProcessDeliveries !== false;
}

function getChatDeliveryId(messageId: string, recipientOwnerId: string): string {
	return `${messageId}:${recipientOwnerId}`;
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
		sourceSequence: String(event.sourceSequence || event.sequence),
		senderOwnerId: event.senderOwnerId,
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
		if (
			new Set(metadata.attachmentStorageIds).size !==
			metadata.attachmentStorageIds.length
		) {
			return false;
		}
	}
	return true;
}

function getAttachmentStorageIds(envelope): string[] {
	return envelope.metadata?.attachmentStorageIds || [];
}

function getAttachmentLimits(app: IGeesomeApp) {
	return {
		maxAttachmentBytes: app.config?.chatConfig?.maxAttachmentBytes,
		maxEventAttachmentBytes: app.config?.chatConfig?.maxEventAttachmentBytes
	};
}

async function getOwnedAttachmentContents(
	app: IGeesomeApp,
	userId: number,
	storageIds: string[]
) {
	if (!storageIds.length) {
		return [];
	}
	const contents = await app.ms.database.getContentByStorageIdListAndUserId(
		storageIds,
		userId
	);
	const contentsByStorageId = new Map(
		contents.map(content => [content.storageId, content])
	);
	if (storageIds.some(storageId => !contentsByStorageId.has(storageId))) {
		throw chatError('chat_attachment_not_owned', 403);
	}
	return storageIds.map(storageId => contentsByStorageId.get(storageId));
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

function parseMaximumSyncPages(value): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return defaultSyncMaximumPages;
	}
	return Math.min(parsed, maximumSyncMaximumPages);
}

function parseSequence(value): string {
	try {
		const sequence = BigInt(value);
		if (sequence < 0n || sequence > 9223372036854775807n) {
			throw new Error();
		}
		return sequence.toString();
	} catch {
		throw chatError('after_sequence_invalid');
	}
}

function maximumSequence(left, right): string {
	const leftSequence = BigInt(parseSequence(left));
	const rightSequence = BigInt(parseSequence(right));
	return (leftSequence >= rightSequence ? leftSequence : rightSequence).toString();
}

function getBoundedErrorMessage(error): string {
	return String(error?.message || error || 'chat_sync_failed').slice(0, 2000);
}

function isUniqueConstraintError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function chatError(message: string, code = 400) {
	const error: any = new Error(message);
	error.code = code;
	return error;
}
