import {readFileSync} from 'node:fs';
import {CorePermissionName} from '../database/interface.js';

const guide = readFileSync(new URL('./install.md', import.meta.url), 'utf8');

export default function registerApi(app, module) {
	/**
	 * @api {post} /v1/admin/client-releases/stable/windows-x64 Publish signed Windows client release
	 * @apiName PublishClientRelease
	 * @apiGroup ClientReleases
	 * @apiUse ApiKey
	 * @apiUse AdminErrors
	 * @apiPermission admin:all
	 * @apiBody {String} manifest Canonical base64 of exact UTF-8 manifest JSON bytes, at most 16 KiB envelope.
	 * @apiBody {String} signature Canonical base64 Ed25519 signature over decoded manifest bytes.
	 * @apiSuccess {String} manifest Published manifest bytes in base64.
	 * @apiSuccess {String} signature Publisher signature in base64.
	 * @apiError (400) client_release_signature_invalid Signature does not match the configured trusted key.
	 * @apiError (400) client_release_artifact_invalid Stored artifact differs in size or SHA-256.
	 * @apiError (409) client_release_version_conflict Published version already identifies different bytes.
	 * @apiError (409) client_release_downgrade A newer stable release is already advertised.
	 * @apiDescription Requires both administrator and API-key admin:all permission. Upload installer first with user/save-file; no media driver. Verifies signed exact schema/platform/version/CID/size/hash, reads and pins exact bytes, then atomically registers the immutable version and selects stable. Identical publication is idempotent. Invalid/failed publication preserves the previous stable descriptor. Content references prevent normal cleanup of retained releases. Never executes the installer.
	 */
	app.ms.api.onAuthorizedPost('admin/client-releases/stable/windows-x64', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
		res.send(await module.publish(req.user.id, req.body));
	});
	/**
	 * @api {get} /v1/client-releases/stable/windows-x64 Get signed stable Windows client release
	 * @apiName GetClientRelease
	 * @apiGroup ClientReleases
	 * @apiPermission none
	 * @apiSuccess {String} manifest Base64 exact UTF-8 JSON with schemaVersion=1, stable version, platform=windows-x64, bare cid, sha256 and byte size.
	 * @apiSuccess {String} signature Base64 Ed25519 signature. Verify with independently trusted publisher key before execution.
	 * @apiError (404) client_release_not_published No release has been published.
	 * @apiDescription Public metadata; no API key required. Download exact installer bytes through the existing public IPFS gateway. No executable commands or authentication secrets are returned. Discover this URL through /.well-known/geesome capabilities.clientReleases; supports public reverse-proxy prefixes.
	 */
	app.ms.api.onGet('client-releases/stable/windows-x64', async (_req, res) => {
		res.send(await module.stable());
	});
	/**
	 * @api {get} /v1/client-releases/install Get public client installation guide
	 * @apiName GetClientInstallGuide
	 * @apiGroup ClientReleases
	 * @apiPermission none
	 * @apiSuccess (200) {String} body Markdown instructions for Windows x64 installation, verification, login startup and removal.
	 * @apiDescription Public fixed installation guide for a user-authorized desktop agent. Available before the first release. No admin key needed; local execution requires user authorization and Windows access. Follow discovery URLs; do not execute arbitrary metadata as shell code.
	 */
	app.ms.api.onGet('client-releases/install', async (_req, res) => {
		res.writeHead(200, {'Content-Type': 'text/markdown; charset=utf-8', 'X-Content-Type-Options': 'nosniff'});
		res.stream.end(guide);
	});
}
