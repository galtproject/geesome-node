import type {IGeesomeApp} from '../../interface.js';
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
	 * @apiDescription Verifies the sender static-identity signature, browser device signature, encrypted envelope, destination owner, and active local recipient key before idempotently storing ciphertext. Returns a recipient-identity-signed acknowledgement.
	 * @apiBody {Object} delivery Signed `geesome-chat-delivery-v1` payload.
	 * @apiSuccess {String} deliveryId Stable delivery identifier.
	 * @apiSuccess {String} acceptedSequence Recipient node sequence.
	 * @apiSuccess {Object} signature Recipient static-identity signature.
	 */
	app.ms.api.onPost('chat/inbox', async (req, res) => {
		return res.send(await chat.acceptRemoteDelivery(req.body.delivery));
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
