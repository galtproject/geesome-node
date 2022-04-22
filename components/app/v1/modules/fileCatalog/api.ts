import {IGeesomeApp, IGeesomeFileCatalogModule} from "../../../interface";

module.exports = (app: IGeesomeApp, fileCatalogModule: IGeesomeFileCatalogModule) => {
    app.api.post('/v1/user/file-catalog/save-manifests-to-folder', async (req, res) => {
        res.send(await fileCatalogModule.saveManifestsToFolder(req.user.id, req.body.path, req.body.toSaveList, req.body.options));
    });

    app.api.post('/v1/user/file-catalog/save-content-by-path', async (req, res) => {
        res.send(await fileCatalogModule.saveContentByPath(req.user.id, req.body.path, req.body.contentId));
    });
    app.api.post('/v1/user/file-catalog/get-content-by-path', async (req, res) => {
        res.send(await fileCatalogModule.getContentByPath(req.user.id, req.body.path));
    });
    app.api.post('/v1/user/file-catalog/get-item-by-path', async (req, res) => {
        res.send(await fileCatalogModule.getFileCatalogItemByPath(req.user.id, req.body.path, req.body.type));
    });
    app.api.post('/v1/user/file-catalog/publish-folder/:itemId', async (req, res) => {
        res.send(await fileCatalogModule.publishFolder(req.user.id, req.params.itemId, req.body));
    });

    app.api.post('/v1/file-catalog/get-contents-ids', async (req, res) => {
        res.send(await fileCatalogModule.getContentsIdsByFileCatalogIds(req.body));
    });
}