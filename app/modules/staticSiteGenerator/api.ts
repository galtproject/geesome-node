import {IGeesomeApp} from "../../interface";
import IGeesomeStaticSiteManagerModule from "./interface";
const _ = require('lodash');

module.exports = (_app: IGeesomeApp, ssmModule: IGeesomeStaticSiteManagerModule) => {
	const api = _app.ms.api.prefix('render/static-site-generator/');

	api.onAuthorizedPost('get-default-options', async (req, res) => {
		return res.send(await ssmModule.getDefaultOptionsByGroupId(req.body.id), 200);
	})
	api.onAuthorizedPost('run-for-group', async (req, res) => {
		return res.send(await ssmModule.addRenderToQueueAndProcess(req.user.id, req.token, 'group', req.body.id, req.body.options), 200);
	})
}