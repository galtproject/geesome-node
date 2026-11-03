import {IGeesomeApp} from '../../interface.js';
import {CorePermissionName} from '../database/interface.js';
import {requireIntegrationScopes} from '../api/integrationScopes.js';
import ILocalClientModule from './interface.js';

export default function registerApi(app: IGeesomeApp, module: ILocalClientModule) {
	async function authorize(req) {
		requireIntegrationScopes(req.apiKey, ['publishing:local']);
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
	}
	/**
	 * @api {post} /v1/user/local-publications Schedule local social publication
	 * @apiName LocalPublicationCreate
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local scope and permission to edit a published public local post. Social credentials stay on the client. Repeated requestKey returns the original snapshot; conflicting input returns 409.
	 * @apiBody {String} requestKey Owner-scoped idempotency key (1–128 identifier characters).
	 * @apiBody {Number} postId Existing public locally authored post.
	 * @apiBody {String="threads","instagram","reddit"} network Destination network.
	 * @apiBody {String} localAccountId Account identifier configured on the local client.
	 * @apiBody {String} scheduledAt ISO 8601 instant with timezone.
	 * @apiBody {Object} [target] Provider target options (subreddit, title, flairId, kind=self|link).
	 * @apiSuccess {Object} job Frozen scheduled job with text/media payload.
	 * @apiError (409) LocalPublicationRequestConflict Request key was already used with different input.
	 * @apiSuccessExample {json} Scheduled
	 * {"job":{"id":1,"status":"queued","network":"threads","payload":{"text":"Hello","attachments":[]}}}
	 */
	app.ms.api.onAuthorizedPost('user/local-publications', async (req, res) => {
		await authorize(req);
		res.send({job: await module.createJob(req.user.id, req.body)});
	});
	/**
	 * @api {get} /v1/user/local-publications List local social publications
	 * @apiName LocalPublicationList
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local. Only the authenticated owner's jobs are returned; claim tokens are included for manual resolution. Processing jobs are never automatically requeued.
	 * @apiQuery {Number{1-100}} [limit=20] Page size.
	 * @apiQuery {Number{0-1000000}} [offset=0] Page offset.
	 * @apiQuery {String="queued","processing","posted","failed","needs_review","cancelled"} [status] Filter.
	 * @apiSuccess {Object[]} jobs Owner jobs ordered by newest creation.
	 */
	app.ms.api.onAuthorizedGet('user/local-publications', async (req, res) => {
		await authorize(req);
		res.send({jobs: await module.listJobs(req.user.id, req.query)});
	});
	/**
	 * @api {post} /v1/user/local-publications/claim Claim one due local publication
	 * @apiName LocalPublicationClaim
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local. Atomically claims one eligible owner job using node time, rechecking source permissions. Account filters do not grant permissions. No lease expiry or automatic resend.
	 * @apiBody {Object[]} accounts Configured local accounts (maximum 100).
	 * @apiBody {String="threads","instagram","reddit"} accounts.network Network.
	 * @apiBody {String} accounts.localAccountId Local account identifier.
	 * @apiSuccess {Object|null} job Claimed job with claimToken or null when none is due.
	 */
	app.ms.api.onAuthorizedPost('user/local-publications/claim', async (req, res) => {
		await authorize(req);
		res.send({job: await module.claimJob(req.user.id, req.body)});
	});
	/**
	 * @api {post} /v1/user/local-publications/:jobId/result Report local publication result
	 * @apiName LocalPublicationResult
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local, ownership and original claim token. Identical result reports are idempotent. Processing or needs_review jobs allow confirmed manual resolution; terminal conflicting reports return 409.
	 * @apiParam {Number} jobId Owner job ID.
	 * @apiBody {String} claimToken Original claim token.
	 * @apiBody {String="posted","failed","needs_review"} status Result.
	 * @apiBody {String} [remoteId] Required for posted.
	 * @apiBody {String} [remoteUrl] HTTPS post URL without credentials/query/fragment.
	 * @apiBody {String} [error] Sanitized error, maximum 500 characters; no secrets.
	 * @apiSuccess {Object} job Updated job.
	 * @apiError (409) LocalPublicationResultConflict Conflicting terminal result or invalid claim token.
	 */
	app.ms.api.onAuthorizedPost('user/local-publications/:jobId/result', async (req, res) => {
		await authorize(req);
		res.send({job: await module.reportResult(req.user.id, req.params.jobId, req.body)});
	});
	/**
	 * @api {post} /v1/user/local-publications/:jobId/cancel Cancel queued local publication
	 * @apiName LocalPublicationCancel
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local and ownership. Only queued jobs cancel. Repeated cancellation is harmless; processing/sent work cannot be cancelled. The idempotency key remains reserved.
	 * @apiParam {Number} jobId Owner job ID.
	 * @apiSuccess {Object} job Cancelled job.
	 * @apiError (409) LocalPublicationNotQueued Job has already been claimed or completed.
	 */
	app.ms.api.onAuthorizedPost('user/local-publications/:jobId/cancel', async (req, res) => {
		await authorize(req);
		res.send({job: await module.cancelJob(req.user.id, req.params.jobId)});
	});
}
