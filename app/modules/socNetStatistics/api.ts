import {CorePermissionName} from '../database/interface.js';
import {requireIntegrationScopes} from '../api/integrationScopes.js';
import {publicationClientId} from '../socNetPublishing/destinations.js';

export default function registerApi(app, module) {
	async function authorize(req) {
		requireIntegrationScopes(req.apiKey, ['publishing:local']);
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
	}
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
	 * @apiSuccess {Object[]} groups Safe destination metadata with latest audience metrics, typed audience scope, and publicationCounts (last24Hours, last7Days, asOf). Counts are distinct confirmed remote IDs per destination, independent of receipt pagination.
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
	 * @apiBody {Object} observations.metrics Post: likes/views/replies/reposts/reactions/score; group: followers/members/online. Safe integer or null; only score may be negative. At least one field.
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
	 * @apiSuccess {Object[]} results Entity kind/id and updated, unavailable, unsupported, access_denied or rate_limited status.
	 */
	app.ms.api.onAuthorizedPost('user/social-statistics/refresh', async (req, res) => {
		await authorize(req);
		res.send(await module.refresh(req.user.id, req.body));
	});
}
