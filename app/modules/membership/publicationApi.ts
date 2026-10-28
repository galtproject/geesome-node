import {pipeline} from 'node:stream/promises';
import {readFileSync} from 'node:fs';
import {configuredSite, creatorSiteEndpoint, siteProblem} from '../api/browserSession.js';
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
	 * @apiDescription /page/:page/, /posts/:post/, /account/ and HEAD use the same selection policy. New snapshots use directory paths and stable archives of ten posts. Selector responses and errors bypass shared caches. Old CID snapshots and files deliberately retain access after subscription expiry or source changes.
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
		const site = await configuredSite(app, req, false);
		const reader = await app.ms.googleAuthorization.reader(req, site, false);
		const location = await module.currentSnapshot(site.id, reader?.id, req.params.post, sequencePage(req), routePath(req).endsWith('/account'));
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
	 * @api {get} /v1/membership/site/view Serve current creator HTML on a stable URL
	 * @apiName MembershipStableWebsite
	 * @apiGroup Membership
	 * @apiHeader {String} Host Configured site host; site-bound reader cookie optional.
	 * @apiSuccess {String} html Pre-rendered public or entitled full HTML.
	 * @apiDescription Reverse proxies may map /, /page/:page/, /posts/:post/ and /account/ to matching view routes, and style.css, public/client.js and media/:file to view asset routes. GET and HEAD never redirect to a CID. All responses bypass shared caches and vary by Cookie and Host; full HTML and accounts are noindex. Private previews never enter the public snapshot. Old immutable snapshots remain readable through their original CIDs.
	 * @apiError (404) page_not_found Invalid archive or unpublished content.
	 * @apiError (404) publication_not_ready No paired snapshot exists.
	 */
	const view = creatorSiteEndpoint(async (req, res) => {
		res.setHeader('Cache-Control', 'private, no-store');
		res.setHeader('X-Content-Type-Options', 'nosniff');
		const pathname = routePath(req);
		// External links may navigate to HTML, while cross-site API fetches remain forbidden.
		const documentNavigation = ['GET', 'HEAD'].includes(req.stream.method)
			&& req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
		const siteRequest = documentNavigation ? {...req, headers: {...req.headers, 'sec-fetch-site': 'none'}} : req;
		const site = await configuredSite(app, siteRequest, false);
		const requestUrl = new URL(req.route, 'https://creator.invalid');
		const documentRoute = !req.params.file && !pathname.endsWith('/style.css') && !pathname.endsWith('/client.js');
		if (documentRoute && !requestUrl.pathname.endsWith('/')) {
			res.setHeader('Location', pathname.split('/').pop() + '/' + requestUrl.search);
			res.writeHead(308, {});
			res.stream.end();
			return;
		}

		const reader = await app.ms.googleAuthorization.reader(req, site, false);
		const account = routePath(req).endsWith('/account');
		const location = await module.currentSnapshot(site.id, reader?.id, req.params.post,
			sequencePage(req), account);
		const [, root, ...parts] = new URL(location).pathname.split('/').slice(1);
		let path = parts.join('/');
		if (!path || path.endsWith('/')) {
			path += 'index.html';
		}
		const asset = req.params.file;
		if (asset) {
			if (!/^[a-f0-9]{64}\.[a-z0-9]{1,16}$/.test(asset)) {
				siteProblem(404, 'page_not_found');
			}
			path = `media/${asset}`;
		} else if (pathname.endsWith('/style.css')) {
			path = 'style.css';
		} else if (pathname.endsWith('/client.js')) {
			path = 'public/client.js';
		}
		const manifest = await module.publicationView(site.id);
		const variant = root === manifest?.public ? 'public' : root === manifest?.full ? 'full' : null;
		if (!variant) {
			siteProblem(503, 'publication_source_changed');
		}
		if (manifest.version === 2 && (asset ? !manifest.media?.[variant]?.includes(asset) : !manifest.files?.[variant]?.[path])) {
			siteProblem(404, 'page_not_found');
		}
		if (account || variant === 'full') {
			res.setHeader('X-Robots-Tag', 'noindex, nofollow');
		}
		const type = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'application/javascript' : path.endsWith('.html') ? 'text/html' : ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',ogg:'audio/ogg',pdf:'application/pdf',txt:'text/plain'}[path.split('.').pop()] || 'application/octet-stream');
		res.setHeader('Content-Type', type + (type.startsWith('text/') || type === 'application/javascript' ? '; charset=utf-8' : ''));
		const stream = await app.ms.storage.getFileStream(`${root}/${path}`);
		if (req.stream.method === 'HEAD') {
			stream.destroy();
			res.stream.end();
			return;
		}
		await pipeline(stream, res.stream);
	});
	app.ms.api.onGet('membership/site/view', view);
	app.ms.api.onHead('membership/site/view', view);
	app.ms.api.onGet('membership/site/view/page/:page', view);
	app.ms.api.onHead('membership/site/view/page/:page', view);
	app.ms.api.onGet('membership/site/view/posts/:post', view);
	app.ms.api.onHead('membership/site/view/posts/:post', view);
	app.ms.api.onGet('membership/site/view/account', view);
	app.ms.api.onHead('membership/site/view/account', view);
	app.ms.api.onGet('membership/site/view/style.css', view);
	app.ms.api.onHead('membership/site/view/style.css', view);
	app.ms.api.onGet('membership/site/view/public/client.js', view);
	app.ms.api.onHead('membership/site/view/public/client.js', view);
	app.ms.api.onGet('membership/site/view/media/:file', view);
	app.ms.api.onHead('membership/site/view/media/:file', view);


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
