import _ from 'lodash';
import {IGeesomeApp} from "../../interface";
import IGeesomeRssModule from "./interface";
const {last} = _;

export default (_app: IGeesomeApp, rssModule: IGeesomeRssModule) => {
	_app.ms.api.onGet(rssModule.getRssGroupUrl(), async (req, res) => {
		const host = req.rawHeaders[req.rawHeaders.indexOf('Host') + 1];
		return res.send(await rssModule.groupRss((last(req.fullRoute.split('/')) as string).split('.')[0], host), 200);
	});
}