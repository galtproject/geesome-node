import _ from 'lodash';
import debug from 'debug';
import {CorePermissionName, UserLimitName} from "../database/interface.js";
import IGeesomeContentModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";
import asyncBusboy from "./asyncBusboy.js";
import {sendBadRequestOnContentRouteError} from "../api/routeErrorHelpers.js";
const {pick} = _;
const log = debug('geesome:content:api');

export default (app: IGeesomeApp, contentModule: IGeesomeContentModule) => {
    async function getOptionalAuthenticatedUserId(req) {
        if (!req.token) {
            return null;
        }
        try {
            const {user} = await app.getUserByApiToken(req.token);
            return user?.id || null;
        } catch (e) {
            log('optional content metadata auth failed', e?.message || e);
            return null;
        }
    }


    /**
     * @api {post} /v1/user/save-file Save file
     * @apiDescription Store file from browser by FormData class in "file" field. Other fields can be stored as key value.
     * @apiName UserSaveFile
     * @apiGroup UserContent
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse UploadErrors
     * @apiUse AsyncResponse
     *
     * @apiInterface (../../interface.ts) {IFileContentInput} apiBody
     *
     * @apiInterface (../database/interface.ts) {IContent} apiSuccess
     *
     * @apiExample {curl} Example usage
     *   curl -X POST http://localhost:2052/v1/user/save-file \
     *     -H "Authorization: Bearer geesome-api-key" \
     *     -F "file=@./avatar.png" \
     *     -F "path=/avatars/avatar.png"
     */
    app.ms.api.onAuthorizedPost('user/save-file', async (req, res) => {
        const {files, fields: body} = await asyncBusboy(req.stream, {
            headers: req.headers,
            limits: {
                fileSize: await app.getUserLimitRemained(req.user.id, UserLimitName.SaveContentSize)
            }
        });
        const options = {
            userId: req.user.id,
            userApiKeyId: req.apiKey.id,
            ...pick(body, ['driver', 'groupId', 'folderId', 'path', 'async'])
        };
        const asyncOperationRes = await app.ms.asyncOperation.asyncOperationWrapper('content', 'saveData', [req.user.id, files[0], files[0].filename, options], options);
        res.send(asyncOperationRes);
    });

    /**
     * @api {post} /v1/user/save-data Save data
     * @apiDescription Store data (string or buffer)
     * @apiName UserSaveData
     * @apiGroup UserContent
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse UploadErrors
     * @apiUse AsyncResponse
     *
     * @apiInterface (../../interface.ts) {IDataContentInput} apiBody
     *
     * @apiInterface (../database/interface.ts) {IContent} apiSuccess
     *
     * @apiExample {curl} Example usage
     *   curl -X POST http://localhost:2052/v1/user/save-data \
     *     -H "Authorization: Bearer geesome-api-key" \
     *     -H "Content-Type: application/json" \
     *     -d '{"content":"hello","fileName":"hello.txt","mimeType":"text/plain"}'
     */
    app.ms.api.onAuthorizedPost('user/save-data', async (req, res) => {
        const options = {
            userId: req.user.id,
            userApiKeyId: req.apiKey.id,
            ...pick(req.body, ['groupId', 'folderId', 'mimeType', 'path', 'async', 'driver'])
        };

        res.send(await app.ms.asyncOperation.asyncOperationWrapper('content', 'saveData', [req.user.id, req.body['content'], req.body['fileName'] || req.body['name'], options], options));
    });

    /**
     * @api {post} /v1/user/save-data-by-url Save data by url
     * @apiDescription Download and store data by url
     * @apiName UserSaveDataByUrl
     * @apiGroup UserContent
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse UploadErrors
     * @apiUse AsyncResponse
     *
     * @apiInterface (../../interface.ts) {IUrlContentInput} apiBody
     *
     * @apiInterface (../database/interface.ts) {IContent} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/save-data-by-url', async (req, res) => {
        const options = {
            userId: req.user.id,
            userApiKeyId: req.apiKey.id,
            ...pick(req.body, ['groupId', 'driver', 'folderId', 'mimeType', 'path', 'async'])
        };

        res.send(await app.ms.asyncOperation.asyncOperationWrapper('content', 'saveDataByUrl', [req.user.id, req.body['url'], options], options));
    });

    /**
     * @api {post} /v1/user/save-directory Save directory
     * @apiDescription Store directory content
     * @apiName UserSaveDirectory
     * @apiGroup UserContent
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse UploadErrors
     *
     * @apiInterface (../../interface.ts) {IDataContentInput} apiBody
     *
     * @apiInterface (../database/interface.ts) {IContent} apiSuccess
     */
    app.ms.api.onAuthorizedPost('user/save-directory', async (req, res) => {
        const options = {
            userId: req.user.id,
            userApiKeyId: req.apiKey.id,
            ...pick(req.body, ['groupId', 'async', 'driver'])
        };

        res.send(await app.ms.asyncOperation.asyncOperationWrapper('content', 'saveDirectoryToStorage', [req.user.id, req.body['path'], options], options));
    });

    /**
     * @api {get} /v1/admin/all-content List all content
     * @apiName AdminAllContent
     * @apiGroup AdminContent
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse AdminErrors
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiInterface (../../interface.ts) {IContentListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('admin/all-content', async (req, res) => {
        res.send(await contentModule.getAllContentList(req.user.id, req.query.search, req.query));
    });

    /**
     * @api {get} /v1/admin/deleted-content List deleted content tombstones
     * @apiName AdminDeletedContent
     * @apiGroup AdminContent
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse AdminErrors
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiInterface (../../interface.ts) {IContentListResponse} apiSuccess
     */
    app.ms.api.onAuthorizedGet('admin/deleted-content', async (req, res) => {
        await app.checkUserCan(req.user.id, CorePermissionName.AdminRead);
        res.send(await contentModule.getDeletedContentList(req.user.id, req.query.search, req.query));
    });

    /**
     * @api {get} /v1/admin/deleted-content/purge-candidates List deleted content purge candidates
     * @apiName AdminDeletedContentPurgeCandidates
     * @apiGroup AdminContent
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse AdminErrors
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
     * @apiQuery {Number} [retentionDays=30] Minimum tombstone age before a row can be purged.
     * @apiSuccess {Object[]} list Candidate rows.
     * @apiSuccess {Number} total Number of expired tombstones found by the retention cutoff before live storage/reference checks.
     * @apiSuccess {Number} retentionDays Retention window used for the cutoff.
     * @apiSuccess {Date} cutoff Tombstones deleted at or before this time are eligible for live purge checks.
     * @apiDescription Lists expired soft-deleted content rows and explains whether each row can be hard-purged. Purge remains blocked while physical storage still exists, storage status cannot be checked safely, or database references still point at the content row.
     */
    app.ms.api.onAuthorizedGet('admin/deleted-content/purge-candidates', async (req, res) => {
        await app.checkUserCan(req.user.id, CorePermissionName.AdminRead);
        res.send(await contentModule.getDeletedContentPurgeCandidates(req.user.id, req.query));
    });

    /**
     * @api {post} /v1/admin/deleted-content/purge Purge expired deleted content tombstones
     * @apiName AdminDeletedContentPurge
     * @apiGroup AdminContent
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse AdminErrors
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiBody
     * @apiBody {Number} [retentionDays=30] Minimum tombstone age before a row can be purged.
     * @apiSuccess {Object[]} list Processed candidate rows with purge result and blocker details.
     * @apiSuccess {Number} purged Number of tombstones hard-deleted.
     * @apiSuccess {Number} skipped Number of candidates preserved because a purge blocker remained.
     * @apiSuccess {Number} retentionDays Retention window used for the cutoff.
     * @apiSuccess {Date} cutoff Tombstones deleted at or before this time are eligible for live purge checks.
     * @apiDescription Hard-deletes only expired soft-deleted content rows whose physical storage is already missing and whose content row has no active database references. Upload accounting rows are preserved with their content link detached.
     */
    app.ms.api.onAuthorizedPost('admin/deleted-content/purge', async (req, res) => {
        await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
        res.send(await contentModule.purgeDeletedContentTombstones(req.user.id, req.body));
    });

    /**
     * @api {post} /v1/admin/content/:contentId/restore Restore deleted content
     * @apiDescription Restores a soft-deleted content library row only while its physical storage still exists and the same user does not already have an active row with the same storage id.
     * @apiName AdminContentRestore
     * @apiGroup AdminContent
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiUse AdminErrors
     *
     * @apiParam {Number} contentId Content database id.
     * @apiInterface (../database/interface.ts) {IContent} apiSuccess
     *
     * @apiError content_restore_storage_conflict The user already has an active row with the same storage id.
     * @apiError content_restore_storage_missing The physical storage object has already been removed.
     */
    app.ms.api.onAuthorizedPost('admin/content/:contentId/restore', async (req, res) => {
        await app.checkUserCan(req.user.id, CorePermissionName.AdminAll);
        res.send(await contentModule.restoreDeletedContent(req.user.id, req.params.contentId));
    });

    /**
     * @api {get} /v1/content/:contentId Get public-safe content metadata
     * @apiDescription Numeric database ids are visible only for public content rows unless the request includes a valid bearer token for the content owner. Storage ids resolve through deterministic shared metadata and omit owner/library-only fields unless the selected row is public.
     * @apiName ContentGet
     * @apiGroup Content
     *
     * @apiParam {String} contentId Content database id or storage id.
     * @apiSuccess {String} storageId Physical storage id.
     * @apiSuccess {String} [mimeType] MIME type.
     * @apiSuccess {String} [extension] File extension.
     * @apiSuccess {Number} [size] Content size in bytes.
     * @apiSuccess {String} [previewMimeType] Preview MIME type.
     * @apiSuccess {String} [largePreviewStorageId] Large preview storage id.
     * @apiSuccess {String} [mediumPreviewStorageId] Medium preview storage id.
     * @apiSuccess {String} [smallPreviewStorageId] Small preview storage id.
     * @apiHeader {String} [Authorization] Optional bearer API key. When present and valid for the content owner, private numeric database ids resolve to the owner's full content metadata for backward compatibility.
     * @apiSuccess {Number} [id] Public content database id, or owner content database id when authorized.
     * @apiSuccess {String} [name] Public content name, or owner content name when authorized.
     * @apiSuccess {String} [description] Public content description, or owner content description when authorized.
     * @apiSuccess {String} [manifestStorageId] Public content manifest id, or owner content manifest id when authorized.
     * @apiUse ValidationErrors
     */
    app.ms.api.onGet('content/:contentId', async (req, res) => {
        const userId = await getOptionalAuthenticatedUserId(req);
        res.send(await contentModule.getPublicContentMetadata(req.params.contentId, userId));
    });

    /**
     * @api {get} /v1/content-by-storage-id/:contentStorageId Get user content by storage id
     * @apiName UserContentByStorageId
     * @apiGroup UserContent
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     *
     * @apiParam {String} contentStorageId Content storage id.
     * @apiInterface (../database/interface.ts) {IContent} apiSuccess
     */
    app.ms.api.onAuthorizedGet('content-by-storage-id/:contentStorageId', async (req, res) => {
        res.send(await contentModule.getContentByStorageAndUserId(req.params.contentStorageId, req.user.id));
    });

    /**
     * @api {post} /v1/content-list-by-storage-id Get user content list by storage ids
     * @apiName UserContentListByStorageId
     * @apiGroup UserContent
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     *
     * @apiInterface (../../interface.ts) {IStorageIdListInput} apiBody
     * @apiSuccess {Object[]} list Content items.
     */
    app.ms.api.onAuthorizedPost('content-list-by-storage-id', async (req, res) => {
        res.send(await contentModule.getContentByStorageIdListAndUserId(req.body.idList, req.user.id));
    });

    /**
     * @api {get} /v1/content-stats/* Get stored content stats
     * @apiName ContentStats
     * @apiGroup ContentData
     *
     * @apiDescription The wildcard path is the storage path inside content storage.
     * @apiInterface (../../interface.ts) {IContentStatResponse} apiSuccess
     * @apiUse StorageErrors
     */
    app.ms.api.onGet('content-stats/*', async (req, res) => {
        const dataPath = req.route.replace('content-stats/', '');
        return app.ms.storage.getFileStat(dataPath).then(d => res.send(d));
    });

    /**
     * @api {get} /v1/content-data/* Stream stored content data
     * @apiName ContentData
     * @apiGroup ContentData
     *
     * @apiDescription Streams bytes for the wildcard storage path.
     * @apiUse StorageErrors
     */
    app.ms.api.onGet('content-data/*', async (req, res) => {
        const dataPath = req.route.replace('content-data/', '');
        contentModule.getFileStreamForApiRequest(req, res, dataPath).catch(
            sendBadRequestOnContentRouteError(log, res, () => ({route: 'content-data', dataPath}))
        );
    });

    /**
     * @api {head} /v1/content-data/* Head stored content data
     * @apiName ContentDataHead
     * @apiGroup ContentData
     *
     * @apiDescription Returns content headers for the wildcard storage path.
     * @apiUse StorageErrors
     */
    app.ms.api.onHead('content-data/*', async (req, res) => {
        const dataPath = req.route.replace('content-data/', '');
        contentModule.getContentHead(req, res, dataPath).catch(
            sendBadRequestOnContentRouteError(log, res, () => ({route: 'content-data:head', dataPath}))
        );
    });

    /**
     * @api {get} /ipfs/* Stream IPFS content
     * @apiName IpfsContent
     * @apiGroup ContentData
     *
     * @apiDescription Unversioned IPFS gateway-compatible content stream. Generated static-site roots include `X-Robots-Tag: noindex, nofollow` unless the static-site render options explicitly set `allowSearchIndexing` to boolean `true`.
     * @apiUse StorageErrors
    */
    app.ms.api.onUnversionGet('/ipfs/*', async (req, res) => {
        const ipfsPath = req.route.replace('/ipfs/', '');
        contentModule.getFileStreamForApiRequest(req, res, ipfsPath).catch(
            sendBadRequestOnContentRouteError(log, res, () => ({route: 'ipfs', dataPath: ipfsPath}))
        );
    });

    /**
     * @api {head} /ipfs/* Head IPFS content
     * @apiName IpfsContentHead
     * @apiGroup ContentData
     *
     * @apiDescription Unversioned IPFS gateway-compatible HEAD request. Generated static-site roots include `X-Robots-Tag: noindex, nofollow` unless the static-site render options explicitly set `allowSearchIndexing` to boolean `true`.
     * @apiUse StorageErrors
     */
    app.ms.api.onUnversionHead('/ipfs/*', async (req, res) => {
        const ipfsPath = req.route.replace('/ipfs/', '');
        contentModule.getContentHead(req, res, ipfsPath).catch(
            sendBadRequestOnContentRouteError(log, res, () => ({route: 'ipfs:head', dataPath: ipfsPath}))
        );
    });


    if (app.frontendStorageId) {
        /**
         * @api {get} /v1/node* Stream configured frontend storage path
         * @apiName FrontendStorageNode
         * @apiGroup ContentData
         *
         * @apiDescription Streams files from the configured frontend storage id when frontend storage is enabled.
         * @apiUse StorageErrors
         */
        app.ms.api.onGet('/node*', async (req, res) => {
            if (req.route === '/node') {
                return res.redirect('/node/');
            }
            let path = req.route.replace('/node', '');
            if (!path || path === '/') {
                path = '/index.html';
            }
            const dataPath = app.frontendStorageId + path;
            contentModule.getFileStreamForApiRequest(req, res, dataPath).catch(
                sendBadRequestOnContentRouteError(log, res, () => ({route: 'frontend-node', dataPath}))
            );
        });
    }
};
