import type {IGeesomeApp} from '../../interface.js';
import type IGeesomeChatModule from './interface.js';

export default function registerChatApi(app: IGeesomeApp, chat: IGeesomeChatModule) {
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
		return res.send({list: await chat.getPublicDevices(req.user.id, req.params.ownerId)});
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
	 * @apiSuccess {Object} event Stored opaque event and assigned sequence.
	 * @apiSuccess {Boolean} replay Whether the same message was already accepted.
	 */
	app.ms.api.onAuthorizedPost('chat/events', async (req, res) => {
		return res.send(await chat.acceptEncryptedEvent(req.user.id, req.body.envelope));
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
