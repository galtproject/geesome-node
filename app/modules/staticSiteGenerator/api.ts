import {IGeesomeApp} from "../../interface";
import IGeesomeStaticSiteGeneratorModule from "./interface";
const _ = require('lodash');

module.exports = (_app: IGeesomeApp, ssgModule: IGeesomeStaticSiteGeneratorModule) => {
	const api = _app.ms.api.prefix('render/static-site-generator/');

	api.onAuthorizedPost('get-default-options', async (req, res) => {
		return res.send(await ssgModule.getDefaultOptionsByGroupId(req.user.id, req.body.entityId), 200);
	});
	api.onAuthorizedPost('update-info/:id', async (req, res) => {
		return res.send(await ssgModule.updateStaticSiteInfo(req.user.id, req.params.id, req.body), 200);
	});
	api.onAuthorizedPost('get-info', async (req, res) => {
		return res.send(await ssgModule.getStaticSiteInfo(req.user.id, req.body.entityType, req.body.entityId), 200);
	});
	api.onAuthorizedPost('run', async (req, res) => {
		return res.send(await ssgModule.addRenderToQueueAndProcess(req.user.id, req.apiKey.id, req.body.entityType, req.body.entityId, req.body.options), 200);
	});
	api.onAuthorizedPost('bind-to-static-id/:id', async (req, res) => {
		return res.send(await ssgModule.bindSiteToStaticId(req.user.id, req.params.id), 200);
	});
}