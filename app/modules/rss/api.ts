import {IGeesomeApp} from "../../interface";
import IGeesomeRssModule from "./interface";
const _ = require('lodash');

module.exports = (_app: IGeesomeApp, rssModule: IGeesomeRssModule) => {
	_app.ms.api.onGet(rssModule.getRssGroupUrl(), async (req, res) => {
		const host = req.rawHeaders[req.rawHeaders.indexOf('Host') + 1];
		return res.send(await rssModule.groupRss(_.last(req.fullRoute.split('/')).split('.')[0], host), 200);
	});
}