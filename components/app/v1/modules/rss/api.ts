import {IGeesomeApp} from "../../../interface";
import IGeesomeRssModule from "./interface";
const _ = require('lodash');

module.exports = (_app: IGeesomeApp, rssModule: IGeesomeRssModule) => {
	_app.api.get(rssModule.getRssGroupUrl(), async (req, res) => {
		const host = req.rawHeaders[req.rawHeaders.indexOf('Host') + 1];
		return res.send(await this.groupRss(_.last(req.originalUrl.split('/')).split('.')[0], host), 200);
	});
}