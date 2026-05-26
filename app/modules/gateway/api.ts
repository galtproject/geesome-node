import _ from 'lodash';
import debug from 'debug';
import IGeesomeApiModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";
import {sendBadRequestOnContentRouteError} from "../api/routeErrorHelpers.js";
const {trim} = _;
const log = debug('geesome:gateway:api');

export default (app: IGeesomeApp, module: IGeesomeApiModule) => {

	async function getGatewayContentPath(req) {
		const dnsLinkPath = trim(await module.getDnsLinkPathFromRequest(req), '/');
		const type = dnsLinkPath.split('/')[0];
		let cid = dnsLinkPath.split('/')[1];
		if(type === 'ipns') {
			cid = await app.ms.staticId.resolveStaticId(cid);
		}
		return cid + req.route;
	}

	module.onGetRequest(async (req, res) => {
		const contentPath = await getGatewayContentPath(req);
		app.ms.content.getFileStreamForApiRequest(req, res, contentPath).catch(
			sendBadRequestOnContentRouteError(log, res, () => ({route: 'gateway', dataPath: contentPath}))
		);
	});

	module.onHeadRequest(async (req, res) => {
		const contentPath = await getGatewayContentPath(req);
		app.ms.content.getContentHead(req, res, contentPath).catch(
			sendBadRequestOnContentRouteError(log, res, () => ({route: 'gateway:head', dataPath: contentPath}))
		);
	});
}
