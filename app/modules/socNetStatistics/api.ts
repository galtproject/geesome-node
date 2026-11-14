import {CorePermissionName} from '../database/interface.js';
import {ApiProblemError} from '../api/problem.js';
import {getApiKeyScopes, requireIntegrationScopes} from '../api/integrationScopes.js';
import {publicationClientId} from '../socNetPublishing/destinations.js';

export default function registerApi(app, module) {
	async function authorize(req) {
		requireIntegrationScopes(req.apiKey, ['publishing:local']);
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
	}
	async function authorizeManagement(req) {
		await authorize(req);
		if (req.apiKey?.type !== 'password_auth' && !getApiKeyScopes(req.apiKey).includes('publishing:manage')) {
			throw new ApiProblemError(403, 'insufficient_scope', 'An explicit publishing:manage key is required');
		}
		if (!Number.isSafeInteger(Number(req.apiKey?.id)) || Number(req.apiKey.id) < 1) {
			throw new ApiProblemError(403, 'telegram_login_key_required', 'A dedicated authenticated key is required');
		}
	}
	/**
	 * @api {get} /v1/user/social-statistics/telegram-accounts List Telegram statistics readers
	 * @apiName TelegramStatisticsAccounts
	 * @apiGroup SocialStatistics
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription publishing:local and group management; only safe owned user-account descriptors and Telegram destinations. Never credentials, phone codes or sessions.
	 * @apiQuery {Number} [offset=0] Destination page offset, up to 1000000.
	 * @apiSuccess {Object[]} accounts Safe id, label and ready flag. Encrypted client-only sessions cannot be server readers.
	 * @apiSuccess {Object[]} destinations Safe id/label/chatId and selected reader accountId.
	 * @apiSuccess {Number} nextOffset Next destination offset or null.
	 */
	app.ms.api.onAuthorizedGet('user/social-statistics/telegram-accounts', async (req, res) => {
		await authorize(req);
		res.send(await module.telegramSettings(req.user.id, req.query));
	});
	/**
	 * @api {post} /v1/user/social-statistics/telegram-login/start Request Telegram user login code
	 * @apiName TelegramStatisticsLoginStart
	 * @apiGroup SocialStatistics
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Explicit publishing:manage (or owner password session), publishing:local and group management. Reuses telegramClient phone login. Pending session and API hash stay on Node, expire after ten minutes and bind to owner/key; no existing account is replaced before successful authorization.
	 * @apiBody {Number} apiId Telegram application API ID.
	 * @apiBody {String} apiKey Telegram application API hash, 32 hex characters.
	 * @apiBody {String} phoneNumber International E.164 phone number.
	 * @apiSuccess {String} challengeId Opaque continuation ID, not a Telegram session.
	 * @apiSuccess {String} stage code.
	 * @apiSuccess {String} expiresAt UTC expiration.
	 */
	app.ms.api.onAuthorizedPost('user/social-statistics/telegram-login/start', async (req, res) => {
		await authorizeManagement(req);
		res.send(await app.ms.telegramClient.startStatisticsLogin(req.user.id, `key:${req.apiKey.id}`, req.body));
	});
	/**
	 * @api {post} /v1/user/social-statistics/telegram-login/complete Complete Telegram login step
	 * @apiName TelegramStatisticsLoginComplete
	 * @apiGroup SocialStatistics
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Same owner/key and management scope as start. Up to five correction attempts, one in-flight continuation. Success consumes challenge. Never returns or stores the code/2FA password in Client. Bot publication credentials are unaffected.
	 * @apiBody {String} challengeId Opaque unexpired challenge.
	 * @apiBody {String} [code] Telegram code for the code stage.
	 * @apiBody {String} [password] Two-step verification password for password stage only.
	 * @apiSuccess {String="password","connected"} stage Next stage.
	 * @apiSuccess {Object} [account] Safe saved account descriptor on success.
	 */
	app.ms.api.onAuthorizedPost('user/social-statistics/telegram-login/complete', async (req, res) => {
		await authorizeManagement(req);
		res.send(await app.ms.telegramClient.completeStatisticsLogin(req.user.id, `key:${req.apiKey.id}`, req.body));
	});
	/**
	 * @api {post} /v1/user/social-statistics/telegram-login/cancel Cancel pending Telegram login
	 * @apiName TelegramStatisticsLoginCancel
	 * @apiGroup SocialStatistics
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Drops this owner/key's pending in-memory challenge. Never logs out or deletes an already connected account.
	 * @apiBody {String} challengeId Opaque continuation ID.
	 * @apiSuccess {Boolean} cancelled true.
	 */
	app.ms.api.onAuthorizedPost('user/social-statistics/telegram-login/cancel', async (req, res) => {
		await authorizeManagement(req);
		if (!req.body || Object.keys(req.body).some(key => key !== 'challengeId') || !/^[a-f0-9]{48}$/.test(req.body.challengeId || '')) {
			throw new ApiProblemError(400, 'telegram_login_input_invalid', 'Invalid challenge');
		}
		res.send(app.ms.telegramClient.cancelStatisticsLogin(req.user.id, `key:${req.apiKey.id}`, req.body.challengeId));
	});
	/**
	 * @api {post} /v1/user/social-statistics/destinations/:destinationId/telegram-account Select Telegram statistics user account
	 * @apiName TelegramStatisticsReaderSelect
	 * @apiGroup SocialStatistics
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Explicit publishing:manage or owner session plus publishing:local/group management. Both destination and usable user session must belong to owner. Statistics only; never modifies bot credentials, frozen intent or sends.
	 * @apiParam {Number} destinationId Owned Telegram publication destination.
	 * @apiBody {Number} accountId Owned Node user account ID; null to disconnect reader.
	 * @apiSuccess {Number} destinationId Updated destination.
	 * @apiSuccess {Number} accountId Selected reader or null.
	 */
	app.ms.api.onAuthorizedPost('user/social-statistics/destinations/:destinationId/telegram-account', async (req, res) => {
		await authorizeManagement(req);
		res.send(await module.bindTelegramReader(req.user.id, req.params.destinationId, req.body));
	});
	/**
	 * @api {get} /v1/user/social-statistics Read social statistics summary
	 * @apiName SocialStatisticsSummary
	 * @apiGroup SocialStatistics
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Owner-only, publishing:local and group management. Reading does not contact providers. Null means unavailable. Follower delta is net change from the previous available UTC-day snapshot, not gross follows. No credentials returned.
	 * @apiQuery {Number} [groupId] Private source group filter.
	 * @apiQuery {String} [network] Social network filter.
	 * @apiQuery {Number{1-50}} [limit=20] Posted receipt page size.
	 * @apiQuery {Number{0-1000000}} [offset=0] Posted receipt offset.
	 * @apiQuery {Number{0-1000000}} [destinationOffset=0] Destination offset, page size 50.
	 * @apiSuccess {Object[]} posts Posted receipts with caption, source group, provider identity and latest statistics.
	 * @apiSuccess {Object[]} groups Enabled destination metadata with latest audience metrics, typed audience scope, and publicationCounts (last24Hours, last7Days, asOf). Counts are distinct confirmed remote IDs per destination, independent of receipt pagination.
	 * @apiSuccess {Number} nextOffset Next receipt offset or null.
	 * @apiSuccess {Number} nextDestinationOffset Next destination offset or null.
	 * @apiSuccess {String} timezone UTC.
	 * @apiSuccess {String} period day.
	 */
	app.ms.api.onAuthorizedGet('user/social-statistics', async (req, res) => {
		await authorize(req);
		res.send(await module.summary(req.user.id, req.query));
	});
	/**
	 * @api {get} /v1/user/social-statistics/history Read daily social statistics history
	 * @apiName SocialStatisticsHistory
	 * @apiGroup SocialStatistics
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Owner-only; publishing:local and group management. Latest UTC day first.
	 * @apiQuery {String="post","group"} kind Entity kind.
	 * @apiQuery {Number} id Owned posted job ID or destination ID.
	 * @apiQuery {Number{1-365}} [limit=30] Maximum daily snapshots.
	 * @apiSuccess {Object[]} snapshots Daily periodStart, observedAt and metrics rows.
	 */
	app.ms.api.onAuthorizedGet('user/social-statistics/history', async (req, res) => {
		await authorize(req);
		res.send(await module.history(req.user.id, req.query));
	});
	/**
	 * @api {post} /v1/user/social-statistics/observations Record local social observations
	 * @apiName SocialStatisticsObservations
	 * @apiGroup SocialStatistics
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Dedicated publishing:local client key plus group management. Only this client's owned client-mode destinations/posted receipts. Atomic batch; older/equal observations do not overwrite. Same UTC day updates; another day inserts. Unknown fields rejected. Server identities and credentials are never accepted.
	 * @apiBody {Object[]} observations 1–100 observations.
	 * @apiBody {String="post","group"} observations.kind Entity kind.
	 * @apiBody {Number} [observations.jobId] Posted job ID for post kind.
	 * @apiBody {Number} [observations.destinationId] Destination ID for group kind.
	 * @apiBody {String} observations.observedAt ISO UTC timestamp, at most five minutes in future.
	 * @apiBody {Object} observations.metrics Post: likes/views/replies/reposts/reactions/score; group: followers/paidMembers for Patreon, members/online for Discord, followers otherwise. Safe integer or null; only score may be negative. At least one field.
	 * @apiSuccess {Number} accepted Validated observations, including harmless stale replays.
	 */
	app.ms.api.onAuthorizedPost('user/social-statistics/observations', async (req, res) => {
		await authorize(req);
		res.send(await module.record(req.user.id, publicationClientId(req.apiKey), req.body));
	});
	/**
	 * @api {post} /v1/user/social-statistics/refresh Refresh server social statistics
	 * @apiName SocialStatisticsRefresh
	 * @apiGroup SocialStatistics
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 * @apiDescription Owner-only publishing:local plus group management. Reads fixed provider endpoints with encrypted server accounts. Never publishes. Processes one owned server entity per request. Failed/unsupported providers preserve stored history and return safe per-entity status.
	 * @apiBody {String="post","group"} kind Entity kind.
	 * @apiBody {Number} id Owned server job or destination ID.
	 * @apiSuccess {Object[]} results Entity kind/id and updated, unavailable, unsupported, access_denied, rate_limited, connection_required or reconnect_required status. DeviantArt reconnect_required means renewed OAuth consent is needed; previous snapshots are preserved.
	 */
	app.ms.api.onAuthorizedPost('user/social-statistics/refresh', async (req, res) => {
		await authorize(req);
		res.send(await module.refresh(req.user.id, req.body));
	});
}
