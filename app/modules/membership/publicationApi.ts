import {membershipClient} from '../staticSiteGenerator/membershipClient.js';
import {configuredSite, creatorSiteEndpoint} from '../api/browserSession.js';
export default function registerPublicationApi(app, module) {
	/**
	 * @api {post} /v1/membership/admin/:resource/publications Build public and full snapshots
	 * @apiName MembershipBuildPublication
	 * @apiGroup Membership
	 * @apiUse ApiKey
	 * @apiParam {String} resource Own resource id.
	 * @apiBody {String} requestKey Stable publication key; replay returns the same job.
	 * @apiSuccess {String} id Durable publication job UUID.
	 * @apiSuccess {String} status queued/building/ready/failed.
	 * @apiDescription Both immutable IPFS snapshots publish atomically as a pair. Obtained CIDs remain readable after expiry; only discovery of the current full snapshot requires subscription.
	 * @apiError (403) owner_required Owner and account/key group management required.
	 */
	app.ms.api.onAuthorizedPost('membership/admin/:resource/publications', creatorSiteEndpoint(async (req, res) => {
		res.send(await module.enqueuePublication(req.user.id, req.params.resource, req.body));
	}), {storageReadOnly: true});
	/**
	 * @api {get} /v1/membership/admin/:resource/publication Read snapshot publication state
	 * @apiName MembershipPublicationStatus
	 * @apiGroup Membership
	 * @apiUse ApiKey
	 * @apiParam {String} resource Own resource id.
	 * @apiSuccess {String} status Current build status.
	 * @apiSuccess {String} revision Active paired revision UUID or null.
	 * @apiError (403) owner_required Owner and account/key group management required.
	 */
	app.ms.api.onAuthorizedGet('membership/admin/:resource/publication', creatorSiteEndpoint(async (req, res) => {
		res.send(await module.publicationStatus(req.user.id, req.params.resource));
	}));
	/**
	 * @api {get} /v1/membership/site/ Resolve current website snapshot
	 * @apiName MembershipGeneratedSite
	 * @apiGroup Membership
	 * @apiHeader {String} Host Configured site host; site-bound cookie optional.
	 * @apiQuery {Number} [page=1] Page of 20 canonical posts.
	 * @apiSuccess (302) {String} Location Public or full immutable IPFS snapshot URL.
	 * @apiDescription /posts/:post/ and HEAD use the same selection policy. Selector responses and errors bypass shared caches. Old CID snapshots and files deliberately retain access after subscription expiry or source changes.
	 * @apiError (404) publication_not_ready No paired snapshot exists.
	 */
	const select = creatorSiteEndpoint(async (req, res) => {
		res.setHeader('Cache-Control', 'private, no-store');
		const site = await configuredSite(app, req, false);
		const reader = await app.ms.googleAuthorization.reader(req, site, false);
		const location = await module.currentSnapshot(site.id, reader?.id, req.params.post, req.query?.page === undefined ? 1 : Number(req.query.page));
		res.setHeader('Location', location);
		res.writeHead(302, {});
		res.stream.end();
	});
	app.ms.api.onGet('membership/site', select);
	app.ms.api.onHead('membership/site', select);
	app.ms.api.onGet('membership/site/posts/:post', select);
	app.ms.api.onHead('membership/site/posts/:post', select);

	/**
	 * @api {get} /v1/membership/site/client.js Load snapshot account controls
	 * @apiName MembershipSnapshotClient
	 * @apiGroup Membership
	 * @apiHeader {String} Host Configured site host.
	 * @apiSuccess {String} script Shared Google login, account and existing payment API controls; no owner credentials.
	 */
	app.ms.api.onGet('membership/site/client.js', creatorSiteEndpoint(async (req, res) => {
		await configuredSite(app, req, false);
		res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.stream.end(membershipClient);
	}));
}
