import {IGeesomeApp} from "../../interface";
import IGeesomeFileCatalogModule from "./interface";

module.exports = (app: IGeesomeApp, fileCatalogModule: IGeesomeFileCatalogModule) => {
    const fileCatalogApi = app.ms.api.prefix('user/file-catalog/');

    fileCatalogApi.onAuthorizedGet('', async (req, res) => {
        console.log('req.query', req.query);
        res.send(await fileCatalogModule.getFileCatalogItems(req.user.id, req.query.parentItemId, req.query.type, req.query.search, req.query));
    });
    fileCatalogApi.onAuthorizedPost('save-manifests-to-folder', async (req, res) => {
        res.send(await fileCatalogModule.saveManifestsToFolder(req.user.id, req.body.path, req.body.toSaveList, req.body.options));
    });
    fileCatalogApi.onAuthorizedPost('save-content-by-path', async (req, res) => {
        res.send(await fileCatalogModule.saveContentByPath(req.user.id, req.body.path, req.body.contentId));
    });
    fileCatalogApi.onAuthorizedPost('get-content-by-path', async (req, res) => {
        res.send(await fileCatalogModule.getContentByPath(req.user.id, req.body.path));
    });
    fileCatalogApi.onAuthorizedPost('get-item-by-path', async (req, res) => {
        res.send(await fileCatalogModule.getFileCatalogItemByPath(req.user.id, req.body.path, req.body.type));
    });
    fileCatalogApi.onAuthorizedPost('publish-folder/:itemId', async (req, res) => {
        res.send(await fileCatalogModule.publishFolder(req.user.id, req.params.itemId, req.body));
    });

    fileCatalogApi.onAuthorizedPost('get-contents-ids', async (req, res) => {
        res.send(await fileCatalogModule.getContentsIdsByFileCatalogIds(req.body));
    });
}