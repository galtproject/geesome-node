import {IGeesomeApp} from '../../interface.js';
import {IApiModuleCommonOutput, IApiModulePotInput} from '../api/interface.js';
import IGeesomeActivityPubModule, {IActivityPubInboundRequest} from './interface.js';
import {activityPubContentType, activityPubWebFingerContentType} from './helpers.js';

export default (app: IGeesomeApp, activityPubModule: IGeesomeActivityPubModule) => {
	/**
	 * @api {get} /.well-known/webfinger Resolve ActivityPub group actor WebFinger resource
	 * @apiName ActivityPubWebFinger
	 * @apiGroup ActivityPub
	 *
	 * @apiDescription Public ActivityPub WebFinger endpoint for local federatable groups. Only public, local, non-encrypted groups are exposed.
	 * @apiQuery {String} resource WebFinger resource such as `acct:group-name@example.com`.
	 * @apiSuccess {Object} result JRD document with an ActivityPub actor self link.
	 */
	app.ms.api.onUnversionGet('.well-known/webfinger', async (req, res) => {
		setWebFingerHeaders(res);
		return res.send(await activityPubModule.getWebFingerResponse(req.query.resource), 200);
	});

	/**
	 * @api {get} /ap/groups/:groupName Get ActivityPub group actor
	 * @apiName ActivityPubGroupActor
	 * @apiGroup ActivityPub
	 *
	 * @apiDescription Public ActivityStreams actor document for a local federatable GeeSome group.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiSuccess {Object} result ActivityStreams `Group` actor document.
	 */
	app.ms.api.onUnversionGet('ap/groups/:groupName', async (req, res) => {
		setActivityPubHeaders(res);
		return res.send(await activityPubModule.getGroupActor(req.params.groupName), 200);
	});

	/**
	 * @api {get} /ap/groups/:groupName/outbox Get ActivityPub group outbox
	 * @apiName ActivityPubGroupOutbox
	 * @apiGroup ActivityPub
	 *
	 * @apiDescription Public read-only ActivityStreams outbox collection for a local federatable GeeSome group. The first slice returns serialized published posts only; inbound federation and delivery are not accepted here.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiQuery {Number} [limit=20] Maximum posts to serialize, capped by the group post-list limit.
	 * @apiQuery {Number} [offset=0] Offset for the current read-only page.
	 * @apiSuccess {Object} result ActivityStreams ordered collection of `Create` activities.
	 */
	app.ms.api.onUnversionGet('ap/groups/:groupName/outbox', async (req, res) => {
		setActivityPubHeaders(res);
		return res.send(await activityPubModule.getGroupOutbox(req.params.groupName, req.query), 200);
	});

	/**
	 * @api {get} /ap/groups/:groupName/posts/:localId Get ActivityPub post object
	 * @apiName ActivityPubGroupPostObject
	 * @apiGroup ActivityPub
	 *
	 * @apiDescription Public ActivityStreams `Note` object for one published local group post.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiParam {Number} localId Local per-group post id.
	 * @apiSuccess {Object} result ActivityStreams `Note` object.
	 */
	app.ms.api.onUnversionGet('ap/groups/:groupName/posts/:localId', async (req, res) => {
		setActivityPubHeaders(res);
		return res.send(await activityPubModule.getGroupPostNote(req.params.groupName, req.params.localId), 200);
	});

	/**
	 * @api {post} /ap/groups/:groupName/inbox Verify ActivityPub group inbox request
	 * @apiName ActivityPubGroupInbox
	 * @apiGroup ActivityPub
	 *
	 * @apiDescription Public ActivityStreams inbox endpoint for a local federatable GeeSome group. This slice verifies HTTP signatures and request digests but does not yet accept or persist ActivityPub activities.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiHeader {String} Signature ActivityPub HTTP Signature header.
	 * @apiHeader {String} Digest SHA-256 digest for the raw JSON request body.
	 * @apiBody {Object} activity ActivityStreams activity payload.
	 * @apiSuccess {Boolean} accepted Always `false` until follow/delivery state is implemented.
	 */
	app.ms.api.onUnversionPost('ap/groups/:groupName/inbox', async (req, res) => {
		return handleActivityPubInboxRequest(res, async () => {
			await activityPubModule.verifyGroupInboxRequest(req.params.groupName, getInboundRequest(req));
		});
	});

	/**
	 * @api {post} /ap/shared-inbox Verify ActivityPub shared inbox request
	 * @apiName ActivityPubSharedInbox
	 * @apiGroup ActivityPub
	 *
	 * @apiDescription Public ActivityStreams shared inbox endpoint. This slice verifies HTTP signatures and request digests but does not yet accept or persist ActivityPub activities.
	 * @apiHeader {String} Signature ActivityPub HTTP Signature header.
	 * @apiHeader {String} Digest SHA-256 digest for the raw JSON request body.
	 * @apiBody {Object} activity ActivityStreams activity payload.
	 * @apiSuccess {Boolean} accepted Always `false` until follow/delivery state is implemented.
	 */
	app.ms.api.onUnversionPost('ap/shared-inbox', async (req, res) => {
		return handleActivityPubInboxRequest(res, async () => {
			await activityPubModule.verifySharedInboxRequest(getInboundRequest(req));
		});
	});
}

async function handleActivityPubInboxRequest(res: IApiModuleCommonOutput, verify: () => Promise<void>) {
	setActivityPubHeaders(res);
	try {
		await verify();
		return res.send({
			ok: false,
			accepted: false,
			message: 'activitypub_inbox_not_implemented'
		}, 501);
	} catch (e) {
		if (!isExpectedActivityPubInboxError(e)) {
			throw e;
		}
		return res.send({
			ok: false,
			accepted: false,
			message: e.message
		}, getActivityPubInboxErrorStatus(e));
	}
}

function getInboundRequest(req: IApiModulePotInput): IActivityPubInboundRequest {
	return {
		method: 'POST',
		url: req.fullRoute || req.route,
		headers: req.headers,
		rawBody: req.rawBody,
		body: req.body
	};
}

function isExpectedActivityPubInboxError(error): error is Error & {code?: number} {
	return typeof error?.message === 'string' && error.message.startsWith('activitypub_');
}

function getActivityPubInboxErrorStatus(error: Error & {code?: number}): number {
	if (Number.isInteger(error.code)) {
		return error.code as number;
	}
	if (error.message.includes('signature') || error.message.includes('digest')) {
		return 401;
	}
	return 400;
}

function setActivityPubHeaders(res: IApiModuleCommonOutput): void {
	res.setHeader('Content-Type', activityPubContentType);
}

function setWebFingerHeaders(res: IApiModuleCommonOutput): void {
	res.setHeader('Content-Type', activityPubWebFingerContentType);
}
