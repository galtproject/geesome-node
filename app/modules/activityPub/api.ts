import {IGeesomeApp} from '../../interface.js';
import {IApiModuleCommonOutput, IApiModulePotInput} from '../api/interface.js';
import {CorePermissionName} from '../database/interface.js';
import IGeesomeActivityPubModule, {IActivityPubInboxResult, IActivityPubInboundRequest} from './interface.js';
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
	 * @api {get} /ap/groups/:groupName/followers Get ActivityPub group followers
	 * @apiName ActivityPubGroupFollowers
	 * @apiGroup ActivityPub
	 *
	 * @apiDescription Public read-only ActivityStreams followers collection for a local federatable GeeSome group. It lists accepted inbound ActivityPub follower actor URLs.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiQuery {Number} [limit=20] Maximum accepted followers to include, capped at 100.
	 * @apiQuery {Number} [offset=0] Offset for the current followers page.
	 * @apiSuccess {Object} result ActivityStreams ordered collection of accepted follower actor URLs.
	 */
	app.ms.api.onUnversionGet('ap/groups/:groupName/followers', async (req, res) => {
		setActivityPubHeaders(res);
		return res.send(await activityPubModule.getGroupFollowers(req.params.groupName, req.query), 200);
	});

	/**
	 * @api {get} /ap/groups/:groupName/following Get ActivityPub group following
	 * @apiName ActivityPubGroupFollowing
	 * @apiGroup ActivityPub
	 *
	 * @apiDescription Public read-only ActivityStreams following collection for a local federatable GeeSome group. Outbound ActivityPub follows are not supported yet, so this collection is currently empty.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiSuccess {Object} result Empty ActivityStreams ordered collection.
	 */
	app.ms.api.onUnversionGet('ap/groups/:groupName/following', async (req, res) => {
		setActivityPubHeaders(res);
		return res.send(await activityPubModule.getGroupFollowing(req.params.groupName), 200);
	});

	/**
	 * @api {get} /v1/admin/activity-pub/groups/:groupName/flags List ActivityPub flag reports
	 * @apiName AdminActivityPubFlagReports
	 * @apiGroup AdminActivityPub
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Lists signed inbound ActivityPub `Flag` reports stored for a local federatable group actor. Report state can be marked pending or resolved separately; content moderation actions are handled by later moderation flows.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
	 * @apiQuery {String="pending","resolved"} [state] Filter by report state.
	 * @apiQuery {String} [objectId] Filter by reported ActivityPub actor/object id.
	 * @apiQuery {Number} [remoteActorId] Filter by reporting remote actor database id.
	 * @apiSuccess {Object[]} list Flag report rows.
	 * @apiSuccess {Number} total Total matching reports.
	 */
	app.ms.api.onAuthorizedGet('admin/activity-pub/groups/:groupName/flags', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminRead);
		return res.send(await activityPubModule.getGroupFlagReports(req.params.groupName, req.query, req.query));
	});

	/**
	 * @api {post} /v1/admin/activity-pub/groups/:groupName/flags/:flagId/state Set ActivityPub flag report state
	 * @apiName AdminActivityPubFlagReportState
	 * @apiGroup AdminActivityPub
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Updates moderation bookkeeping for a stored inbound ActivityPub `Flag` report. This does not hide, delete, or federate any content; it only marks the report pending or resolved.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiParam {Number} flagId Flag report database id.
	 * @apiBody {String="pending","resolved"} state New report state.
	 * @apiSuccess {Object} result Updated flag report row.
	 */
	app.ms.api.onAuthorizedPost('admin/activity-pub/groups/:groupName/flags/:flagId/state', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		return res.send(await activityPubModule.setGroupFlagReportState(req.params.groupName, req.params.flagId, req.body.state));
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
	 * @apiDescription Public ActivityStreams inbox endpoint for a local federatable GeeSome group. Signed `Follow` activities whose `object` is the local group actor are stored idempotently as ActivityPub follow state, signed embedded `Undo(Follow)` activities cancel that follow state, signed `Block` activities cancel follower state so future local post delivery skips that remote actor, and signed `Flag` activities store pending moderation reports for the local actor or known local objects. Other activity types are not accepted yet.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiHeader {String} Signature ActivityPub HTTP Signature header.
	 * @apiHeader {String} Digest SHA-256 digest for the raw JSON request body.
	 * @apiBody {Object} activity ActivityStreams activity payload.
	 * @apiSuccess {Boolean} ok Whether the signed activity was processed.
	 * @apiSuccess {Boolean} accepted Whether the activity leaves the follow accepted immediately.
	 * @apiSuccess {String} message Processing result code.
	 * @apiSuccess {String} activityType Activity type that was processed.
	 * @apiSuccess {String} followState Stored follow state.
	 * @apiSuccess {Number} [deliveryId] Queued outbound `Accept` delivery id when the follow was accepted immediately.
	 */
	app.ms.api.onUnversionPost('ap/groups/:groupName/inbox', async (req, res) => {
		return handleActivityPubInboxRequest(res, async () => {
			return activityPubModule.handleGroupInboxRequest(req.params.groupName, getInboundRequest(req));
		});
	});

	/**
	 * @api {post} /ap/shared-inbox Verify ActivityPub shared inbox request
	 * @apiName ActivityPubSharedInbox
	 * @apiGroup ActivityPub
	 *
	 * @apiDescription Public ActivityStreams shared inbox endpoint. Signed remote `Create(Note)` activities are persisted idempotently when they reply to a known local ActivityPub object, and signed `Delete` or `Undo(Create)` activities tombstone already-cached remote objects from the same remote actor. Other activity types are not accepted yet.
	 * @apiHeader {String} Signature ActivityPub HTTP Signature header.
	 * @apiHeader {String} Digest SHA-256 digest for the raw JSON request body.
	 * @apiBody {Object} activity ActivityStreams activity payload.
	 * @apiSuccess {Boolean} accepted Whether the activity was accepted and stored.
	 */
	app.ms.api.onUnversionPost('ap/shared-inbox', async (req, res) => {
		return handleActivityPubInboxRequest(res, async () => {
			return activityPubModule.handleSharedInboxRequest(getInboundRequest(req));
		});
	});
}

async function handleActivityPubInboxRequest(res: IApiModuleCommonOutput, processActivity: () => Promise<IActivityPubInboxResult>) {
	setActivityPubHeaders(res);
	try {
		const result = await processActivity();
		return res.send(result, getActivityPubInboxSuccessStatus(result));
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

function getActivityPubInboxSuccessStatus(result: IActivityPubInboxResult): number {
	if (result.ok) {
		return 202;
	}
	return 501;
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
