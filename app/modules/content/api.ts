import _ from 'lodash';
import {UserLimitName} from "../database/interface.js";
import IGeesomeContentModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";
import asyncBusboy from "./asyncBusboy.js";
const {pick} = _;

export default (app: IGeesomeApp, contentModule: IGeesomeContentModule) => {

    /**
     * @api {post} user/save-file Save file
     * @apiDescription Store file from browser by FormData class in "file" field. Other fields can be stored as key value.
     * @apiName UserSaveFile
     * @apiGroup UserContent
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../interface.ts) {IFileContentInput} apiParam
     *
     * @apiInterface (../database/interface.ts) {IContent} apiSuccess
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
     * @api {post} user/save-data Save data
     * @apiDescription Store data (string or buffer)
     * @apiName UserSaveData
     * @apiGroup UserContent
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../interface.ts) {IDataContentInput} apiParam
     *
     * @apiInterface (../database/interface.ts) {IContent} apiSuccess
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
     * @api {post} user/save-data-by-url Save data by url
     * @apiDescription Download and store data by url
     * @apiName UserSaveDataByUrl
     * @apiGroup UserContent
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../interface.ts) {IUrlContentInput} apiParam
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
     * @api {post} user/save-directory Save directory
     * @apiDescription Store directory content
     * @apiName UserSaveDirectory
     * @apiGroup UserContent
     *
     * @apiUse ApiKey
     *
     * @apiInterface (../../interface.ts) {IDataContentInput} apiParam
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

    app.ms.api.onAuthorizedGet('admin/all-content', async (req, res) => {
        res.send(await contentModule.getAllContentList(req.user.id, req.query.search, req.query));
    });

    app.ms.api.onGet('content/:contentId', async (req, res) => {
        res.send(await contentModule.getContent(req.params.contentId));
    });

    app.ms.api.onAuthorizedGet('content-by-storage-id/:contentStorageId', async (req, res) => {
        res.send(await contentModule.getContentByStorageAndUserId(req.params.contentStorageId, req.user.id));
    });

    app.ms.api.onAuthorizedPost('content-list-by-storage-id', async (req, res) => {
        res.send(await contentModule.getContentByStorageIdListAndUserId(req.body.idList, req.user.id));
    });

    app.ms.api.onGet('content-stats/*', async (req, res) => {
        const dataPath = req.route.replace('content-stats/', '');
        return app.ms.storage.getFileStat(dataPath).then(d => res.send(d));
    });

    app.ms.api.onGet('content-data/*', async (req, res) => {
        const dataPath = req.route.replace('content-data/', '');
        contentModule.getFileStreamForApiRequest(req, res, dataPath).catch((e) => {console.error(e); res.send(400)});
    });

    app.ms.api.onHead('content-data/*', async (req, res) => {
        const dataPath = req.route.replace('content-data/', '');
        contentModule.getContentHead(req, res, dataPath).catch((e) => {console.error(e); res.send(400)});
    });

    app.ms.api.onUnversionGet('/ipfs/*', async (req, res) => {
        console.log('req.route', req.route);
        const ipfsPath = req.route.replace('/ipfs/', '');
        contentModule.getFileStreamForApiRequest(req, res, ipfsPath).catch((e) => {console.error(e); res.send(400)});
    });

    app.ms.api.onUnversionHead('/ipfs/*', async (req, res) => {
        const ipfsPath = req.route.replace('/ipfs/', '');
        contentModule.getContentHead(req, res, ipfsPath).catch((e) => {console.error(e); res.send(400)});
    });


    if (app.frontendStorageId) {
        app.ms.api.onGet('/node*', async (req, res) => {
            if (req.route === '/node') {
                return res.redirect('/node/');
            }
            let path = req.route.replace('/node', '');
            if (!path || path === '/') {
                path = '/index.html';
            }
            contentModule.getFileStreamForApiRequest(req, res, app.frontendStorageId + path).catch((e) => {console.error(e); res.send(400)});
        });
    }
};