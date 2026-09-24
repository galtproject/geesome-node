import type {IGeesomeApp} from '../../interface.js';
import {CorePermissionName} from '../database/interface.js';
import type IGeesomeChatModule from './interface.js';

export default function registerChatApi(app: IGeesomeApp, chat: IGeesomeChatModule) {
	/**
	 * @api {get} /v1/chat/public/node Discover chat transport
	 * @apiName DiscoverChatTransport
	 * @apiGroup Chat
	 * @apiDescription Returns the node's browser-E2EE delivery protocol and public device/inbox endpoints. No private key or user data is returned.
	 * @apiSuccess {String} protocol Transport protocol version.
	 * @apiSuccess {String} [publicUrl] Public GeeSome node URL.
	 * @apiSuccess {String} [inboxUrl] Signed encrypted-event inbox URL.
	 * @apiSuccess {String} [deviceDiscoveryTemplate] Public device lookup template.
	 */
	app.ms.api.onGet('chat/public/node', async (_req, res) => {
		return res.send(await chat.getPublicNodeInfo());
	});

	/**
	 * @api {get} /v1/chat/public/users/:ownerId/devices Resolve recipient devices
	 * @apiName ResolvePublicChatDevices
	 * @apiGroup Chat
	 * @apiDescription Returns active self-signed browser public-key bundles for a known stable owner identity. The endpoint never returns private keys.
	 * @apiParam {String} ownerId Stable GeeSome account identity.
	 * @apiSuccess {Object[]} list Active signed public device bundles.
	 */
	app.ms.api.onGet('chat/public/users/:ownerId/devices', async (req, res) => {
		return res.send({list: await chat.getPublicDevices(req.params.ownerId)});
	});

	/**
	 * @api {post} /v1/chat/inbox Receive encrypted inter-node event
	 * @apiName ReceiveEncryptedChatDelivery
	 * @apiGroup Chat
	 * @apiDescription Verifies the sender static-identity signature, browser device signature, encrypted envelope, destination owner, and active local recipient key. Referenced encrypted attachment objects are recursively fetched and pinned before the event is idempotently stored and a recipient-identity-signed acknowledgement is returned.
	 * @apiBody {Object} delivery Signed `geesome-chat-delivery-v1` payload.
	 * @apiSuccess {String} deliveryId Stable delivery identifier.
	 * @apiSuccess {String} acceptedSequence Recipient node sequence.
	 * @apiSuccess {Object} signature Recipient static-identity signature.
	 * @apiError (503) AttachmentUnavailable Referenced attachment ciphertext could not be fetched and pinned; the sender may retry delivery.
	 */
	app.ms.api.onPost('chat/inbox', async (req, res) => {
		return res.send(await chat.acceptRemoteDelivery(req.body.delivery));
	});

	/**
	 * @api {post} /v1/chat/sync Fetch signed encrypted-event backfill
	 * @apiName SyncEncryptedChatEvents
	 * @apiGroup Chat
	 * @apiDescription Verifies a recipient static-identity signature and returns a source-identity-signed bounded page containing only encrypted events addressed to that recipient. Every returned event also carries the normal delivery signature and is reverified by the receiving node.
	 * @apiBody {Object} request Signed `geesome-chat-sync-v1` request.
	 * @apiSuccess {String} headSourceSequence Highest source sequence addressed to the requester.
	 * @apiSuccess {Boolean} hasMore Whether another bounded page remains.
	 * @apiSuccess {Object[]} deliveries Signed encrypted event deliveries.
	 * @apiSuccess {Object} signature Source static-identity signature.
	 */
	app.ms.api.onPost('chat/sync', async (req, res) => {
		return res.send(await chat.acceptSyncRequest(req.body.request));
	});

	/**
	 * @api {post} /v1/chat/devices Register browser chat device
	 * @apiName RegisterChatDevice
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiDescription Registers a browser-generated public device bundle. Private keys must remain in browser storage and are never accepted by this endpoint.
	 * @apiBody {Object} publicBundle Signed `geesome-device-keys-v1` public bundle.
	 * @apiSuccess {Object} result Registered public device metadata.
	 */
	app.ms.api.onAuthorizedPost('chat/devices', async (req, res) => {
		return res.send(await chat.registerDevice(req.user.id, req.body.publicBundle));
	});

	/**
	 * @api {get} /v1/chat/devices List own browser chat devices
	 * @apiName ListOwnChatDevices
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiQuery {Boolean} [includeRevoked=false] Include revoked devices.
	 * @apiSuccess {Object[]} list Public device metadata.
	 */
	app.ms.api.onAuthorizedGet('chat/devices', async (req, res) => {
		const includeRevoked = req.query.includeRevoked === 'true';
		return res.send({list: await chat.getOwnDevices(req.user.id, {includeRevoked})});
	});

	/**
	 * @api {get} /v1/chat/users/:ownerId/devices Resolve active recipient devices
	 * @apiName ListPublicChatDevices
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiParam {String} ownerId Stable GeeSome account identity.
	 * @apiSuccess {Object[]} list Active signed public device bundles.
	 */
	app.ms.api.onAuthorizedGet('chat/users/:ownerId/devices', async (req, res) => {
		return res.send({list: await chat.getPublicDevices(req.params.ownerId)});
	});

	/**
	 * @api {post} /v1/chat/devices/:deviceId/revoke Revoke browser chat device
	 * @apiName RevokeChatDevice
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiParam {String} deviceId Device identifier owned by the authenticated user.
	 * @apiSuccess {Object} result Revoked public device metadata.
	 */
	app.ms.api.onAuthorizedPost('chat/devices/:deviceId/revoke', async (req, res) => {
		return res.send(await chat.revokeDevice(req.user.id, req.params.deviceId));
	});

	/**
	 * @api {post} /v1/chat/attachments/reservations Reserve encrypted attachment upload
	 * @apiName ReserveEncryptedChatAttachment
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiDescription Creates a bounded, expiring lifecycle identity before ciphertext upload. The reservation contains only expected ciphertext bytes and never receives plaintext metadata or keys.
	 * @apiBody {Number} expectedBytes Exact ciphertext byte length that will be uploaded.
	 * @apiSuccess {String} reservationId Opaque upload reservation identifier.
	 * @apiSuccess {Number} expectedBytes Reserved ciphertext bytes.
	 * @apiSuccess {String} state Reservation lifecycle state.
	 * @apiSuccess {Date} expiresAt Upload binding deadline.
	 */
	app.ms.api.onAuthorizedPost('chat/attachments/reservations', async (req, res) => {
		return res.send(await chat.createAttachmentUploadReservation(
			req.user.id,
			req.body.expectedBytes
		));
	});

	/**
	 * @api {post} /v1/chat/attachments/reservations/:reservationId/cancel Cancel encrypted attachment upload
	 * @apiName CancelEncryptedChatAttachment
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiParam {String} reservationId Opaque reservation owned by the authenticated user.
	 * @apiSuccess {String} reservationId Cancelled reservation identifier.
	 * @apiSuccess {String} state Cancelled lifecycle state.
	 * @apiError (409) AttachmentAlreadyAttached Attached uploads cannot be cancelled through the upload lifecycle.
	 */
	app.ms.api.onAuthorizedPost(
		'chat/attachments/reservations/:reservationId/cancel',
		async (req, res) => {
			return res.send(await chat.cancelAttachmentUploadReservation(
				req.user.id,
				req.params.reservationId
			));
		}
	);

	/**
	 * @api {post} /v1/chat/events/:messageId/attachments/release Release an encrypted event attachment
	 * @apiName ReleaseEncryptedChatEventAttachment
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiParam {String} messageId Encrypted event identifier visible to the authenticated user.
	 * @apiBody {String} storageId Ciphertext storage identifier referenced by the event.
	 * @apiSuccess {String} messageId Encrypted event identifier.
	 * @apiSuccess {String} storageId Released ciphertext storage identifier.
	 * @apiSuccess {String="released"} state Per-user retention state.
	 * @apiSuccess {Date} releasedAt Time the authenticated user released the attachment.
	 * @apiError (404) EventNotFound The event is missing or does not belong to the authenticated participant.
	 * @apiError (404) AttachmentNotFound The event does not reference the requested ciphertext.
	 * @apiDescription Records an idempotent per-user release intent. It does not alter the signed envelope, remove another participant's access, or unpin ciphertext needed for pending delivery and repair.
	 */
	app.ms.api.onAuthorizedPost(
		'chat/events/:messageId/attachments/release',
		async (req, res) => {
			return res.send(await chat.releaseEventAttachment(
				req.user.id,
				req.params.messageId,
				req.body.storageId
			));
		}
	);

	/**
	 * @api {post} /v1/admin/chat/attachments/cleanup Clean retained encrypted chat attachments
	 * @apiName CleanupEncryptedChatAttachments
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiPermission AdminAll
	 * @apiBody {Number} [limit=25] Maximum lifecycle rows to process, capped at 100.
	 * @apiBody {Number} [attachmentReleasedRetentionMs=604800000] Minimum time after release before committed ciphertext becomes cleanup-eligible.
	 * @apiSuccess {Number} processed Lifecycle rows processed.
	 * @apiSuccess {Number} cleaned Uploads or fully released event attachments tombstoned and queued for reference-safe storage removal.
	 * @apiSuccess {Number} blocked Rows retained because a participant has not released or delivery is not acknowledged.
	 * @apiSuccess {Number} releasedCleaned Fully released event attachments detached and queued for reference-safe storage removal.
	 * @apiSuccess {Number} releasedBlocked Released event attachments retained by participant or delivery gates.
	 * @apiSuccess {Number} reconciled Uploads repaired to attached state from an accepted event reference.
	 * @apiSuccess {Number} pruned Expired cleanup audit rows removed.
	 * @apiSuccess {Number} failed Rows left retryable after a cleanup failure.
	 * @apiDescription Uses configured retention windows unless explicit operator overrides are supplied. Committed ciphertext is detached only after every local participant releases it and every required outbound delivery has a signed acknowledgement. Plaintext names, MIME types, attachment keys, and message bodies are never read.
	 */
	app.ms.api.onAuthorizedPost(
		'admin/chat/attachments/cleanup',
		async (req, res) => {
			await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
			return res.send(await chat.processAttachmentCleanup(req.body));
		}
	);

	/**
	 * @api {post} /v1/chat/events Store signed encrypted chat event
	 * @apiName StoreEncryptedChatEvent
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiDescription Verifies and idempotently appends a `geesome-e2ee-v2` envelope. The node stores only opaque ciphertext and public routing metadata.
	 * @apiBody {Object} envelope Signed encrypted envelope.
	 * @apiBody {Object[]} [recipientEndpoints] Remote node destinations for owners represented in the encrypted envelope.
	 * @apiBody {String} [recipientEndpoints.ownerId] Recipient stable identity.
	 * @apiBody {String} [recipientEndpoints.publicKey] Recipient static-identity public key; it must derive `ownerId`.
	 * @apiBody {String} [recipientEndpoints.inboxUrl] Public HTTPS GeeSome chat inbox.
	 * @apiSuccess {Object} event Stored opaque event and assigned sequence.
	 * @apiSuccess {Boolean} replay Whether the same message was already accepted.
	 * @apiError (413) AttachmentTooLarge A referenced ciphertext file or the combined attachment bytes exceed the configured chat limits.
	 */
	app.ms.api.onAuthorizedPost('chat/events', async (req, res) => {
		return res.send(await chat.acceptEncryptedEvent(req.user.id, req.body.envelope, {
			recipientEndpoints: req.body.recipientEndpoints
		}));
	});

	/**
	 * @api {get} /v1/chat/events/:messageId/deliveries Read encrypted-event delivery state
	 * @apiName ReadChatEventDeliveries
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiParam {String} messageId Locally sent encrypted event identifier.
	 * @apiSuccess {Object[]} list Per-recipient pending/delivered/failed state and signed acknowledgement sequences.
	 */
	app.ms.api.onAuthorizedGet('chat/events/:messageId/deliveries', async (req, res) => {
		return res.send({
			list: await chat.getEventDeliveries(req.user.id, req.params.messageId)
		});
	});

	/**
	 * @api {get} /v1/chat/conversations/:conversationId/events Read encrypted chat events
	 * @apiName ReadEncryptedChatEvents
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiParam {String} conversationId Opaque conversation identifier.
	 * @apiQuery {String} [afterSequence] Return events after this sequence.
	 * @apiQuery {Number} [limit=50] Maximum events, capped at 100.
	 * @apiSuccess {Object[]} list Ordered opaque events.
	 * @apiSuccess {String[]} list.releasedAttachmentStorageIds Ciphertext attachments released by the authenticated user and hidden from their local history.
	 * @apiSuccess {Number} total Matching event count.
	 */
	app.ms.api.onAuthorizedGet('chat/conversations/:conversationId/events', async (req, res) => {
		return res.send(await chat.getEncryptedEvents(req.user.id, req.params.conversationId, req.query));
	});

	/**
	 * @api {get} /v1/chat/conversations/:conversationId/head Read encrypted conversation head
	 * @apiName ReadEncryptedChatHead
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiParam {String} conversationId Opaque conversation identifier.
	 * @apiSuccess {String} conversationId Opaque conversation identifier.
	 * @apiSuccess {String} lastSequence Latest locally persisted sequence.
	 */
	app.ms.api.onAuthorizedGet('chat/conversations/:conversationId/head', async (req, res) => {
		return res.send(await chat.getConversationHead(req.user.id, req.params.conversationId));
	});

	/**
	 * @api {post} /v1/chat/conversations/:conversationId/reconcile Reconcile encrypted conversation history
	 * @apiName ReconcileEncryptedChatConversation
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiDescription Compares a durable per-recipient source cursor with a signed remote source head, imports bounded missing encrypted events through the normal verification path, and persists scan progress for restart-safe continuation.
	 * @apiParam {String} conversationId Opaque conversation identifier.
	 * @apiBody {String} sourceOwnerId Stable remote source identity.
	 * @apiBody {String} [sourcePublicKey] Source static-identity public key. Required on the first reconciliation; later calls can reuse stored source metadata.
	 * @apiBody {String} [syncUrl] Source HTTPS chat sync endpoint. Required on the first reconciliation; later calls can reuse the stored endpoint.
	 * @apiBody {Number} [limit=10] Events requested per page, capped at 10.
	 * @apiBody {Number} [maxPages=5] Pages processed in this call, capped at 20.
	 * @apiSuccess {Number} imported Newly stored encrypted events.
	 * @apiSuccess {Number} replayed Already present encrypted events reverified idempotently.
	 * @apiSuccess {Boolean} complete Whether the durable verified cursor reached the signed source head.
	 * @apiSuccess {String} verifiedSourceSequence Last fully reconciled source sequence.
	 */
	app.ms.api.onAuthorizedPost(
		'chat/conversations/:conversationId/reconcile',
		async (req, res) => {
			return res.send(await chat.reconcileConversation(
				req.user.id,
				req.params.conversationId,
				req.body
			));
		}
	);

	/**
	 * @api {post} /v1/chat/events/:messageId/receipt Store local message receipt
	 * @apiName StoreChatEventReceipt
	 * @apiGroup Chat
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiParam {String} messageId Stable encrypted event identifier.
	 * @apiBody {String="received","read"} state Receipt state.
	 * @apiSuccess {Object} result Stored receipt metadata.
	 */
	app.ms.api.onAuthorizedPost('chat/events/:messageId/receipt', async (req, res) => {
		return res.send(await chat.setEventReceipt(req.user.id, req.params.messageId, req.body.state));
	});
}
