import _ from 'lodash';
import IGeesomeApiModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";
const {trim} = _;

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
		app.ms.content.getFileStreamForApiRequest(req, res, contentPath).catch((e) => {console.error(e); res.send(400)});
	});

	module.onHeadRequest(async (req, res) => {
		const contentPath = await getGatewayContentPath(req);
		app.ms.content.getContentHead(req, res, contentPath).catch((e) => {console.error(e); res.send(400)});
	});
}
