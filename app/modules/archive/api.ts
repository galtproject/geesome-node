import debug from 'debug';
import helpers from '../../helpers.js';
import {pipeline} from 'node:stream/promises';
import {IGeesomeApp} from '../../interface.js';
import {ApiProblemError} from '../api/problem.js';
import {requireIntegrationScopes} from '../api/integrationScopes.js';
import IGeesomeArchiveModule from './interface.js';

const log = debug('geesome:app:archive');

export default (app: IGeesomeApp, module: IGeesomeArchiveModule) => {
	/**
	 * @api {post} /v1/user/archive/:storageId Archive uploaded content
	 * @apiName ArchiveCreate
	 * @apiGroup Archive
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiParam {String} storageId Original immutable UnixFS CID, without a path.
	 * @apiDescription Requires user:save_data and ownership of a local upload or generated site. Explicitly publishes a downloadable tar.gz archive for anyone who knows the original CID. Queued jobs are tracked through the user async-operation queue (module content-archive). Completed requests reuse the existing mapping.
	 * @apiSuccess (202) {String} status queued
	 * @apiSuccess (202) {String} originalStorageId Canonical original CID.
	 * @apiSuccess (202) {Number} queueId User operation queue id.
	 * @apiSuccess (200) {String} status completed
	 * @apiSuccess (200) {String} archivedStorageId Archive CID when already completed.
	 * @apiError invalid_storage_id Input is not a supported immutable CID.
	 */
	app.ms.api.onAuthorizedPost('user/archive/:storageId', async (req, res) => {
		requireIntegrationScopes(req.apiKey, ['content:write']);
		const result = await module.requestArchive(req.user.id, req.params.storageId, req.apiKey?.id);
		res.send(result, result.status === 'queued' ? 202 : 200);
	});

	/**
	 * @api {get} /v1/archive/:storageId Get archive by original CID
	 * @apiName ArchiveGet
	 * @apiGroup Archive
	 * @apiParam {String} storageId Original immutable UnixFS CID.
	 * @apiSuccess {String} originalStorageId Canonical original CID.
	 * @apiSuccess {String} archivedStorageId Stored tar.gz CID.
	 * @apiError (404) archive_not_found No completed archive exists.
	 * @apiError invalid_storage_id Input is not a supported immutable CID.
	 */
	app.ms.api.onGet('archive/:storageId', async (req, res) => {
		res.send(await requireArchive(module, req.params.storageId));
	});

	/**
	 * @api {get} /v1/archive/:storageId/download Download archive by original CID
	 * @apiName ArchiveDownload
	 * @apiGroup Archive
	 * @apiParam {String} storageId Original immutable UnixFS CID.
	 * @apiDescription Public attachment download; no authentication required. Uses the canonical original CID as its root entry name and preserves nested paths, file bytes and empty directories. Limits: 1 GiB uncompressed, 10000 entries, depth 64.
	 * @apiSuccess {File} archive Binary tar.gz attachment (application/gzip).
	 * @apiError (404) archive_not_found No completed archive exists.
	 * @apiError invalid_storage_id Input is not a supported immutable CID.
	 */
	app.ms.api.onGet('archive/:storageId/download', async (req, res) => {
		const archive = await requireArchive(module, req.params.storageId);
		const stream = await app.ms.storage.getFileStream(archive.archivedStorageId);
		res.setHeader('Content-Type', 'application/gzip');
		res.setHeader('Content-Disposition', `attachment; filename="${archive.originalStorageId}.tar.gz"`);
		res.setHeader('X-Content-Type-Options', 'nosniff');
		try {
			await pipeline(stream, res.stream);
		} catch (error) {
			helpers.logDebug(log, () => ['archive_download_closed', {storageId: archive.originalStorageId, error: error?.message}]);
		}
	});
};

async function requireArchive(module: IGeesomeArchiveModule, storageId: string) {
	const archive = await module.getArchive(storageId);
	if (!archive) {
		throw new ApiProblemError(404, 'archive_not_found', 'Archive not found');
	}
	return archive;
}
