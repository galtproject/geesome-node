import { CorePermissionName } from '../database/interface.js';
import { configuredSite, creatorSiteEndpoint } from '../api/browserSession.js';
export default function (app, module) {
	/**
	* @api {get} /v1/payments/crypto/methods List available direct payment methods
	* @apiName Payments0
	* @apiGroup Payments
	* @apiHeader {String} Host Configured creator-site host.
	* @apiSuccess {Object[]} methods Supported payment methods and availability.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onGet('payments/crypto/methods', creatorSiteEndpoint(async (req, res) => {
		const site = await configuredSite(app, req, false);
		res.send({ methods: await module.engine.methods(site.id) });
	}));
	/**
	* @api {post} /v1/payments/crypto/invoices Create or resume a direct payment invoice
	* @apiName Payments1
	* @apiGroup Payments
	* @apiHeader {String} Host Configured creator-site host.
	* @apiHeader {String} Origin Exact configured HTTPS site origin.
	* @apiHeader {String} Cookie Site-bound __Host-geesome_session.
	* @apiBody {String} optionId Enabled tariff UUID.
	* @apiBody {String} assetId Supported asset/network id.
	* @apiBody {String} idempotencyKey Stable request key.
	* @apiSuccess {String} id Invoice id.
	* @apiSuccess {String} address Receiving address.
	* @apiSuccess {String} amount Required atomic-safe display amount.
	* @apiSuccess {String} status Current invoice status.
	* @apiSuccess {String} expiresAt Persisted quote expiry; new quotes last seven days. Existing quotes retain their saved deadline.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onPost('payments/crypto/invoices', creatorSiteEndpoint(async (req, res) => {
		const site = await configuredSite(app, req, true);
		const reader = await app.ms.googleAuthorization.reader(req, site, true);
		res.send(await module.engine.invoice(site.id, reader.id, req.body));
	}), { storageReadOnly: true });
	/**
	* @api {get} /v1/payments/crypto/invoices/:id Read own invoice status
	* @apiName Payments2
	* @apiGroup Payments
	* @apiHeader {String} Host Configured creator-site host.
	* @apiHeader {String} Cookie Site-bound __Host-geesome_session.
	* @apiParam {String} id Invoice UUID.
	* @apiSuccess {String} id Invoice id.
	* @apiSuccess {String} status Current invoice status.
	* @apiSuccess {String} amount Required display amount.
	* @apiSuccess {String} received Confirmed display amount.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onGet('payments/crypto/invoices/:id', creatorSiteEndpoint(async (req, res) => {
		const site = await configuredSite(app, req, false);
		const reader = await app.ms.googleAuthorization.reader(req, site, true);
		res.send(await module.engine.read(site.id, reader.id, req.params.id));
	}));
	/**
	* @api {get} /v1/payments/admin/:resource/settings Read owner payment settings
	* @apiName Payments3
	* @apiGroup Payments
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiSuccess {Object} automation Effective payout, payoutSource (group/owner/null), groupPayout, ownerDefault and group version; public addresses only.
	* @apiSuccess {Object[]} wallets Receiving wallet configurations.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onAuthorizedGet('payments/admin/:resource/settings', creatorSiteEndpoint(async (req, res) => {
		await app.ms.membership.owner(req.user.id, req.params.resource);
		res.send(await module.engine.settings(req.params.resource));
	}));
	/**
	* @api {post} /v1/payments/admin/:resource/wallet Configure a receiving-only legacy wallet
	* @apiName Payments4
	* @apiGroup Payments
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiBody {String} network Supported network.
	* @apiBody {Number} version Current wallet version.
	* @apiBody {Boolean} enabled Enable payment method.
	* @apiBody {String} xpub Public account key or empty string. Never a private key.
	* @apiBody {String[]} pool Public receiving addresses.
	* @apiBody {String[]} assets Supported asset ids.
	* @apiSuccess {Boolean} ok Settings saved.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onAuthorizedPost('payments/admin/:resource/wallet', creatorSiteEndpoint(async (req, res) => {
		await app.ms.membership.owner(req.user.id, req.params.resource);
		res.send(await module.engine.save(req.params.resource, req.body));
	}), { storageReadOnly: true });
	/**
	* @api {post} /v1/payments/admin/:resource/treasury Configure managed EVM payout
	* @apiName Payments5
	* @apiGroup Payments
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiBody {String} [payout] Public EVM payout address for a group override.
	* @apiBody {Boolean} [inherit] Set true without payout to use the owner default.
	* @apiBody {Number} version Current settings version.
	* @apiSuccess {Boolean} ok Settings saved.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onAuthorizedPost('payments/admin/:resource/treasury', creatorSiteEndpoint(async (req, res) => {
		await app.ms.membership.owner(req.user.id, req.params.resource);
		res.send(await module.engine.treasury.save(req.params.resource, req.body));
	}), { storageReadOnly: true });
	/**
	* @api {post} /v1/payments/admin/:resource/test Check network connectivity
	* @apiName Payments6
	* @apiGroup Payments
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiBody {String} network Network to check; does not send funds.
	* @apiSuccess {Boolean} ok Network checked.
	* @apiSuccess {String} checkedAt Check timestamp.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onAuthorizedPost('payments/admin/:resource/test', creatorSiteEndpoint(async (req, res) => {
		await app.ms.membership.owner(req.user.id, req.params.resource);
		res.send(await module.engine.test(req.params.resource, req.body.network));
	}), { storageReadOnly: true });
	/**
	* @api {get} /v1/payments/admin/:resource/reviews List payments requiring review
	* @apiName Payments7
	* @apiGroup Payments
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiSuccess {Object[]} invoices Invoices needing owner action.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onAuthorizedGet('payments/admin/:resource/reviews', creatorSiteEndpoint(async (req, res) => {
		await app.ms.membership.owner(req.user.id, req.params.resource);
		res.send(await module.engine.reviews(req.params.resource));
	}));
	/**
	* @api {post} /v1/payments/admin/:resource/invoices/:id/rescan Recheck saved invoice evidence
	* @apiName Payments8
	* @apiGroup Payments
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiParam {String} id Invoice UUID.
	* @apiSuccess {String} id Invoice id.
	* @apiSuccess {String} status Updated invoice status.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onAuthorizedPost('payments/admin/:resource/invoices/:id/rescan', creatorSiteEndpoint(async (req, res) => {
		await app.ms.membership.owner(req.user.id, req.params.resource);
		res.send(await module.engine.rescan(req.params.resource, req.params.id));
	}), { storageReadOnly: true });
	/**
	* @api {post} /v1/payments/admin/:resource/invoices/:id/approve Approve a verified late payment
	* @apiName Payments9
	* @apiGroup Payments
	* @apiUse ApiKey
	* @apiParam {String} resource Configured site id owned by the actor.
	* @apiParam {String} id Invoice UUID.
	* @apiSuccess {Boolean} ok Verified payment credited once.
	* @apiError (401) reader_login_required Missing or expired session; owner routes require bearer credentials.
	* @apiError (403) Forbidden Origin or owner/permission mismatch.
	*/
	app.ms.api.onAuthorizedPost('payments/admin/:resource/invoices/:id/approve', creatorSiteEndpoint(async (req, res) => {
		await app.ms.membership.owner(req.user.id, req.params.resource);
		res.send(await module.engine.review(req.params.resource, req.params.id));
	}), { storageReadOnly: true });
	/**
	* @api {get} /v1/user/payments/payout Read own default payout address
	* @apiName OwnerDefaultPayout
	* @apiGroup Payments
	* @apiUse ApiKey
	* @apiSuccess {String} payout Public EVM address or empty string when unset.
	* @apiSuccess {Number} version Current settings version, initially zero.
	* @apiError (403) Forbidden Core group-management permission and active key permission required.
	*/
	app.ms.api.onAuthorizedGet('user/payments/payout', creatorSiteEndpoint(async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
		res.send(await module.engine.treasury.ownerDefault(req.user.id));
	}));
	/**
	* @api {post} /v1/user/payments/payout Set own default payout address
	* @apiName OwnerDefaultPayoutSave
	* @apiGroup Payments
	* @apiUse ApiKey
	* @apiBody {String} payout Public EVM address, used by own groups without an override.
	* @apiBody {Number} version Current settings version, initially zero.
	* @apiSuccess {Boolean} ok Saved. Existing invoice and planned collection destinations stay frozen.
	* @apiError (400) crypto_payout_invalid Invalid body/address; caller cannot select a different userId.
	* @apiError (409) crypto_settings_version_conflict Refresh settings before retrying.
	*/
	app.ms.api.onAuthorizedPost('user/payments/payout', creatorSiteEndpoint(async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.UserGroupManagement);
		res.send(await module.engine.treasury.saveOwnerDefault(req.user.id, req.body));
	}), { storageReadOnly: true });
}
