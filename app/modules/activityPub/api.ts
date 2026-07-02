import {IGeesomeApp} from '../../interface.js';
import {IApiModuleCommonOutput, IApiModulePotInput} from '../api/interface.js';
import {CorePermissionName} from '../database/interface.js';
import IGeesomeActivityPubModule, {IActivityPubInboxResult, IActivityPubInboundRequest} from './interface.js';
import {
	activityPubContentType,
	activityPubNodeInfoContentType,
	activityPubNodeInfoDiscoveryContentType,
	activityPubWebFingerContentType
} from './helpers.js';

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
	 * @api {get} /.well-known/nodeinfo Discover ActivityPub NodeInfo document
	 * @apiName ActivityPubNodeInfoDiscovery
	 * @apiGroup ActivityPub
	 *
	 * @apiDescription Public NodeInfo discovery endpoint for the GeeSome ActivityPub service. It advertises the NodeInfo 2.1 document URL when ActivityPub is enabled.
	 * @apiSuccess {Object[]} links NodeInfo schema links.
	 */
	app.ms.api.onUnversionGet('.well-known/nodeinfo', async (req, res) => {
		setNodeInfoDiscoveryHeaders(res);
		return res.send(await activityPubModule.getNodeInfoDiscovery(), 200);
	});

	/**
	 * @api {get} /nodeinfo/2.1 Get ActivityPub NodeInfo document
	 * @apiName ActivityPubNodeInfo
	 * @apiGroup ActivityPub
	 *
	 * @apiDescription Public NodeInfo 2.1 document for Fediverse discovery. It currently advertises GeeSome's ActivityPub protocol support without exposing user or post counts.
	 * @apiSuccess {String} version NodeInfo schema version.
	 * @apiSuccess {Object} software GeeSome node software metadata.
	 * @apiSuccess {String[]} protocols Supported federation protocols.
	 * @apiSuccess {Object} services External service bridges advertised through NodeInfo.
	 * @apiSuccess {Boolean} openRegistrations Whether public account registration is advertised.
	 * @apiSuccess {Object} usage Public usage counters; this first ActivityPub slice keeps counters at zero until privacy/product policy is defined.
	 * @apiSuccess {Object} metadata Free-form node metadata.
	 */
	app.ms.api.onUnversionGet('nodeinfo/2.1', async (req, res) => {
		setNodeInfoHeaders(res);
		return res.send(await activityPubModule.getNodeInfo(), 200);
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
	 * @apiDescription Public read-only ActivityStreams following collection for a local federatable GeeSome group. Pending outbound follows are hidden until a signed remote `Accept` is recorded; rejected outbound follows stay hidden.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiQuery {Number} [limit=20] Maximum accepted following actors to include, capped at 100.
	 * @apiQuery {Number} [offset=0] Offset for the current following page.
	 * @apiSuccess {Object} result ActivityStreams ordered collection of accepted following actor URLs.
	 */
	app.ms.api.onUnversionGet('ap/groups/:groupName/following', async (req, res) => {
		setActivityPubHeaders(res);
		return res.send(await activityPubModule.getGroupFollowing(req.params.groupName, req.query), 200);
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
	 * @apiDescription Lists signed inbound ActivityPub `Flag` reports stored for a local federatable group actor. Each report includes derived target context showing whether the signed report points at the group actor or a known local ActivityPub post object. Report state can be marked pending or resolved separately; content moderation actions are handled by later moderation flows.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
	 * @apiQuery {String="pending","resolved"} [state] Filter by report state.
	 * @apiQuery {String} [objectId] Filter by reported ActivityPub actor/object id.
	 * @apiQuery {Number} [remoteActorId] Filter by reporting remote actor database id.
	 * @apiSuccess {Object[]} list Flag report rows with remote actor metadata, parsed activity JSON, and derived target context.
	 * @apiSuccess {Number} total Total matching reports.
	 */
	app.ms.api.onAuthorizedGet('admin/activity-pub/groups/:groupName/flags', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminRead);
		return res.send(await activityPubModule.getGroupFlagReports(req.params.groupName, req.query, req.query));
	});

	/**
	 * @api {get} /v1/admin/activity-pub/groups/:groupName/remote-objects List cached ActivityPub remote objects
	 * @apiName AdminActivityPubRemoteObjects
	 * @apiGroup AdminActivityPub
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Lists signed remote ActivityPub objects cached for a local federatable group actor. This is a read-only review surface for remote replies/mentions and tombstones; it does not create, hide, delete, or federate GeeSome posts. Render sanitized `preview.contentHtml`/`preview.contentText` or canonical `preview.contentRichText` in admin UI; `preview.attachments` only contains bounded sanitized remote URL/media metadata such as media category, alt text, dimensions, duration, blurhash, sensitive flag, and per-attachment remote-byte backup eligibility, not imported GeeSome/IPFS content. `object` is the parsed raw ActivityStreams object kept for audit.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
	 * @apiQuery {String} [objectId] Filter by ActivityPub object id.
	 * @apiQuery {String} [objectType] Filter by ActivityPub object type such as `Note`, `Article`, or `Tombstone`.
	 * @apiQuery {String="public","followers","direct"} [visibility] Filter by cached ActivityPub audience visibility.
	 * @apiQuery {String="pending","accepted","rejected"} [reviewState] Filter by cached remote object review state. Objects without a review row are treated as pending.
	 * @apiQuery {Number} [remoteActorId] Filter by remote actor database id.
	 * @apiSuccess {Object[]} list Cached remote object rows with parsed ActivityStreams object JSON, sanitized preview data, optional sanitized remote attachment/media metadata, and remote actor metadata.
	 * @apiSuccess {Number} total Total matching cached remote objects.
	 */
	app.ms.api.onAuthorizedGet('admin/activity-pub/groups/:groupName/remote-objects', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminRead);
		return res.send(await activityPubModule.getGroupRemoteObjects(req.params.groupName, req.query, req.query));
	});

	/**
	 * @api {get} /v1/admin/activity-pub/groups/:groupName/remote-objects/:remoteObjectId Get cached ActivityPub remote object
	 * @apiName AdminActivityPubRemoteObject
	 * @apiGroup AdminActivityPub
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Returns one signed remote ActivityPub object cached for a local federatable group actor. This is an actor-scoped read-only detail view for moderation/review UI; it does not create, hide, delete, or federate GeeSome posts.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiParam {Number} remoteObjectId Cached remote object database id.
	 * @apiSuccess {Object} result Cached remote object row with parsed ActivityStreams object JSON, sanitized preview data, canonical preview rich text, optional sanitized remote attachment/media metadata, and remote actor metadata.
	 */
	app.ms.api.onAuthorizedGet('admin/activity-pub/groups/:groupName/remote-objects/:remoteObjectId', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminRead);
		return res.send(await activityPubModule.getGroupRemoteObject(req.params.groupName, req.params.remoteObjectId));
	});

	/**
	 * @api {get} /v1/admin/activity-pub/groups/:groupName/remote-objects/:remoteObjectId/post-draft Preview cached remote object as a GeeSome post draft
	 * @apiName AdminActivityPubRemoteObjectPostDraft
	 * @apiGroup AdminActivityPub
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Returns a read-only draft projection for a cached remote ActivityPub object. It tells moderation/import UI whether the object is currently safe and accepted for a future GeeSome post, which sanitized rich-text payload would be used, which sanitized remote attachment/media metadata would be carried as provenance, which attachments can be backed up on create, the explicit remote-attachment import policy, and which local post reply target was resolved from `inReplyTo` when available. Remote attachment bytes are not fetched or imported by this route. This route does not create, update, hide, delete, or federate GeeSome posts.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiParam {Number} remoteObjectId Cached remote object database id.
	 * @apiSuccess {Object} result Draft projection with the source remote-object report, readiness flag, blocker reasons, sanitized text/rich-text fields, optional remote attachment/media metadata with backup eligibility, optional provenance-only `attachmentImportPolicy`, optional `replyToPostId`, and ActivityPub source metadata.
	 */
	app.ms.api.onAuthorizedGet('admin/activity-pub/groups/:groupName/remote-objects/:remoteObjectId/post-draft', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminRead);
		return res.send(await activityPubModule.getGroupRemoteObjectPostDraft(req.params.groupName, req.params.remoteObjectId));
	});

	/**
	 * @api {post} /v1/admin/activity-pub/groups/:groupName/remote-objects/:remoteObjectId/post Create GeeSome post from cached ActivityPub remote object
	 * @apiName AdminActivityPubRemoteObjectPostCreate
	 * @apiGroup AdminActivityPub
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Creates a duplicate-resistant native GeeSome remote post from an accepted cached ActivityPub `Note`. The route stores the sanitized canonical rich-text projection as post content, carries sanitized remote attachment/media metadata, and defaults to provenance-only remote attachments. When `importRemoteAttachments` is true, supported remote HTTP(S) media/document attachments are backed up through GeeSome content storage and linked to the created post; unsupported schemes and link-only attachments remain provenance metadata. Raw ActivityStreams JSON stays only on the cached remote object for audit. `inReplyTo` is mapped to a local GeeSome `replyToId` when it targets a known post in the same group actor, and the cached object is linked to the created post. Pending/rejected, non-public, non-Note, contentless, or already-linked objects are rejected.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiParam {Number} remoteObjectId Cached remote object database id.
	 * @apiBody {Boolean} [importRemoteAttachments=false] Back up supported remote HTTP(S) media/document attachments into GeeSome content storage before creating the post.
	 * @apiSuccess {Object} post Created native GeeSome remote post.
	 * @apiSuccess {Object} remoteObject Updated cached remote object report with `localPostId` set.
	 * @apiSuccess {Object[]} [attachmentBackups] Remote attachment backup records when `importRemoteAttachments` imported any attachments.
	 */
	app.ms.api.onAuthorizedPost('admin/activity-pub/groups/:groupName/remote-objects/:remoteObjectId/post', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		return res.send(await activityPubModule.createGroupRemoteObjectPost(req.params.groupName, req.params.remoteObjectId, req.user.id, req.body || {}));
	});

	/**
	 * @api {post} /v1/admin/activity-pub/groups/:groupName/remote-objects/:remoteObjectId/review-state Set cached remote object review state
	 * @apiName AdminActivityPubRemoteObjectReviewState
	 * @apiGroup AdminActivityPub
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Stores a moderation review decision for one cached remote ActivityPub object. This only updates review bookkeeping; it does not create, update, hide, delete, or federate GeeSome posts. Remote `Update`, `Delete`, and `Undo(Create)` activities reset the decision to pending because the reviewed object changed.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiParam {Number} remoteObjectId Cached remote object database id.
	 * @apiBody {String="pending","accepted","rejected"} state New review state.
	 * @apiSuccess {Object} result Updated cached remote object report with review state metadata.
	 */
	app.ms.api.onAuthorizedPost('admin/activity-pub/groups/:groupName/remote-objects/:remoteObjectId/review-state', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		return res.send(await activityPubModule.setGroupRemoteObjectReviewState(req.params.groupName, req.params.remoteObjectId, req.body, req.user.id));
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
	 * @api {post} /v1/admin/activity-pub/groups/:groupName/follow Request ActivityPub outbound follow
	 * @apiName AdminActivityPubGroupFollow
	 * @apiGroup AdminActivityPub
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiDescription Fetches a remote ActivityPub actor, records a pending outbound follow for the local group actor, and queues a signed `Follow` delivery to the remote actor inbox/shared inbox. The public following collection lists the remote actor only after a signed remote `Accept` activity is recorded; signed remote `Reject` activities mark the outbound follow rejected.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiBody {String} actorUrl Remote ActivityPub actor URL to follow.
	 * @apiSuccess {Boolean} ok Whether the follow request was recorded and queued.
	 * @apiSuccess {String} message Processing result code.
	 * @apiSuccess {String} localActorUrl Local group actor URL.
	 * @apiSuccess {String} remoteActorUrl Remote actor URL.
	 * @apiSuccess {Number} followId Stored outbound follow row id.
	 * @apiSuccess {String} followState Stored follow state.
	 * @apiSuccess {Number} deliveryId Queued outbound `Follow` delivery id.
	*/
	app.ms.api.onAuthorizedPost('admin/activity-pub/groups/:groupName/follow', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		return res.send(await activityPubModule.followRemoteActor(req.params.groupName, req.body?.actorUrl));
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
	 * @apiDescription Public ActivityStreams inbox endpoint for a local federatable GeeSome group. Signed `Follow` activities whose `object` is the local group actor are stored idempotently as ActivityPub follow state, signed remote `Accept(Follow)` and `Reject(Follow)` activities update matching outbound follow requests, signed embedded `Undo(Follow)` activities cancel inbound follow state, signed `Block` activities cancel follower state so future local post delivery skips that remote actor, and signed `Flag` activities store pending moderation reports for the local actor or known local objects. Other activity types are not accepted yet.
	 * @apiParam {String} groupName GeeSome group name.
	 * @apiHeader {String} Signature ActivityPub HTTP Signature header.
	 * @apiHeader {String} [Digest] Legacy SHA-256 digest for the raw JSON request body; the signature must cover either `Digest` or `Content-Digest`.
	 * @apiHeader {String} [Content-Digest] RFC-style SHA-256 content digest for the raw JSON request body; the signature must cover either `Digest` or `Content-Digest`.
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
	 * @apiDescription Public ActivityStreams shared inbox endpoint. Signed remote `Create` activities for supported review object types (`Note`, `Article`, `Page`, `Image`, `Video`, `Audio`, `Document`, `Question`, and `Event`) are persisted idempotently when they reply to a known local ActivityPub object or mention a known local group actor. Signed `Update` activities refresh already-cached supported remote objects from the same remote actor, and signed `Delete` or `Undo(Create)` activities tombstone already-cached remote objects from the same remote actor. Only accepted public `Note` objects can become native GeeSome remote posts; non-Note objects remain review/audit records. If an updated or tombstoned remote Note was manually imported as a GeeSome remote post and the source identity still matches, that imported post is updated or soft-deleted too. Other activity types are not accepted yet.
	 * @apiHeader {String} Signature ActivityPub HTTP Signature header.
	 * @apiHeader {String} [Digest] Legacy SHA-256 digest for the raw JSON request body; the signature must cover either `Digest` or `Content-Digest`.
	 * @apiHeader {String} [Content-Digest] RFC-style SHA-256 content digest for the raw JSON request body; the signature must cover either `Digest` or `Content-Digest`.
	 * @apiBody {Object} activity ActivityStreams activity payload.
	 * @apiSuccess {Boolean} accepted Whether the activity was accepted and stored.
	 * @apiSuccess {String} activityType Activity type that was processed.
	 * @apiSuccess {String} objectId ActivityPub object id that was recorded, updated, or tombstoned.
	 * @apiSuccess {Number} activityPubObjectId Local cached ActivityPub object row id.
	 * @apiSuccess {Boolean} [localPostUpdated] Whether a linked imported GeeSome remote post was updated for `Update` of an importable Note.
	 * @apiSuccess {Boolean} [localPostDeleted] Whether a linked imported GeeSome remote post was soft-deleted for `Delete` or `Undo(Create)`.
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

function setNodeInfoDiscoveryHeaders(res: IApiModuleCommonOutput): void {
	res.setHeader('Content-Type', activityPubNodeInfoDiscoveryContentType);
}

function setNodeInfoHeaders(res: IApiModuleCommonOutput): void {
	res.setHeader('Content-Type', activityPubNodeInfoContentType);
}
