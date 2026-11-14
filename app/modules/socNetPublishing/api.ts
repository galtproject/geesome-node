import {acceptStorageRequest} from '../asyncOperation/requests.js';
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
	 * @api {post} /v1/user/social-publications/deviantart/oauth/start Start DeviantArt account authorization
	 * @apiName DeviantArtOAuthStart
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Owner management authorization required. Creates an encrypted, owner-bound ten-minute PKCE flow. No provider publication occurs. Callback URI is fixed by server configuration; client-provided callback URLs are rejected.
	 * @apiBody {String} requestKey Stable destination setup key.
	 * @apiBody {String} label Destination label (1–200 characters).
	 * @apiBody {Number} [sourceGroupId] Owned private source group.
	 * @apiBody {String="sfw","nsfw"} contentPolicy Explicit content restriction.
	 * @apiBody {Boolean} [enabled=false] Enable new jobs after successful consent.
	 * @apiBody {String} clientId Confidential OAuth application ID.
	 * @apiBody {String} clientSecret Write-only OAuth application secret.
	 * @apiSuccess {String} flowId Opaque owner-scoped status identifier.
	 * @apiSuccess {String} authorizationUrl Open in a separate browser window.
	 * @apiSuccess {String} expiresAt Expiration instant.
	 * @apiSuccess {String} redirectUri Exact server-configured whitelist entry.
	 */
	api.onAuthorizedPost('user/social-publications/deviantart/oauth/start', async (req, res) => {
		await authorizeManagement(req);
		res.setHeader('Cache-Control', 'no-store');
		res.send(await module.startDeviantArtOAuth(req.user.id, req.body));
	});
	/**
	 * @api {get} /v1/user/social-publications/deviantart/oauth/callback Complete DeviantArt consent
	 * @apiName DeviantArtOAuthCallback
	 * @apiGroup LocalPublications
	 * @apiUse ValidationErrors
	 * @apiDescription Public provider return route. A random single-use state binds the pending owner and PKCE verifier; no browser login or API key is required here. Fixed text HTML never contains tokens, provider errors or redirects. Consent denial consumes the state. Callback replay never repeats token exchange or destination setup.
	 * @apiQuery {String} state Opaque pending-flow state.
	 * @apiQuery {String} [code] Provider authorization code.
	 * @apiQuery {String} [error] Consent denial indicator (never reflected).
	 * @apiSuccess {String} html Generic completion page; poll the authorized status route for results.
	 */
	app.ms.api.onGet('user/social-publications/deviantart/oauth/callback', async (req, res) => {
		res.setHeader('Cache-Control', 'no-store');
		res.setHeader('Referrer-Policy', 'no-referrer');
		res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		let connected = false;
		try {
			const rawQuery = req.stream?.url?.split('?')[1];
			if (rawQuery) {
				const params = new URLSearchParams(rawQuery);
				if (['state', 'code', 'error'].some(key => params.getAll(key).length > 1)) {
					throw new Error('duplicate_callback_parameter');
				}
			}
			connected = (await module.completeDeviantArtOAuth(req.query)).status === 'connected';
		} catch {
			// Never reflect the provider code, state, or request details in callback output.
		}
		res.send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DeviantArt connection</title><body><h1>${connected ? 'DeviantArt connected' : 'Connection not completed'}</h1><p>Return to your client to check the connection. You can close this window.</p></body></html>`);
	});
	/**
	 * @api {get} /v1/user/social-publications/deviantart/oauth/:flowId Read DeviantArt connection status
	 * @apiName DeviantArtOAuthStatus
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Same owner management authorization as start. Returns only safe status/destination metadata. Foreign or unknown identifiers return 404; expires after ten minutes. No credentials are returned.
	 * @apiParam {String} flowId Opaque identifier from start.
	 * @apiSuccess {String="pending","processing","connected","failed","expired"} status Current flow state.
	 * @apiSuccess {String} flowId Opaque identifier.
	 * @apiSuccess {String} expiresAt Flow expiration.
	 * @apiSuccess {Object} [destination] Connected safe destination.
	 * @apiSuccess {String} [error] Generic error identifier.
	 */
	api.onAuthorizedGet('user/social-publications/deviantart/oauth/:flowId', async (req, res) => {
		await authorizeManagement(req);
		res.setHeader('Cache-Control', 'no-store');
		res.send(await module.getDeviantArtOAuth(req.user.id, req.params.flowId));
	});
	/**
	 * @api {post} /v1/user/social-publications/server-destinations Configure a server publication destination
	 * @apiName ServerPublicationDestinationSetup
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Owner-only setup with explicit publishing:manage scope or owner password session. Verifies the provider identity without publication and encrypts credentials using node app-pass. Existing requestKey preserves account identity and source scope. enabled defaults false. No secret appears in response. Same routes are available under legacy /user/local-publications for compatibility.
	 * @apiBody {String} requestKey Stable owner setup key, 1–128 identifier characters.
	 * @apiBody {String="bluesky","discord","telegram","deviantart"} network Server network.
	 * @apiBody {String} label Display name, 1–200 characters.
	 * @apiBody {Number} [sourceGroupId] Owned private source group, or omitted for global destination.
	 * @apiBody {Object} account Bluesky identifier/appPassword, Discord/Telegram botToken, or DeviantArt accessToken/clientId/clientSecret/refreshToken (confidential OAuth application, scopes basic user stash publish). First DeviantArt connection requires a current accessToken; stored accounts refresh automatically. Write-only; fixed provider hosts.
	 * @apiBody {String="sfw","nsfw"} contentPolicy Content restriction. sfw accepts only contentType=sfw; nsfw accepts both. Required explicitly.
	 * @apiBody {Object} target One endpoint: Discord channelId/guildId, Telegram chatId, Bluesky/DeviantArt empty. Alternate SFW fields are rejected; configure separate destinations.
	 * @apiBody {Boolean} [enabled=false] Explicitly enable new tasks and claims.
	 * @apiSuccess {Object} destination Safe registered destination metadata and accountIdentity; never credentials or internal account reference.
	 */
	api.onAuthorizedPost('user/social-publications/server-destinations', async (req, res) => {
		await authorizeManagement(req);
		res.send(await module.setupServerDestination(req.user.id, req.body));
	});
	/**
	 * @api {post} /v1/user/social-publications/server-destinations/:destinationId/settings Reverify server destination settings
	 * @apiName ServerPublicationDestinationSettings
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Owner session or publishing:manage plus publishing:local required. Reuses encrypted credentials internally and verifies the existing provider identity/endpoint without posting. Changes only enabled/contentPolicy, preserves source/account/target/jobs. Stale snapshots return 409. Legacy namespace alias shares authorization.
	 * @apiParam {Number} destinationId Owned server destination.
	 * @apiBody {Object} expected Exact safe destination from catalog, used for conflict checking.
	 * @apiBody {Boolean} enabled Explicit activation state.
	 * @apiBody {String="sfw","nsfw"} contentPolicy Explicit content policy.
	 * @apiSuccess {Object} destination Safe destination metadata; no credentials.
	 */
	api.onAuthorizedPost('user/social-publications/server-destinations/:destinationId/settings', async (req, res) => {
		await authorizeManagement(req);
		res.send(await module.updateServerDestinationSettings(req.user.id, req.params.destinationId, req.body));
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
	 * @apiSuccess {String} [job.confirmedAt] First accepted posted acknowledgement timestamp, stable on replay.
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
	 * @api {get} /v1/user/social-publications/destination-groups List publication destination groups
	 * @apiName PublicationDestinationGroups
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Owner-scoped non-credential metadata. Requires publishing:local and group management. Members are ordered destination IDs, including repeated networks; no nested groups or credentials. Disabled members remain visible and must never be silently skipped by producers. Legacy namespace aliases share the handler.
	 * @apiQuery {Number{1-100}} [limit=20] Page size.
	 * @apiQuery {Number{0-1000000}} [offset=0] Offset.
	 * @apiSuccess {Object[]} groups Safe id/label/destinationIds/revision/enabled rows.
	 */
	api.onAuthorizedGet('user/social-publications/destination-groups', async (req, res) => {
		await authorize(req);
		res.send(await module.listDestinationGroups(req.user.id, req.query));
	});
	/**
	 * @api {post} /v1/user/social-publications/destination-groups Create a publication destination group
	 * @apiName PublicationDestinationGroupCreate
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local and group management. Every member must belong to the authenticated owner. This only stores selection metadata, never credentials or jobs. A repeated creation key returns the same group without resetting later edits; conflicting creation data returns 409.
	 * @apiBody {String} requestKey Owner idempotency key, 1–128 identifier characters.
	 * @apiBody {String} label Display label, 1–200 characters.
	 * @apiBody {Number[]} destinationIds Ordered 1–20 distinct owned destination IDs. Repeated networks are permitted.
	 * @apiBody {Boolean} enabled Whether new intents may select the group.
	 * @apiSuccess {Object} group Safe group, revision 1 on creation.
	 */
	api.onAuthorizedPost('user/social-publications/destination-groups', async (req, res) => {
		await authorize(req);
		res.send(await module.createDestinationGroup(req.user.id, req.body));
	});
	/**
	 * @api {post} /v1/user/social-publications/destination-groups/:groupId Update a publication destination group
	 * @apiName PublicationDestinationGroupUpdate
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local and group management. Compare revision before replacement; a stale edit returns 409. An exact lost-response replay of the last update succeeds. Set enabled=false to retire a group without deleting history. Accepted/frozen delivery intents retain their original destination snapshots after edits.
	 * @apiParam {Number} groupId Owned publication destination group ID, distinct from a private source channel ID.
	 * @apiBody {Number} revision Current revision from the catalog.
	 * @apiBody {String} label Display label, 1–200 characters.
	 * @apiBody {Number[]} destinationIds Ordered 1–20 distinct owned destination IDs.
	 * @apiBody {Boolean} enabled Explicit selection state.
	 * @apiSuccess {Object} group Safe updated group and revision.
	 */
	api.onAuthorizedPost('user/social-publications/destination-groups/:groupId', async (req, res) => {
		await authorize(req);
		res.send(await module.updateDestinationGroup(req.user.id, req.params.groupId, req.body));
	});
	/**
	 * @api {get} /v1/user/social-publications/destinations List publication destinations
	 * @apiName LocalPublicationDestinations
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local and group management. Owner-only safe metadata, never credentials. Client key identity is key:API-key-row-ID. Server destinations expose accountIdentity instead of local client fields; native geesome destinations expose executionMode native and target.groupId without account/client fields. Provider secrets and account references remain private.
	 * @apiQuery {Number{1-100}} [limit=20] Page size.
	 * @apiQuery {Number{0-1000000}} [offset=0] Offset.
	 * @apiSuccess {Object[]} destinations Safe rows: id/clientId/localKey/sourceGroupId/localAccountId/network/label/executionMode/target/enabled/defaultDelayMinutes. Null interval uses the producer fallback.
	 */
	api.onAuthorizedGet('user/social-publications/destinations', async (req, res) => {
		await authorize(req);
		res.send(await module.listDestinations(req.user.id, req.query));
	});
	/**
	 * @api {post} /v1/user/social-publications/destinations/:destinationId/schedule-settings Set destination posting interval
	 * @apiName PublicationDestinationSchedule
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local and group management. Owner-scoped for client, server and native destinations. A stale expected value returns 409; exact retries succeed. Registration preserves this setting. Existing jobs keep their accepted schedule.
	 * @apiParam {Number} destinationId Owned destination ID.
	 * @apiBody {Number} defaultDelayMinutes One of 10,30,60,120,240,480,720 or null to use the producer fallback.
	 * @apiBody {Number} expectedDefaultDelayMinutes Last catalog value, including null.
	 * @apiSuccess {Object} destination Safe metadata including nullable defaultDelayMinutes.
	 */
	api.onAuthorizedPost('user/social-publications/destinations/:destinationId/schedule-settings', async (req, res) => {
		await authorize(req);
		res.send(await module.updateDestinationSchedule(req.user.id, req.params.destinationId, req.body));
	});
	/**
	 * @api {post} /v1/user/social-publications/destinations Register publication destinations
	 * @apiName LocalPublicationDestinationRegister
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local, group management and a dedicated non-password-auth API key. Identity derives from the authenticated key, not request data. Omitted rows remain unchanged. Disable removed rows explicitly. Account/network identity cannot be changed under an existing localKey. Repeating a request updates the same stable rows. No credentials accepted. Native Site Group registration uses localKey site-group, network geesome, executionMode native (optional/inferred), target {groupId: owned-public-group-ID}, contentPolicy nsfw, label Site Group and no localAccountId. It reuses one owner destination across API keys. The target and source-group binding are immutable; adding its destination ID to both named publication groups uses the existing group APIs. Native jobs execute inside the Node worker without credentials and are never claimable/reportable by desktop clients.
	 * @apiBody {Object[]} destinations Maximum 100 rows; empty registers the connection identity only.
	 * @apiBody {String} destinations.localKey Stable local route key, 1–200 identifier characters.
	 * @apiBody {Number} [destinations.sourceGroupId] Owned ordinary closed source group; immutable under localKey. Omit for a global manual destination.
	 * @apiBody {String} [destinations.localAccountId] Required for client delivery; omit for native Site Group. Local credential reference, 1–200 identifier characters.
	 * @apiBody {String} destinations.network Supported network, including geesome for native Site Group.
	 * @apiBody {String="client","native"} [destinations.executionMode] Inferred from network; native only for geesome.
	 * @apiBody {String} destinations.label Display label, 1–200 characters.
	 * @apiBody {String="sfw","nsfw"} destinations.contentPolicy Required explicit destination policy; sfw accepts only contentType=sfw.
	 * @apiBody {Object} destinations.target One endpoint: Discord channelId/guildId, Telegram chatId, Patreon campaignId, Reddit subreddit/flairId/kind, native geesome numeric groupId; otherwise empty. Alternate SFW fields are rejected; configure separate destinations.
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
	 * @apiBody {Number=6} intentVersion Required executor protocol handshake; older or missing versions receive publication_upgrade_required before claim.
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
	 * @api {post} /v1/user/social-publications/queue-shuffle Shuffle future destination queues
	 * @apiName ShuffleSocialPublicationQueue
	 * @apiGroup SocialPublishing
	 * @apiHeader {String} Authorization Bearer owner token with publishing:local scope
	 * @apiBody {String} requestKey Stable idempotency key, retained after lost replies
	 * @apiBody {Number} groupId Owned private source group
	 * @apiBody {Number[]} destinationIds 1–20 distinct owned enabled destination IDs
	 * @apiDescription Independently permutes future queued v6 jobs per destination in the private source group. Preserves scheduled slots, payloads and routing. Due, processing, finished, deleted-source and foreign jobs are excluded. At most 10000 jobs; larger queues fail without changes. Retries return the original result without reshuffling. Legacy /user/local-publications alias uses identical authorization.
	 * @apiSuccess {String} requestKey Original request key
	 * @apiSuccess {Object[]} destinations Per-destination queuedJobs and changedJobs counts
	 * @apiError (400) publication_queue_shuffle_invalid Invalid request
	 * @apiError (403) publication_queue_shuffle_source_forbidden Source is not an owned private queue
	 * @apiError (403) publication_queue_shuffle_destination_forbidden Destination is foreign, disabled or bound to another source
	 * @apiError (409) publication_queue_shuffle_conflict Key already belongs to another request
	 * @apiError (409) publication_queue_shuffle_too_large More than 10000 eligible jobs
	 * @apiSuccessExample {json} Success
	 * {"requestKey":"shuffle-week-1","destinations":[{"destinationId":1,"queuedJobs":5,"changedJobs":4}]}
	 */
	api.onAuthorizedPost('user/social-publications/queue-shuffle', async (req, res) => {
		await authorize(req);
		res.send(await module.shuffleQueue(req.user.id, req.body));
	});
	/**
	 * @api {post} /v1/user/social-publications/compose Compose and schedule a private outbox post
	 * @apiName LocalPublicationCompose
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Requires publishing:local and assets:write. Creates a native ordinary closed owner outbox lazily, or uses an explicitly chosen owned ordinary closed channel. Source post and all destination jobs commit atomically before provider calls. Omitted schedule means now on first creation; identical request retries return the same source/jobs. Existing draft edits are rejected explicitly. No social credentials accepted. Image references resolve owned Assets or local, non-deleted, non-remote, unencrypted Content. Check outbox capabilities.ownedImageReferences before using Content-only references with older nodes.
	 * @apiBody {String="sfw","nsfw"} contentType Canonical classification frozen on every job; absent or old target classification is rejected.
	 * @apiBody {String="social-images-v1"} [mediaPolicy] Prepare provider-ready JPEG images before source/job acceptance. Original refs stay in the private source post; per-job payload.mediaPreparation binds original refs and prepared refs. Omit for exact legacy behavior.
	 * @apiBody {Boolean} [async=false] Return durable 202 receipt; poll /user/social-publications/operations/:operationId.
	 * @apiSuccess {Number} [operationId] Existing owner-scoped operation queue id for async=true.
	 * @apiBody {String} requestKey Owner-scoped compose idempotency key.
	 * @apiBody {String} text New text (maximum 40000 characters).
	 * @apiBody {String[]} imageStorageIds Owned Asset or local Content storage IDs (maximum 20).
	 * @apiBody {Object} [sourceImageSet] Optional source collection reference, supported only for native geesome destinations. Requires capabilities.sourceImageSetLinks. Frozen into payload and producer digest; no gallery URL is accepted.
	 * @apiBody {Number} sourceImageSet.groupId Owned private membership parent group ID.
	 * @apiBody {Number} sourceImageSet.postId Published visible native membership post ID in that group.
	 * @apiBody {Object} [destinations.target] DeviantArt requires a server destinationId, exactly one JPEG/PNG image, title (1–50 Unicode characters), explicit Boolean isAiGenerated, optional tags (maximum 30 unique ASCII letter/number/underscore tags, 1–64 characters each) and optional Boolean noAi (defaults true). Check capabilities.deviantartPublishing before offering this provider. Each Patreon destination target requires title (1–200 chars), audience (free_members or paid_members), teaserText (nonempty exact prefix of text, maximum 10000 chars) and campaignId (positive decimal, up to 20 digits). Unbound group jobs may defer campaignId to the local route. Prepared Patreon jobs allow up to 20 preview images. No Cookie credentials accepted.
	 * @apiBody {Object[]} destinations New rows use destinationId/network/target and freeze the registered client route. Legacy rows use network/localAccountId/target selections (1–20). With explicit groupId only, omit localAccountId to defer local account selection until claim.
	 * @apiBody {String} [scheduledAt] ISO instant with timezone; omit to send now.
	 * @apiBody {Object} [producer] For one destination only: type=microwave-girls and positive postId. Stored with server-computed canonical original-intent digest, preserved when a claim resolves an unbound account/route; no URL or credential.
	 * @apiBody {String="microwave-girls"} [producer.type] Producer marker when producer is supplied.
	 * @apiBody {String} [producer.digest] Required canonical v6 digest for destinationId jobs; binds contentType, execution mode, identity, merged target and original content. Checked before write effects.
	 * @apiBody {Number} [producer.postId] Positive owned Girls receipt ID when producer is supplied.
	 * @apiBody {Number} [groupId] Existing owned ordinary closed local channel. Included in replay intent.
	 * @apiBody {Number} [postId] Internal source reference for an unchanged owned outbox draft.
	 * @apiSuccess {Object} group Owned ordinary closed outbox identity.
	 * @apiSuccess {Number} postId Persisted source post.
	 * @apiSuccess {Object[]} jobs Independent scheduled jobs per destination, each including its source groupId. With mediaPolicy, attachments are prepared JPEGs and mediaPreparation contains policy/sourceAttachments/digest. Original producer.digest remains bound to authored originals. Producer jobs include type/postId/digest and composeKey for owner-scoped reconciliation.
	 * @apiError (409) PublicationUpgradeRequired Pre-upgrade intent must be reconciled by saved IDs/keys; no automatic replacement.
	 * @apiError (409) LocalPublicationRequestConflict Compose key already used with different input.
	 * @apiError (409) LocalPublicationDraftChanged Draft text or image selection differs from stored source.
	 */
	api.onAuthorizedPost('user/social-publications/compose', async (req, res) => {
		await authorize(req);
		requireIntegrationScopes(req.apiKey, ['assets:write']);
		if (req.body.async !== undefined && typeof req.body.async !== 'boolean') {
			throw new ApiProblemError(400, 'async_request_invalid', 'async must be a boolean');
		}
		const {async: asynchronous, ...input} = req.body;
		if (asynchronous) {
			module.validateComposeRequest(input);
			const existing=await module.asyncRequests.peek(String(req.user.id),input.requestKey,input);
			if (existing && existing.status!=='failed') {
				res.send(existing,202);
				return;
			}
			const destinations=await module.prepareAsyncCompose(req.user.id,input);
			res.send(await acceptStorageRequest(app, module.asyncRequests, req.user.id, input.requestKey, input, req.apiKey.id, input.imageStorageIds, {destinations}), 202);
			return;
		}
		res.send(await module.compose(req.user.id, input));
	});
	/**
	 * @api {get} /v1/user/social-publications/operations/:operationId Read asynchronous composition status
	 * @apiName PublicationComposeOperation
	 * @apiGroup LocalPublications
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiDescription Owner-scoped read only receipt. Requires publishing:local and assets:write; never replays failed work. Legacy local-publications alias is identical.
	 * @apiParam {Number} operationId Native operation queue id.
	 * @apiSuccess {String} status queued, processing, completed or failed.
	 * @apiSuccess {Object} [result] Original compose result containing jobs on completion.
	 * @apiSuccess {String} [errorCode] Safe failure code.
	 */
	api.onAuthorizedGet('user/social-publications/operations/:operationId', async (req, res) => {
		await authorize(req);
		requireIntegrationScopes(req.apiKey, ['assets:write']);
		res.setHeader('Cache-Control', 'no-store');
		res.send(await module.asyncRequests.get(String(req.user.id), req.params.operationId));
	}, {storageReadOnly: true});

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
	 * @apiSuccess {Boolean} capabilities.nativeGroupPublishing Supports native geesome destinations targeting one owned public group, without social credentials.
	 * @apiSuccess {Boolean} capabilities.sourceImageSetLinks Supports frozen sourceImageSet references and same-site Feed collection links.
	 * @apiSuccess {Boolean} capabilities.publicationDestinationGroups Owner-scoped named destination groups with revision-checked metadata updates.
	 * @apiSuccess {Boolean} capabilities.contentTypePublishing Requires contentType and uses digest v6.
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
	 * @apiBody {String="sfw","nsfw"} contentType Canonical classification frozen on every job; absent or old target classification is rejected.
	 * @apiBody {String} requestKey Owner-scoped idempotency key (1–128 identifier characters).
	 * @apiBody {Number} postId Existing public locally authored post.
	 * @apiBody {String="threads","instagram","reddit","twitter","rule34xxx","bluesky","discord","telegram","patreon"} network Destination network.
	 * @apiBody {String} localAccountId Account identifier configured on the local client.
	 * @apiBody {String} scheduledAt ISO 8601 instant with timezone.
	 * @apiBody {Object} [target] Typed targets: Reddit subreddit/title/flairId/kind; Twitter/Bluesky empty object; Discord channelId plus optional guildId; Telegram chatId; Rule34 required tags/source; Patreon requires title/audience/teaserText/campaignId as documented for compose. No credentials or arbitrary headers.
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
	 * @apiQuery {String="threads","instagram","reddit","twitter","rule34xxx","bluesky","discord","telegram","patreon","deviantart"} [network] Filter a single network before pagination, intersected with owner and source filters.
	 * @apiQuery {Number} [destinationId] Filter a single destination before pagination, intersected with ownership.
	 * @apiQuery {String="queued","processing","posted","failed","needs_review","cancelled"} [status] Filter.
	 * @apiQuery {String} [groupIds] Comma-separated distinct positive group IDs (maximum 100), intersected with owner filters. Empty selects no jobs.
	 * @apiQuery {String} [composeKey] Exact owner-scoped compose key (1–128 identifier characters) for read-only lost-response recovery.
	 * @apiQuery {String} [ids] Comma-separated distinct positive job IDs (1–100), always intersected with authenticated owner/status filters.
	 * @apiQuery {String="queue","history"} [view] Queue: queued/processing/failed/needs_review by scheduledAt/id ascending. History: posted/cancelled by updatedAt/id descending. Applied before pagination and intersected with all filters; overrides order.
	 * @apiQuery {String="queue"} [order] Sending order before pagination; omitted preserves newest-created order.
	 * @apiSuccess {Object[]} jobs Owner jobs with source groupId; newest creation by default. With order=queue, queued jobs first by scheduledAt/id ascending, then other statuses by scheduledAt/id descending.
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
	 * @apiBody {Number=6} intentVersion Required executor protocol handshake; older or missing versions receive publication_upgrade_required before claim.
	 * @apiBody {Number} [jobId] Explicitly claim only this queued job now, ignoring its schedule. Ownership and account filters still apply.
	 * @apiBody {Number[]} [groupIds] Selected private source groups (maximum 100). Empty claims nothing; absent preserves legacy account-only claims.
	 * @apiBody {Object[]} [routes] Local group/network/account routes (maximum 100). When present these routes are authoritative: bound jobs require the exact group/network/account route; empty routes claim nothing. Only unresolved account jobs may bind once at atomic claim. Authored targets and producer intent digest are preserved.
	 * @apiBody {Number} [routes.groupId] Selected source group.
	 * @apiBody {String} [routes.network] Network, also present in accounts.
	 * @apiBody {String} [routes.localAccountId] Configured account, also present in accounts.
	 * @apiBody {Object} [routes.target] Discord channelId/guildId, Telegram chatId or Patreon campaignId defaults only. One endpoint per route.
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
	 * @apiSuccess {String} [job.confirmedAt] First accepted posted acknowledgement timestamp, stable on replay.
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
