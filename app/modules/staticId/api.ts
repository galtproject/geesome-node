import _ from 'lodash';
import IGeesomeStaticIdModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";
const {trim} = _;

export default (app: IGeesomeApp, staticIdModule: IGeesomeStaticIdModule) => {

    app.ms.api.onGet('self-account-id', async (req, res) => {
        res.send({ result: await staticIdModule.getSelfStaticAccountId() }, 200);
    });

    app.ms.api.onUnversionGet('/ipns/*', async (req, res) => {
        const ipnsPath = req.route.replace('/ipns/', '').split('?')[0];
        const ipnsId = trim(ipnsPath, '/').split('/').slice(0, 1)[0];
        const ipfsId = await staticIdModule.resolveStaticId(ipnsId);
        app.ms.content.getFileStreamForApiRequest(req, res, ipnsPath.replace(ipnsId, ipfsId)).catch((e) => {console.error(e); res.send(400)});
    });

    app.ms.api.onUnversionHead('/ipns/*', async (req, res) => {
        const ipnsPath = req.route.replace('/ipns/', '').split('?')[0];
        const ipnsId = trim(ipnsPath, '/').split('/').slice(0, 1)[0];
        const ipfsId = await staticIdModule.resolveStaticId(ipnsId);
        app.ms.content.getContentHead(req, res, ipnsPath.replace(ipnsId, ipfsId)).catch((e) => {console.error(e); res.send(400)});
    });

    app.ms.api.onGet('/resolve/:storageId', async (req, res) => {
        staticIdModule.resolveStaticId(req.params.storageId).then(res.send.bind(res)).catch((err) => {
            res.send(err.message, 500)
        })
    });

};