import _ from 'lodash';
import IGeesomeStaticSiteGeneratorModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
const {pick} = _;


export default (_app: IGeesomeApp, ssgModule: IGeesomeStaticSiteGeneratorModule) => {
	const api = _app.ms.api.prefix('render/static-site-generator/');

	api.onAuthorizedPost('get-default-options', async (req, res) => {
		return res.send(await ssgModule.getDefaultOptionsByRenderArgs(req.user.id, pickRenderArgs(req.body)), 200);
	});
	api.onAuthorizedPost('update-info/:id', async (req, res) => {
		return res.send(await ssgModule.updateStaticSiteInfo(req.user.id, req.params.id, req.body), 200);
	});
	api.onAuthorizedPost('get-info', async (req, res) => {
		return res.send(await ssgModule.getStaticSiteInfo(req.user.id, pickRenderArgs(req.body)), 200);
	});
	api.onAuthorizedPost('get-list', async (req, res) => {
		return res.send(await ssgModule.getStaticSiteList(req.user.id, req.body.entityType, helpers.prepareListParams(req.body)), 200);
	});
	api.onAuthorizedPost('run', async (req, res) => {
		return res.send(await ssgModule.addRenderToQueueAndProcess(req.user.id, req.apiKey.id, pickRenderArgs(req.body), req.body.options), 200);
	});
	api.onAuthorizedPost('bind-to-static-id/:id', async (req, res) => {
		return res.send(await ssgModule.bindSiteToStaticId(req.user.id, req.params.id), 200);
	});
}

function pickRenderArgs(data) {
	return pick(data, ['entityType', 'entityId', 'entityIds'])
}