import {IGeesomeApp} from "../../../interface";
import IGeesomeStaticSiteManagerModule from "./interface";
const _ = require('lodash');

module.exports = (_app: IGeesomeApp, ssmModule: IGeesomeStaticSiteManagerModule) => {
	['run-for-group', 'get-default-options'].forEach(method => {
		_app.api.post(`/v1/render/${ssmModule.moduleName}/` + method, async (req, res) => {
			if (!req.token) {
				return res.send({error: "Need authorization token", errorCode: 1}, 401);
			}
			req.user = await _app.getUserByApiKey(req.token);
			if (!req.user || !req.user.id) {
				return res.send(401);
			}
			const userId = req.user.id;
			if (method === 'get-default-options') {
				return res.send(await ssmModule.getDefaultOptionsByGroupId(req.body.id), 200);
			}
			if (method === 'run-for-group') {
				return res.send(await ssmModule.addRenderToQueueAndProcess(userId, req.token, 'group', req.body.id, req.body.options), 200);
			}
		});
	});
}