import {IGeesomeApp} from "../../interface";
import IGeesomeStaticIdModule from "./interface";
const _ = require('lodash');

module.exports = (app: IGeesomeApp, staticIdModule: IGeesomeStaticIdModule) => {

    app.ms.api.onGet('self-account-id', async (req, res) => {
        res.send({ result: await staticIdModule.getSelfStaticAccountId() }, 200);
    });

    app.ms.api.onGet('/ipns/*', async (req, res) => {
        // console.log('ipns req.route', req.route);
        const ipnsPath = req.route.replace('/ipns/', '').split('?')[0];
        const ipnsId = _.trim(ipnsPath, '/').split('/').slice(0, 1)[0];
        const ipfsId = await staticIdModule.resolveStaticId(ipnsId);

        // console.log('ipnsPath', ipnsPath);
        // console.log('ipfsPath', ipnsPath.replace(ipnsId, ipfsId));

        app.ms.content.getFileStreamForApiRequest(req, res, ipnsPath.replace(ipnsId, ipfsId)).catch((e) => {console.error(e); res.send(400)});
    });

    app.ms.api.onGet('/resolve/:storageId', async (req, res) => {
        staticIdModule.resolveStaticId(req.params.storageId).then(res.send.bind(res)).catch((err) => {
            res.send(err.message, 500)
        })
    });

};