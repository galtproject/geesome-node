import { browserCookie, configuredSite, creatorSiteEndpoint } from '../api/browserSession.js';
export default function (app, module) {
	/**
	* @api {get} /v1/login/google/challenge Create a site-bound Google nonce
	* @apiName GoogleLoginChallenge
	* @apiGroup GoogleAuthorization
	* @apiHeader {String} Host Configured creator-site host.
	* @apiSuccess {String} nonce Pass to Google Identity Services initialize({nonce}).
	* @apiSuccess {String} googleClientId Existing site's Google client id.
	* @apiError (404) membership_site_not_found Unknown or disabled site.
	* @apiError (429) login_rate_limited Too many attempts.
	*/
	app.ms.api.onGet('login/google/challenge', creatorSiteEndpoint(async (req, res) => {
		const result = await module.challenge(req, configuredSite(app, req));
		res.setHeader('Set-Cookie', result.cookie);
		res.send({ nonce: result.nonce, googleClientId: result.googleClientId });
	}));
	/**
	* @api {post} /v1/login/google Sign in to a creator site
	* @apiName GoogleLogin
	* @apiGroup GoogleAuthorization
	* @apiHeader {String} Origin Exact configured HTTPS site origin.
	* @apiHeader {String} Cookie __Host-geesome_login from the challenge response.
	* @apiBody {String} credential Google ID token carrying the challenge nonce.
	* @apiSuccess {Object} reader Private reader projection. No bearer key is issued.
	* @apiError (401) google_authentication_failed Invalid credential, nonce or used/expired challenge.
	* @apiError (403) origin_invalid Origin mismatch.
	*/
	app.ms.api.onPost('login/google', creatorSiteEndpoint(async (req, res) => {
		const result = await module.login(req, configuredSite(app, req, true));
		res.setHeader('Set-Cookie', [result.cookie, browserCookie('__Host-geesome_login', '', 0)]);
		res.send({ reader: result.reader });
	}), { storageReadOnly: true });
	/**
	* @api {get} /v1/browser-session Read the site browser session
	* @apiName BrowserSession
	* @apiGroup GoogleAuthorization
	* @apiHeader {String} Cookie Site-bound __Host-geesome_session.
	* @apiSuccess {Object} reader Private reader projection or null.
	*/
	app.ms.api.onGet('browser-session', creatorSiteEndpoint(async (req, res) => {
		res.send({ reader: await module.reader(req, configuredSite(app, req)) });
	}));
	/**
	* @api {post} /v1/browser-session/logout Revoke the current site session
	* @apiName BrowserSessionLogout
	* @apiGroup GoogleAuthorization
	* @apiHeader {String} Origin Exact configured HTTPS site origin.
	* @apiHeader {String} Cookie Site-bound __Host-geesome_session.
	* @apiSuccess {Boolean} ok Session revoked.
	*/
	app.ms.api.onPost('browser-session/logout', creatorSiteEndpoint(async (req, res) => {
		const site = configuredSite(app, req, true);
		res.setHeader('Set-Cookie', await module.sessions.logout(req, site.id));
		res.send({ ok: true });
	}), { storageReadOnly: true });
}
