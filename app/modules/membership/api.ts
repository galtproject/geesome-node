import { configuredSite, creatorSiteEndpoint } from '../api/browserSession.js';
export default function (app, module) {
	/**
	* @api {post} /v1/membership/sites Provision a creator domain binding
	* @apiName MembershipProvisionSite
	* @apiGroup Membership
	* @apiUse ApiKey
	* @apiBody {String} id Immutable site id; preserve it when importing existing resources.
	* @apiBody {String} origin Canonical HTTPS origin already controlled/routed by the node operator.
	* @apiBody {String} groupId Existing ordinary private unencrypted group id.
	* @apiBody {Number} ownerId Existing group creator id.
	* @apiBody {Number} version Zero for a new settings record, otherwise current version.
	* @apiBody {String} googleClientId Google client ID or empty string to disable Google login.
	* @apiBody {Boolean} enabled Enable browser access for this binding.
	* @apiBody {Boolean} registrationEnabled Allow creation of private readers.
	* @apiBody {Boolean} postsEnabled Enable public preview feed.
	* @apiSuccess {Object} result Persisted site settings including incremented version.
	* @apiError (403) not_permitted AdminAll and active API-key permission required.
	* @apiError (409) membership_site_binding_changed Resource identity is immutable.
	* @apiError (409) membership_site_binding_conflict Domain or group already bound.
	*/
	app.ms.api.onAuthorizedPost('membership/sites', creatorSiteEndpoint(async (req, res) => {
		res.send(await module.provisionSite(req.user.id, req.body));
	}), { storageReadOnly: true });
	/**
	* @api {get} /v1/membership/admin/:resource/site Read own site settings
	* @apiName MembershipSiteSettings
	* @apiGroup Membership
	* @apiUse ApiKey
	* @apiParam {String} resource Site id.
	* @apiSuccess {Object} result Binding, branding, Google client ID, registration/enable flags and current version.
	* @apiError (403) owner_required Group creator and UserGroupManagement required.
	*/
	app.ms.api.onAuthorizedGet('membership/admin/:resource/site', creatorSiteEndpoint(async (req, res) => {
		res.send(await module.siteSettings(req.user.id, req.params.resource));
	}));
	/**
	* @api {post} /v1/membership/admin/:resource/site Replace own mutable site settings
	* @apiName MembershipSaveSiteSettings
	* @apiGroup Membership
	* @apiUse ApiKey
	* @apiParam {String} resource Site id; domain/group/owner cannot be changed.
	* @apiBody {Number} version Current settings version.
	* @apiBody {String} googleClientId Google client ID or empty string to disable Google login.
	* @apiBody {Boolean} enabled Allow browser access.
	* @apiBody {Boolean} registrationEnabled Allow reader registration.
	* @apiBody {Boolean} postsEnabled Allow public preview feed.
	* @apiBody {String} [coverUrl] Cover URL.
	* @apiBody {String} [avatarUrl] Avatar URL.
	* @apiBody {Object[]} [links] Public links.
	* @apiBody {String} [patreonUrl] Patreon URL.
	* @apiBody {Object[]} [legalLinks] Public legal links.
	* @apiSuccess {Object} result Settings with incremented version; applies without restart.
	* @apiError (403) owner_required Group creator and UserGroupManagement required.
	* @apiError (409) membership_site_version_conflict Stale settings version.
	*/
	app.ms.api.onAuthorizedPost('membership/admin/:resource/site', creatorSiteEndpoint(async (req, res) => {
		res.send(await module.saveSiteSettings(req.user.id, req.params.resource, req.body));
	}), { storageReadOnly: true });
	/**
	* @api {get} /v1/membership/resource Read creator site
	* @apiName Membership0
	* @apiGroup Membership
	* @apiHeader {String} Host Configured creator-site host.
	* @apiSuccess {String} id Site id.
	* @apiSuccess {String} domain Canonical host.
	* @apiSuccess {Boolean} postsEnabled Whether the feed is enabled.
	* @apiSuccess {Object[]} options Enabled access tariffs.
	* @apiSuccess {Object[]} cryptoMethods Payment method availability.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onGet('membership/resource', creatorSiteEndpoint(async (req, res) => {
		const site = await configuredSite(app, req, false);
		res.send(await module.publicResource(site.id));
	}));
	/**
	* @api {get} /v1/membership/feed Read safe creator feed
	* @apiName Membership1
	* @apiGroup Membership
	* @apiHeader {String} Host Configured creator-site host.
	* @apiHeader {String} Cookie Site-bound __Host-geesome_session.
	* @apiQuery {Number} [offset=0] Offset, capped at 100000.
	* @apiQuery {Number} [limit=10] Page size, capped at 50.
	* @apiSuccess {Object[]} posts Safe post projections.
	* @apiSuccess {Boolean} hasMore Additional posts exist.
	* @apiSuccess {Number} nextOffset Next offset or null.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onGet('membership/feed', creatorSiteEndpoint(async (req, res) => {
		const site = await configuredSite(app, req, false);
		const reader = await app.ms.googleAuthorization.reader(req, site, false);
		res.send(await module.feed(site.id, reader?.id, req.query));
	}));
	/**
	* @api {get} /v1/membership/posts/:id Read a safe creator post
	* @apiName Membership2
	* @apiGroup Membership
	* @apiHeader {String} Host Configured creator-site host.
	* @apiHeader {String} Cookie Site-bound __Host-geesome_session.
	* @apiParam {Number} id GeeSome post database id.
	* @apiSuccess {String} id Native post id.
	* @apiSuccess {String[]} previews Explicit public previews.
	* @apiSuccess {Boolean} free Whether this post is free.
	* @apiSuccess {Boolean} locked Whether membership is required.
	* @apiSuccess {String} [pageUrl] Full set URL for free posts or active readers.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onGet('membership/posts/:id', creatorSiteEndpoint(async (req, res) => {
		const site = await configuredSite(app, req, false);
		const reader = await app.ms.googleAuthorization.reader(req, site, false);
		res.send(await module.post(site.id, req.params.id, reader?.id));
	}));
	/**
	* @api {get} /v1/membership/account Read membership and payment history
	* @apiName Membership3
	* @apiGroup Membership
	* @apiHeader {String} Host Configured creator-site host.
	* @apiHeader {String} Cookie Site-bound __Host-geesome_session.
	* @apiQuery {Number} [offset=0] Invoice history offset; returns at most 50 rows.
	* @apiSuccess {Object} reader Reader or null.
	* @apiSuccess {Boolean} active Current entitlement.
	* @apiSuccess {String} expiresAt Access expiry or null.
	* @apiSuccess {Object[]} invoices Bounded invoice history.
	* @apiSuccess {Object[]} refunds Bounded refund statuses.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onGet('membership/account', creatorSiteEndpoint(async (req, res) => {
		const site = await configuredSite(app, req, false);
		const reader = await app.ms.googleAuthorization.reader(req, site, false);
		res.send(await module.account(site.id, reader, req.query?.offset));
	}));
	/**
	* @api {post} /v1/membership/refunds Request a manual refund
	* @apiName Membership4
	* @apiGroup Membership
	* @apiHeader {String} Host Configured creator-site host.
	* @apiHeader {String} Origin Exact configured HTTPS site origin.
	* @apiHeader {String} Cookie Site-bound __Host-geesome_session.
	* @apiBody {String} invoiceId Own paid invoice id.
	* @apiBody {String} idempotencyKey Stable request key.
	* @apiBody {String} reason Refund reason.
	* @apiSuccess {String} id Refund id.
	* @apiSuccess {String} status Refund workflow status.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onPost('membership/refunds', creatorSiteEndpoint(async (req, res) => {
		const site = await configuredSite(app, req, true);
		const reader = await app.ms.googleAuthorization.reader(req, site, true);
		res.send(await module.requestRefund(site.id, reader.id, req.body.invoiceId, req.body.idempotencyKey, req.body.reason));
	}), { storageReadOnly: true });
	/**
	* @api {post} /v1/membership/admin/:resource/options Create or update an access tariff
	* @apiName Membership5
	* @apiGroup Membership
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiBody {String} [id] Existing option UUID.
	* @apiBody {Number} [version] Required current version when editing.
	* @apiBody {String} label Tariff label.
	* @apiBody {Number} amountCents USD price from 100 to 100000 cents.
	* @apiBody {String="month","halfyear","year"} period Calendar access period.
	* @apiBody {Boolean} [enabled=true] Offer to buyers.
	* @apiSuccess {String} id Tariff id.
	* @apiSuccess {Number} version Optimistic version.
	* @apiSuccess {Number} amountCents USD price in cents.
	* @apiSuccess {String} period Calendar access period.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onAuthorizedPost('membership/admin/:resource/options', creatorSiteEndpoint(async (req, res) => {
		await app.ms.membership.owner(req.user.id, req.params.resource);
		res.send(await module.saveOption(req.params.resource, req.body));
	}), { storageReadOnly: true });
	/**
	* @api {post} /v1/membership/admin/:resource/refunds/:id/decision Review a refund request
	* @apiName Membership6
	* @apiGroup Membership
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiParam {String} id Refund UUID.
	* @apiBody {String="approve","reject"} decision Approval requires a separate manual transfer.
	* @apiBody {String} reason Decision reason.
	* @apiSuccess {String} id Refund id.
	* @apiSuccess {String} status requested/rejected/action_required.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onAuthorizedPost('membership/admin/:resource/refunds/:id/decision', creatorSiteEndpoint(async (req, res) => {
		await app.ms.membership.owner(req.user.id, req.params.resource);
		res.send(await module.decideRefund(req.params.resource, req.params.id, req.body.decision, req.body.reason, String(req.user.id)));
	}), { storageReadOnly: true });
	/**
	* @api {post} /v1/membership/admin/:resource/refunds/:id/complete Attest a manually completed crypto refund
	* @apiName Membership7
	* @apiGroup Membership
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiParam {String} id Refund UUID.
	* @apiBody {String} txid Manual transfer transaction id. Revokes only this invoice period; never sends funds.
	* @apiSuccess {String} id Refund id.
	* @apiSuccess {String} status refunded.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onAuthorizedPost('membership/admin/:resource/refunds/:id/complete', creatorSiteEndpoint(async (req, res) => {
		await app.ms.membership.owner(req.user.id, req.params.resource);
		res.send(await module.completeCryptoRefund(req.params.resource, req.params.id, String(req.body.txid || ""), String(req.user.id)));
	}), { storageReadOnly: true });
	/**
	* @api {get} /v1/membership/admin/:resource/invoices List site invoices
	* @apiName MembershipOwnerInvoices
	* @apiGroup Membership
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiQuery {Number} [offset=0] History offset; invoices/refunds return at most 50 rows.
	* @apiSuccess {Object[]} result List site invoices.
	* @apiError (403) owner_required Group creator and core group-management permission required.
	*/
	app.ms.api.onAuthorizedGet('membership/admin/:resource/invoices', creatorSiteEndpoint(async (req, res) => {
		await module.owner(req.user.id, req.params.resource);
		res.send(await module.ownerInvoices(req.params.resource, req.query));
	}));
	/**
	* @api {get} /v1/membership/admin/:resource/refunds List site refund requests
	* @apiName MembershipOwnerRefunds
	* @apiGroup Membership
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiQuery {Number} [offset=0] History offset; invoices/refunds return at most 50 rows.
	* @apiSuccess {Object[]} result List site refund requests.
	* @apiError (403) owner_required Group creator and core group-management permission required.
	*/
	app.ms.api.onAuthorizedGet('membership/admin/:resource/refunds', creatorSiteEndpoint(async (req, res) => {
		await module.owner(req.user.id, req.params.resource);
		res.send(await module.ownerRefunds(req.params.resource, req.query));
	}));
	/**
	* @api {get} /v1/membership/admin/:resource/options List all site tariffs
	* @apiName MembershipOwnerOptions
	* @apiGroup Membership
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiQuery {Number} [offset=0] History offset; invoices/refunds return at most 50 rows.
	* @apiSuccess {Object[]} result List all site tariffs.
	* @apiError (403) owner_required Group creator and core group-management permission required.
	*/
	app.ms.api.onAuthorizedGet('membership/admin/:resource/options', creatorSiteEndpoint(async (req, res) => {
		await module.owner(req.user.id, req.params.resource);
		res.send(await module.models.options.findAll({ where: { resourceId: req.params.resource }, order: [['createdAt', 'ASC']] }));
	}));
}
