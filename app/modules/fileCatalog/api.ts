import debug from 'debug';
import {IGeesomeApp} from "../../interface.js";
import IGeesomeFileCatalogModule from "./interface.js";
const log = debug('geesome:app:fileCatalog');

export default (app: IGeesomeApp, fileCatalogModule: IGeesomeFileCatalogModule) => {
    const fileCatalogApi = app.ms.api.prefix('user/file-catalog/');

    fileCatalogApi.onAuthorizedGet('', async (req, res) => {
        log('req.query', req.query);
        res.send(await fileCatalogModule.getFileCatalogItems(req.user.id, req.query.parentItemId, req.query.type, req.query.search, req.query.isDeleted, req.query));
    });
    fileCatalogApi.onAuthorizedPost('update-items', async (req, res) => {
        res.send(await fileCatalogModule.updateFileCatalogList(req.user.id, req.body.fileCatalogIds, req.body));
    });
    fileCatalogApi.onAuthorizedPost('save-manifests-to-folder', async (req, res) => {
        res.send(await fileCatalogModule.saveManifestsToFolder(req.user.id, req.body.path, req.body.toSaveList, req.body.options));
    });
    fileCatalogApi.onAuthorizedPost('save-content-by-path', async (req, res) => {
        res.send(await fileCatalogModule.saveContentByPath(req.user.id, req.body.path, req.body.contentId));
    });
    /**
     * @api {post} /v1/user/file-catalog/get-content-by-path Look up owned content by path
     * @apiName CatalogContentByPath
     * @apiGroup FileCatalog
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiDescription Read-only owned lookup, available during storage contention and cleanup. Existing catalog permissions still apply.
     * @apiBody {String} path Catalog path.
     */
    fileCatalogApi.onAuthorizedPost('get-content-by-path', async (req, res) => {
        res.send(await fileCatalogModule.getContentByPath(req.user.id, req.body.path));
    }, {storageReadOnly: true});
    /**
     * @api {post} /v1/user/file-catalog/get-item-by-path Look up an owned catalog item by path
     * @apiName CatalogItemByPath
     * @apiGroup FileCatalog
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiDescription Read-only owned lookup, available during storage contention and cleanup. Existing catalog permissions still apply.
     * @apiBody {String} path Catalog path.
     */
    fileCatalogApi.onAuthorizedPost('get-item-by-path', async (req, res) => {
        res.send(await fileCatalogModule.getFileCatalogItemByPath(req.user.id, req.body.path, req.body.type));
    }, {storageReadOnly: true});
    fileCatalogApi.onAuthorizedPost('publish-folder/:itemId', async (req, res) => {
        res.send(await fileCatalogModule.publishFolder(req.user.id, req.params.itemId, req.body));
    });

    fileCatalogApi.onAuthorizedPost('get-contents-ids', async (req, res) => {
        res.send(await fileCatalogModule.getContentsIdsByFileCatalogIds(req.body));
    });
}
