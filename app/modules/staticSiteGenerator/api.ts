import {IGeesomeApp} from "../../interface";
import IGeesomeStaticSiteGeneratorModule from "./interface";
const _ = require('lodash');

module.exports = (_app: IGeesomeApp, ssmModule: IGeesomeStaticSiteGeneratorModule) => {
	const api = _app.ms.api.prefix('render/static-site-generator/');

	api.onAuthorizedPost('get-default-options', async (req, res) => {
		return res.send(await ssmModule.getDefaultOptionsByGroupId(req.user.id, req.body.entityId), 200);
	});
	api.onAuthorizedPost('get-info', async (req, res) => {
		return res.send(await ssmModule.getStaticSiteInfo(req.user.id, req.body.entityType, req.body.entityId), 200);
	});
	api.onAuthorizedPost('run', async (req, res) => {
		return res.send(await ssmModule.addRenderToQueueAndProcess(req.user.id, req.token, req.body.entityType, req.body.entityId, req.body.options), 200);
	});
	api.onAuthorizedPost('bind-to-static-id', async (req, res) => {
		return res.send(await ssmModule.bindSiteToStaticId(req.user.id, req.body.entityType, req.body.entityId, req.body.name), 200);
	});
}