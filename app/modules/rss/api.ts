import _ from 'lodash';
import {IGeesomeApp} from "../../interface.js";
import IGeesomeRssModule from "./interface.js";
const {last} = _;

export default (_app: IGeesomeApp, rssModule: IGeesomeRssModule) => {
	/**
	 * @api {get} /v1/render/rss/group/:id.rss Get group RSS feed
	 * @apiName GroupRss
	 * @apiGroup Rss
	 *
	 * @apiDescription Route shape is provided by the RSS module configuration.
	 * @apiParam {String} id.rss Group id with RSS extension.
	 * @apiSuccess {String} result RSS XML.
	 */
	_app.ms.api.onGet(rssModule.getRssGroupUrl(), async (req, res) => {
		const host = req.rawHeaders[req.rawHeaders.indexOf('Host') + 1];
		return res.send(await rssModule.groupRss((last(req.fullRoute.split('/')) as string).split('.')[0], host), 200);
	});
}
