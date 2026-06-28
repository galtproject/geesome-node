import {IGeesomeApp} from '../../interface.js';
import {IApiModuleCommonOutput} from '../api/interface.js';
import IGeesomeActivityPubModule from './interface.js';
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
}

function setActivityPubHeaders(res: IApiModuleCommonOutput): void {
	res.setHeader('Content-Type', activityPubContentType);
}

function setWebFingerHeaders(res: IApiModuleCommonOutput): void {
	res.setHeader('Content-Type', activityPubWebFingerContentType);
}
