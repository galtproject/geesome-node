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
	 * @api {get} /v1/user/local-publications/sources List private queue source groups
	 * @apiName LocalPublicationSources
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local and group management. Lists only owned ordinary closed local channels, including empty groups. Selection does not schedule direct group posts. Last post date is the latest nondeleted post creation time.
	 * @apiQuery {Number{1-100}} [limit=20] Bounded group page size.
	 * @apiQuery {Number{0-1000000}} [offset=0] Page offset.
	 * @apiQuery {String} [ids] Comma-separated 1–100 distinct positive IDs; intersects owner/eligibility filters.
	 * @apiSuccess {Number} ownerId Authenticated GeeSome owner.
	 * @apiSuccess {Object[]} groups Group id/name/title/lastPostAt, with null lastPostAt for empty groups.
	 */
	app.ms.api.onAuthorizedGet('user/local-publications/sources', async (req, res) => {
		await authorize(req);
		res.send(await module.listSources(req.user.id, req.query));
	});
	/**
	 * @api {post} /v1/user/local-publications/sources Create a private queue source group
	 * @apiName LocalPublicationSourceCreate
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local and group management. Creates a native owned ordinary closed channel with deterministic owner/request-key name. Retries recover the same group; changed intent under the same key conflicts. No posts or jobs are created.
	 * @apiBody {String} requestKey Owner-scoped stable identifier (1–128 characters).
	 * @apiBody {String} [title="Publication queue"] Group title (1–200 characters).
	 * @apiSuccess {Number} ownerId Authenticated GeeSome owner.
	 * @apiSuccess {Object} group Group id/name/title/lastPostAt.
	 * @apiError (409) LocalPublicationSourceConflict Key already used with different intent or ineligible group.
	 */
	app.ms.api.onAuthorizedPost('user/local-publications/sources', async (req, res) => {
		await authorize(req);
		res.send(await module.createSource(req.user.id, req.body));
	});
	/**
	 * @api {post} /v1/user/local-publications/compose Compose and schedule a private outbox post
	 * @apiName LocalPublicationCompose
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local and assets:write. Creates a native ordinary closed owner outbox lazily, or uses an explicitly chosen owned ordinary closed channel. Source post and all destination jobs commit atomically before provider calls. Omitted schedule means now on first creation; identical request retries return the same source/jobs. Existing draft edits are rejected explicitly. No social credentials accepted. Image references resolve owned Assets or local, non-deleted, non-remote, unencrypted Content. Check outbox capabilities.ownedImageReferences before using Content-only references with older nodes.
	 * @apiBody {String="social-images-v1"} [mediaPolicy] Prepare provider-ready JPEG images before source/job acceptance. Original refs stay in the private source post; per-job payload.mediaPreparation binds original refs and prepared refs. Omit for exact legacy behavior.
	 * @apiBody {String} requestKey Owner-scoped compose idempotency key.
	 * @apiBody {String} text New text (maximum 40000 characters).
	 * @apiBody {String[]} imageStorageIds Owned Asset or local Content storage IDs (maximum 20).
	 * @apiBody {Object[]} destinations Explicit network/localAccountId/target selections (1–20). With explicit groupId only, omit localAccountId to defer local account selection until claim.
	 * @apiBody {String} [scheduledAt] ISO instant with timezone; omit to send now.
	 * @apiBody {Object} [producer] For one destination only: type=microwave-girls and positive postId. Stored with server-computed canonical original-intent digest, preserved when a claim resolves an unbound account/route; no URL or credential.
	 * @apiBody {String="microwave-girls"} [producer.type] Producer marker when producer is supplied.
	 * @apiBody {Number} [producer.postId] Positive owned Girls receipt ID when producer is supplied.
	 * @apiBody {Number} [groupId] Existing owned ordinary closed local channel. Included in replay intent.
	 * @apiBody {Number} [postId] Internal source reference for an unchanged owned outbox draft.
	 * @apiSuccess {Object} group Owned ordinary closed outbox identity.
	 * @apiSuccess {Number} postId Persisted source post.
	 * @apiSuccess {Object[]} jobs Independent scheduled jobs per destination, each including its source groupId. With mediaPolicy, attachments are prepared JPEGs and mediaPreparation contains policy/sourceAttachments/digest. Original producer.digest remains bound to authored originals. Producer jobs include type/postId/digest and composeKey for owner-scoped reconciliation.
	 * @apiError (409) LocalPublicationRequestConflict Compose key already used with different input.
	 * @apiError (409) LocalPublicationDraftChanged Draft text or image selection differs from stored source.
	 */
	app.ms.api.onAuthorizedPost('user/local-publications/compose', async (req, res) => {
		await authorize(req);
		requireIntegrationScopes(req.apiKey, ['assets:write']);
		res.send(await module.compose(req.user.id, req.body));
	});
	/**
	 * @api {get} /v1/user/local-publications/outbox List unscheduled private outbox sources
	 * @apiName LocalPublicationOutbox
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local. Read-only: never creates a group or jobs. Lists owned direct posts from the designated outbox or selected ordinary closed source groups, with no delivery history, destinations or send time. Historical/cancelled sources never reappear as new drafts.
	 * @apiQuery {String} [groupIds] Comma-separated distinct positive private group IDs (maximum 100). Empty selects no drafts; absent preserves designated-outbox behavior.
	 * @apiQuery {Number{1-100}} [limit=20] Bounded draft page size.
	 * @apiQuery {Number{0-1000000}} [offset=0] Page offset.
	 * @apiSuccess {Number} ownerId Authenticated GeeSome owner ID for connection verification.
	 * @apiSuccess {Object} capabilities Supported additive publishing features.
	 * @apiSuccess {Boolean} capabilities.ownedImageReferences Compose accepts owned local Content references without an Asset upload.
	 * @apiSuccess {Object|null} group Existing owned outbox identity, or null before first composition.
	 * @apiSuccess {Object[]} drafts Source postId, text, attachments and creation time.
	 */
	app.ms.api.onAuthorizedGet('user/local-publications/outbox', async (req, res) => {
		await authorize(req);
		res.send(await module.getOutbox(req.user.id, req.query));
	});
	/**
	 * @api {post} /v1/user/local-publications Schedule local social publication
	 * @apiName LocalPublicationCreate
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local scope and permission to edit a public local post or an owned ordinary closed local channel source. Social credentials stay on the client. Repeated requestKey returns the original snapshot; conflicting input returns 409.
	 * @apiBody {String} requestKey Owner-scoped idempotency key (1–128 identifier characters).
	 * @apiBody {Number} postId Existing public locally authored post.
	 * @apiBody {String="threads","instagram","reddit","twitter","rule34xxx","bluesky","discord","telegram"} network Destination network.
	 * @apiBody {String} localAccountId Account identifier configured on the local client.
	 * @apiBody {String} scheduledAt ISO 8601 instant with timezone.
	 * @apiBody {Object} [target] Typed targets: Reddit subreddit/title/flairId/kind; Twitter/Bluesky optional sensitive boolean; Discord channelId plus optional guildId/sensitive boolean; Telegram chatId and optional sensitive boolean; Rule34 required tags/source/rating=s|q|e. No credentials or arbitrary headers.
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
	 * @apiQuery {String} [groupIds] Comma-separated distinct positive group IDs (maximum 100), intersected with owner filters. Empty selects no jobs.
	 * @apiQuery {String} [composeKey] Exact owner-scoped compose key (1–128 identifier characters) for read-only lost-response recovery.
	 * @apiQuery {String} [ids] Comma-separated distinct positive job IDs (1–100), always intersected with authenticated owner/status filters.
	 * @apiSuccess {Object[]} jobs Owner jobs with source groupId ordered by newest creation.
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
	 * @apiBody {Number} [jobId] Explicitly claim only this queued job now, ignoring its schedule. Ownership and account filters still apply.
	 * @apiBody {Number[]} [groupIds] Selected private source groups (maximum 100). Empty claims nothing; absent preserves legacy account-only claims.
	 * @apiBody {Object[]} [routes] Local group/network/account routes (maximum 100). When present these routes are authoritative: bound jobs require the exact group/network/account route; empty routes claim nothing. Only unresolved account jobs may bind once at atomic claim. Authored targets and producer intent digest are preserved.
	 * @apiBody {Number} [routes.groupId] Selected source group.
	 * @apiBody {String} [routes.network] Network, also present in accounts.
	 * @apiBody {String} [routes.localAccountId] Configured account, also present in accounts.
	 * @apiBody {Object} [routes.target] Discord channelId/guildId/sfwChannelId or Telegram chatId/sfwChatId defaults only. SFW alternative is used only when authored sensitive=false and destination is absent.
	 * @apiBody {Object[]} accounts Configured local accounts (maximum 100).
	 * @apiBody {String="threads","instagram","reddit","twitter","rule34xxx","bluesky","discord","telegram"} accounts.network Network.
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
	 * @apiBody {String} [remoteId] Required for posted, maximum 500 characters (supports Bluesky AT URI).
	 * @apiBody {String} [remoteUrl] HTTPS post URL without credentials/query/fragment. Rule34 jobs additionally allow only rule34.xxx/index.php?page=post&s=view&id=remoteId.
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
