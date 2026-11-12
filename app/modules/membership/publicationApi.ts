import {isGuestSelectionRequest} from './guestSelectionCache.js';
import {readFileSync} from 'node:fs';
import {configuredSite, assertSiteOrigin, creatorSiteEndpoint, siteProblem} from '../api/browserSession.js';
import {normalizeSubgroupAlias} from '../group/subgroupConfig.js';
const membershipClient = readFileSync(new URL('../staticSiteGenerator/site/public/membership.js', import.meta.url), 'utf8');

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
	 * @apiQuery {Number} [page=1] Legacy sequence selector: 1 is home; 2 selects archive 1 in new snapshots.
	 * @apiSuccess (302) {String} Location Public or full immutable IPFS snapshot URL.
	 * @apiDescription /page/:page/, /posts/:post/, /account/ and HEAD use the same selection policy. New snapshots use directory paths and stable archives of ten posts. HTML, CSS, JavaScript, media, sitemap.xml and robots.txt are static files in the published IPFS directory; this API only redirects to the selected snapshot and never proxies file bytes. Safe external GET/HEAD document navigation is allowed; cross-site API fetches remain forbidden. Anonymous selections use a bounded one-second process-local cache with commit-aware invalidation. Reader-session cookies and Authorization bypass it; full selections are never shared. Selector HTTP responses and errors remain private/no-store and vary by Cookie and Host. Old CID snapshots and files deliberately retain access after subscription expiry or source changes.
	 * @apiError (404) publication_not_ready No paired snapshot exists.
	 */
	const routePath = req => new URL(req.route, 'https://creator.invalid').pathname.replace(/\/+$/, '');
	const sequencePage = req => {
		if (req.params.page === undefined) {
			return req.query?.page === undefined ? 1 : Number(req.query.page);
		}
		if (!/^[1-9][0-9]*$/.test(req.params.page)) {
			siteProblem(404, 'page_not_found');
		}
		return Number(req.params.page) + 1;
	};
	const select = creatorSiteEndpoint(async (req, res) => {
		res.setHeader('Cache-Control', 'private, no-store');
		// External document links may select a snapshot; cross-site API fetches remain forbidden.
		const documentNavigation = ['GET', 'HEAD'].includes(req.stream.method)
			&& req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
		const siteRequest = documentNavigation ? {...req, headers: {...req.headers, 'sec-fetch-site': 'none'}} : req;
		const page = sequencePage(req), account = routePath(req).endsWith('/account');
		let location;
		if (isGuestSelectionRequest(req.headers)) {
			const key = JSON.stringify([String(req.headers.host || '').toLowerCase(), req.params.post ?? null, page, account]);
			const selection = await module.guestSnapshotSelection(key, async () => {
				// Coalesced loads must not inherit one caller's Origin/Fetch Metadata.
				const site = await module.resolveSite(String(req.headers.host || '').toLowerCase());
				if (!site) {
					siteProblem(404, 'membership_site_not_found');
				}
				return {origin: site.origin, location: await module.currentSnapshot(site.id, null, req.params.post, page, account)};
			});
			assertSiteOrigin(siteRequest, {origin: selection.origin});
			location = selection.location;
		} else {
			const site = await configuredSite(app, siteRequest, false);
			const reader = await app.ms.googleAuthorization.reader(req, site, false);
			location = await module.currentSnapshot(site.id, reader?.id, req.params.post, page, account);
		}
		res.setHeader('Location', location);
		res.writeHead(302, {});
		res.stream.end();
	});
	app.ms.api.onGet('membership/site', select);
	app.ms.api.onHead('membership/site', select);
	app.ms.api.onGet('membership/site/posts/:post', select);
	app.ms.api.onHead('membership/site/posts/:post', select);
	app.ms.api.onGet('membership/site/page/:page', select);
	app.ms.api.onHead('membership/site/page/:page', select);
	app.ms.api.onGet('membership/site/account', select);
	app.ms.api.onHead('membership/site/account', select);

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
	/**
	 * @api {get} /v1/membership/site/:alias Resolve a public subgroup section
	 * @apiName MembershipSubgroupSnapshot
	 * @apiGroup Membership
	 * @apiHeader {String} Host Configured site host.
	 * @apiParam {String} alias Configured subgroup alias.
	 * @apiSuccess (302) {String} Location Current public snapshot section URL.
	 * @apiDescription HEAD and /:alias/page/:subgroupPage and /:alias/posts/:subgroupPost use the same public selection. Only declared, available subgroup paths resolve. Membership cookies never select a full/private snapshot for these sections. Direct external document navigation is permitted with the same origin checks as the root selector; cross-site API fetches remain forbidden.
	 * @apiError (404) subgroup_not_found Alias or generated path is unavailable.
	 */
	const subgroupSelect = creatorSiteEndpoint(async (req, res) => {
		res.setHeader('Cache-Control', 'private, no-store');
		let alias;
		try {
			alias = normalizeSubgroupAlias(req.params.alias);
		} catch {
			siteProblem(404, 'subgroup_not_found');
		}
		let suffix = '';
		for (const [key, prefix] of [['subgroupPage', 'page'], ['subgroupPost', 'posts']]) {
			if (req.params[key] !== undefined) {
				if (!/^[1-9][0-9]*$/.test(String(req.params[key]))) {
					siteProblem(404, 'subgroup_not_found');
				}
				suffix = `${prefix}/${req.params[key]}/`;
			}
		}
		const documentNavigation = ['GET', 'HEAD'].includes(req.stream.method)
			&& req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
		const siteRequest = documentNavigation ? {...req, headers: {...req.headers, 'sec-fetch-site': 'none'}} : req;
		const site = await configuredSite(app, siteRequest, false);
		const location = await module.currentSubgroupSnapshot(site.id, alias, suffix);
		res.setHeader('Location', location);
		res.writeHead(302, {});
		res.stream.end();
	});
	app.ms.api.onGet('membership/site/:alias', subgroupSelect);
	app.ms.api.onHead('membership/site/:alias', subgroupSelect);
	app.ms.api.onGet('membership/site/:alias/page/:subgroupPage', subgroupSelect);
	app.ms.api.onHead('membership/site/:alias/page/:subgroupPage', subgroupSelect);
	app.ms.api.onGet('membership/site/:alias/posts/:subgroupPost', subgroupSelect);
	app.ms.api.onHead('membership/site/:alias/posts/:subgroupPost', subgroupSelect);
}
