import {IGeesomeApp} from '../../interface.js';
import {CorePermissionName} from '../database/interface.js';
import {requireIntegrationScopes} from '../api/integrationScopes.js';
import {ApiProblemError} from '../api/problem.js';
import {publicationClientId} from './destinations.js';
import ISocNetPublishingModule from './interface.js';

export default function registerApi(app: IGeesomeApp, module: ISocNetPublishingModule) {
	const api = Object.fromEntries(['onAuthorizedGet', 'onAuthorizedPost'].map(method => [method, (path, handler) => {
		app.ms.api[method](path.replace('user/social-publications', 'user/local-publications'), handler);
		app.ms.api[method](path, handler);
	}]));
	async function authorizeManagement(req) {
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
		let scopes = req.apiKey?.scopes;
		if (typeof scopes === 'string') {
			try { scopes = JSON.parse(scopes); } catch { scopes = []; }
		}
		if (req.apiKey?.type !== 'password_auth' && !(Array.isArray(scopes) && scopes.includes('publishing:manage'))) {
			throw new ApiProblemError(403, 'insufficient_scope', 'Server publishing management requires an explicit publishing:manage key or owner session');
		}
	}
	/**
	 * @api {post} /v1/user/social-publications/server-destinations Configure a server publication destination
	 * @apiName ServerPublicationDestinationSetup
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Owner-only setup with explicit publishing:manage scope or owner password session. Verifies the provider identity without publication and encrypts credentials using node app-pass. Existing requestKey preserves account identity and source scope. enabled defaults false. No secret appears in response. Same routes are available under legacy /user/local-publications for compatibility.
	 * @apiBody {String} requestKey Stable owner setup key, 1–128 identifier characters.
	 * @apiBody {String="bluesky","discord","telegram"} network Server network.
	 * @apiBody {String} label Display name, 1–200 characters.
	 * @apiBody {Number} [sourceGroupId] Owned private source group, or omitted for global destination.
	 * @apiBody {Object} account Bluesky identifier/appPassword, or Discord/Telegram botToken. Write-only; fixed provider hosts.
	 * @apiBody {String="sfw","nsfw"} [contentPolicy] Content restriction. sfw requires sensitive=false (Rule34 rating=s); nsfw permits both. Omitted/null retains legacy behavior. An explicit policy cannot be cleared by omission.
	 * @apiBody {Object} target One endpoint: Discord channelId/guildId, Telegram chatId, Bluesky empty. Alternate SFW fields only for legacy null-policy setup.
	 * @apiBody {Boolean} [enabled=false] Explicitly enable new tasks and claims.
	 * @apiSuccess {Object} destination Safe registered destination metadata and accountIdentity; never credentials or internal account reference.
	 */
	api.onAuthorizedPost('user/social-publications/server-destinations', async (req, res) => {
		await authorizeManagement(req);
		res.send(await module.setupServerDestination(req.user.id, req.body));
	});
	/**
	 * @api {post} /v1/user/social-publications/:jobId/server-result Resolve a server publication result
	 * @apiName ServerPublicationResult
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Owner-only manual server outcome resolution. Requires explicit publishing:manage or owner session plus original claimToken. Stop/settle original worker and verify provider outcome first. Never sends or requeues.
	 * @apiParam {Number} jobId Owned server job.
	 * @apiBody {String} claimToken Original claim token.
	 * @apiBody {String="posted","failed","needs_review"} status Confirmed outcome.
	 * @apiBody {String} [remoteId] Required for posted.
	 * @apiBody {String} [remoteUrl] Confirmed credential-free provider URL.
	 * @apiBody {String} [error] Bounded safe explanation.
	 * @apiSuccess {Object} job Updated server job.
	 */
	api.onAuthorizedPost('user/social-publications/:jobId/server-result', async (req, res) => {
		await authorizeManagement(req);
		res.send({job: await module.reportResult(req.user.id, req.params.jobId, req.body, 'server')});
	});
	async function authorize(req) {
		requireIntegrationScopes(req.apiKey, ['publishing:local']);
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
	}
	/**
	 * @api {get} /v1/user/social-publications/destinations List publication destinations
	 * @apiName LocalPublicationDestinations
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local and group management. Owner-only safe metadata, never credentials. Client key identity is key:API-key-row-ID. Server destinations expose accountIdentity instead of local client fields; provider secrets and account references remain private.
	 * @apiQuery {Number{1-100}} [limit=20] Page size.
	 * @apiQuery {Number{0-1000000}} [offset=0] Offset.
	 * @apiSuccess {Object[]} destinations Safe rows: id/clientId/localKey/sourceGroupId/localAccountId/network/label/executionMode/target/enabled.
	 */
	api.onAuthorizedGet('user/social-publications/destinations', async (req, res) => {
		await authorize(req);
		res.send(await module.listDestinations(req.user.id, req.query));
	});
	/**
	 * @api {post} /v1/user/social-publications/destinations Register client destinations
	 * @apiName LocalPublicationDestinationRegister
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local, group management and a dedicated non-password-auth API key. Identity derives from the authenticated key, not request data. Omitted rows remain unchanged. Disable removed rows explicitly. Account/network identity cannot be changed under an existing localKey. Repeating a request updates the same stable rows. No credentials accepted.
	 * @apiBody {Object[]} destinations Maximum 100 rows; empty registers the connection identity only.
	 * @apiBody {String} destinations.localKey Stable local route key, 1–200 identifier characters.
	 * @apiBody {Number} [destinations.sourceGroupId] Owned ordinary closed source group; immutable under localKey. Omit for a global manual destination.
	 * @apiBody {String} destinations.localAccountId Local credential reference, 1–200 identifier characters.
	 * @apiBody {String} destinations.network Supported network.
	 * @apiBody {String} destinations.label Display label, 1–200 characters.
	 * @apiBody {String="sfw","nsfw"} [destinations.contentPolicy] Explicit content policy; omitted/null preserves legacy behavior. sfw requires authored sensitive=false, or Rule34 rating=s. Explicit policy cannot be cleared by omission.
	 * @apiBody {Object} destinations.target One endpoint: Discord channelId/guildId, Telegram chatId, Patreon campaignId, Reddit subreddit/flairId/kind; otherwise empty. Alternate SFW fields only for legacy null-policy setup.
	 * @apiBody {Boolean} destinations.enabled Explicit enabled state.
	 * @apiSuccess {String} clientId Authenticated key identity.
	 * @apiSuccess {Object[]} destinations Registered safe rows.
	 */
	api.onAuthorizedPost('user/social-publications/destinations', async (req, res) => {
		await authorize(req);
		res.send(await module.registerDestinations(req.user.id, publicationClientId(req.apiKey), req.body));
	});
	/**
	 * @api {post} /v1/user/social-publications/destinations/:destinationId/disable Retire a publication destination
	 * @apiName LocalPublicationDestinationDisable
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local and group management. Owner-only idempotent retirement, including destinations whose original client key was lost/revoked. Send an empty object. No account rebind, enable or credential transfer. Queued jobs remain blocked and processing results retain original-client authorization.
	 * @apiParam {Number} destinationId Owner destination ID.
	 * @apiSuccess {Object} destination Disabled safe metadata.
	 */
	api.onAuthorizedPost('user/social-publications/destinations/:destinationId/disable', async (req, res) => {
		await authorize(req);
		res.send(await module.disableDestination(req.user.id, req.params.destinationId, req.body));
	});

	/**
	 * @api {post} /v1/user/social-publications/destination-claim Claim a registered destination job
	 * @apiName LocalPublicationDestinationClaim
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local, group management and a dedicated client key. Only this key's enabled destinations can claim. Legacy jobs are excluded. Frozen account and target remain unchanged; no automatic requeue or server fallback.
	 * @apiBody {Number[]} destinationIds Selected destinations, maximum 100 distinct IDs. Empty claims nothing.
	 * @apiBody {Number} [jobId] Explicit owned queued job; bypasses schedule only, not executor checks.
	 * @apiSuccess {Object|null} job Frozen claimed job and original claimToken, or null.
	 */
	api.onAuthorizedPost('user/social-publications/destination-claim', async (req, res) => {
		await authorize(req);
		res.send({job: await module.claimDestinationJob(req.user.id, publicationClientId(req.apiKey), req.body)});
	});

	/**
	 * @api {get} /v1/user/social-publications/sources List private queue source groups
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
	api.onAuthorizedGet('user/social-publications/sources', async (req, res) => {
		await authorize(req);
		res.send(await module.listSources(req.user.id, req.query));
	});
	/**
	 * @api {post} /v1/user/social-publications/sources Create a private queue source group
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
	api.onAuthorizedPost('user/social-publications/sources', async (req, res) => {
		await authorize(req);
		res.send(await module.createSource(req.user.id, req.body));
	});
	/**
	 * @api {post} /v1/user/social-publications/compose Compose and schedule a private outbox post
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
	 * @apiBody {Object} [destinations.target] Each Patreon destination target requires title (1–200 chars), audience (free_members or paid_members), teaserText (nonempty exact prefix of text, maximum 10000 chars) and campaignId (positive decimal, up to 20 digits). Unbound group jobs may defer campaignId to the local route. Prepared Patreon jobs allow up to 20 preview images. No Cookie credentials accepted.
	 * @apiBody {Object[]} destinations New rows use destinationId/network/target and freeze the registered client route. Legacy rows use network/localAccountId/target selections (1–20). With explicit groupId only, omit localAccountId to defer local account selection until claim.
	 * @apiBody {String} [scheduledAt] ISO instant with timezone; omit to send now.
	 * @apiBody {Object} [producer] For one destination only: type=microwave-girls and positive postId. Stored with server-computed canonical original-intent digest, preserved when a claim resolves an unbound account/route; no URL or credential.
	 * @apiBody {String="microwave-girls"} [producer.type] Producer marker when producer is supplied.
	 * @apiBody {String} [producer.digest] Required canonical v4 digest for destinationId jobs; binds destination/client/account/merged target and original content. Checked before write effects.
	 * @apiBody {Number} [producer.postId] Positive owned Girls receipt ID when producer is supplied.
	 * @apiBody {Number} [groupId] Existing owned ordinary closed local channel. Included in replay intent.
	 * @apiBody {Number} [postId] Internal source reference for an unchanged owned outbox draft.
	 * @apiSuccess {Object} group Owned ordinary closed outbox identity.
	 * @apiSuccess {Number} postId Persisted source post.
	 * @apiSuccess {Object[]} jobs Independent scheduled jobs per destination, each including its source groupId. With mediaPolicy, attachments are prepared JPEGs and mediaPreparation contains policy/sourceAttachments/digest. Original producer.digest remains bound to authored originals. Producer jobs include type/postId/digest and composeKey for owner-scoped reconciliation.
	 * @apiError (409) LocalPublicationRequestConflict Compose key already used with different input.
	 * @apiError (409) LocalPublicationDraftChanged Draft text or image selection differs from stored source.
	 */
	api.onAuthorizedPost('user/social-publications/compose', async (req, res) => {
		await authorize(req);
		requireIntegrationScopes(req.apiKey, ['assets:write']);
		res.send(await module.compose(req.user.id, req.body));
	});
	/**
	 * @api {get} /v1/user/social-publications/outbox List unscheduled private outbox sources
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
	 * @apiSuccess {Boolean} capabilities.patreonPublishing Supports explicit Patreon member audience and multi-image preview jobs.
	 * @apiSuccess {Boolean} capabilities.networkQueues Supports network-filtered publication queue pages.
	 * @apiSuccess {Boolean} capabilities.ownedImageReferences Compose accepts owned local Content references without an Asset upload.
	 * @apiSuccess {Object|null} group Existing owned outbox identity, or null before first composition.
	 * @apiSuccess {Object[]} drafts Source postId, text, attachments and creation time.
	 */
	api.onAuthorizedGet('user/social-publications/outbox', async (req, res) => {
		await authorize(req);
		res.send(await module.getOutbox(req.user.id, req.query));
	});
	/**
	 * @api {post} /v1/user/social-publications Schedule local social publication
	 * @apiName LocalPublicationCreate
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local scope and permission to edit a public local post or an owned ordinary closed local channel source. Social credentials stay on the client. Repeated requestKey returns the original snapshot; conflicting input returns 409.
	 * @apiBody {String} requestKey Owner-scoped idempotency key (1–128 identifier characters).
	 * @apiBody {Number} postId Existing public locally authored post.
	 * @apiBody {String="threads","instagram","reddit","twitter","rule34xxx","bluesky","discord","telegram","patreon"} network Destination network.
	 * @apiBody {String} localAccountId Account identifier configured on the local client.
	 * @apiBody {String} scheduledAt ISO 8601 instant with timezone.
	 * @apiBody {Object} [target] Typed targets: Reddit subreddit/title/flairId/kind and optional sensitive boolean; Twitter/Bluesky optional sensitive boolean; Discord channelId plus optional guildId/sensitive boolean; Telegram chatId and optional sensitive boolean; Rule34 required tags/source/rating=s|q|e; Patreon requires title/audience/teaserText/campaignId as documented for compose. No credentials or arbitrary headers.
	 * @apiSuccess {Object} job Frozen scheduled job with text/media payload.
	 * @apiError (409) LocalPublicationRequestConflict Request key was already used with different input.
	 * @apiSuccessExample {json} Scheduled
	 * {"job":{"id":1,"status":"queued","network":"threads","payload":{"text":"Hello","attachments":[]}}}
	 */
	api.onAuthorizedPost('user/social-publications', async (req, res) => {
		await authorize(req);
		res.send({job: await module.createJob(req.user.id, req.body)});
	});
	/**
	 * @api {get} /v1/user/social-publications List local social publications
	 * @apiName LocalPublicationList
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local. Only the authenticated owner's jobs are returned; claim tokens are included for manual resolution. Processing jobs are never automatically requeued.
	 * @apiQuery {Number{1-100}} [limit=20] Page size.
	 * @apiQuery {Number{0-1000000}} [offset=0] Page offset.
	 * @apiQuery {String="threads","instagram","reddit","twitter","rule34xxx","bluesky","discord","telegram","patreon"} [network] Filter a single network before pagination, intersected with owner and source filters.
	 * @apiQuery {Number} [destinationId] Filter a single destination before pagination, intersected with ownership.
	 * @apiQuery {String="queued","processing","posted","failed","needs_review","cancelled"} [status] Filter.
	 * @apiQuery {String} [groupIds] Comma-separated distinct positive group IDs (maximum 100), intersected with owner filters. Empty selects no jobs.
	 * @apiQuery {String} [composeKey] Exact owner-scoped compose key (1–128 identifier characters) for read-only lost-response recovery.
	 * @apiQuery {String} [ids] Comma-separated distinct positive job IDs (1–100), always intersected with authenticated owner/status filters.
	 * @apiSuccess {Object[]} jobs Owner jobs with source groupId ordered by newest creation.
	 */
	api.onAuthorizedGet('user/social-publications', async (req, res) => {
		await authorize(req);
		res.send({jobs: await module.listJobs(req.user.id, req.query)});
	});
	/**
	 * @api {post} /v1/user/social-publications/claim Claim one due local publication
	 * @apiName LocalPublicationClaim
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local. Atomically claims one eligible owner job using node time, rechecking source permissions. Account filters do not grant permissions. Registered destination jobs are always excluded; use destination-claim. No lease expiry or automatic resend.
	 * @apiBody {Number} [jobId] Explicitly claim only this queued job now, ignoring its schedule. Ownership and account filters still apply.
	 * @apiBody {Number[]} [groupIds] Selected private source groups (maximum 100). Empty claims nothing; absent preserves legacy account-only claims.
	 * @apiBody {Object[]} [routes] Local group/network/account routes (maximum 100). When present these routes are authoritative: bound jobs require the exact group/network/account route; empty routes claim nothing. Only unresolved account jobs may bind once at atomic claim. Authored targets and producer intent digest are preserved.
	 * @apiBody {Number} [routes.groupId] Selected source group.
	 * @apiBody {String} [routes.network] Network, also present in accounts.
	 * @apiBody {String} [routes.localAccountId] Configured account, also present in accounts.
	 * @apiBody {Object} [routes.target] Discord channelId/guildId/sfwChannelId, Telegram chatId/sfwChatId or Patreon campaignId defaults only. SFW alternative is used only when authored sensitive=false and destination is absent.
	 * @apiBody {Object[]} accounts Configured local accounts (maximum 100).
	 * @apiBody {String="threads","instagram","reddit","twitter","rule34xxx","bluesky","discord","telegram","patreon"} accounts.network Network.
	 * @apiBody {String} accounts.localAccountId Local account identifier.
	 * @apiSuccess {Object|null} job Claimed job with claimToken or null when none is due.
	 */
	api.onAuthorizedPost('user/social-publications/claim', async (req, res) => {
		await authorize(req);
		res.send({job: await module.claimJob(req.user.id, req.body)});
	});
	/**
	 * @api {post} /v1/user/social-publications/:jobId/result Report local publication result
	 * @apiName LocalPublicationResult
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local, ownership and original claim token. Destination jobs additionally require the original client key; disabled destinations still accept original results. Identical result reports are idempotent. Processing or needs_review jobs allow confirmed manual resolution; terminal conflicting reports return 409.
	 * @apiParam {Number} jobId Owner job ID.
	 * @apiBody {String} claimToken Original claim token.
	 * @apiBody {String="posted","failed","needs_review"} status Result.
	 * @apiBody {String} [remoteId] Required for posted, maximum 500 characters (supports Bluesky AT URI).
	 * @apiBody {String} [remoteUrl] HTTPS post URL without credentials/query/fragment. Rule34 jobs additionally allow only rule34.xxx/index.php?page=post&s=view&id=remoteId.
	 * @apiBody {String} [error] Sanitized error, maximum 500 characters; no secrets.
	 * @apiSuccess {Object} job Updated job.
	 * @apiError (409) LocalPublicationResultConflict Conflicting terminal result or invalid claim token.
	 */
	api.onAuthorizedPost('user/social-publications/:jobId/result', async (req, res) => {
		await authorize(req);
		res.send({job: await module.reportResult(req.user.id, req.params.jobId, req.body, req.apiKey?.id && req.apiKey.type !== 'password_auth' ? `key:${req.apiKey.id}` : null)});
	});
	/**
	 * @api {post} /v1/user/social-publications/:jobId/cancel Cancel queued local publication
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
	api.onAuthorizedPost('user/social-publications/:jobId/cancel', async (req, res) => {
		await authorize(req);
		res.send({job: await module.cancelJob(req.user.id, req.params.jobId)});
	});
}
