import _ from 'lodash';
import IGeesomeApiModule from "./interface";
import {IGeesomeApp} from "../../interface";
const {trim} = _;

export default (app: IGeesomeApp, module: IGeesomeApiModule) => {

	module.onGetRequest(async (req, res) => {
		const dnsLinkPath = trim(await module.getDnsLinkPathFromRequest(req), '/');
		const type = dnsLinkPath.split('/')[0];
		let cid = dnsLinkPath.split('/')[1];
		if(type === 'ipns') {
			cid = await app.ms.staticId.resolveStaticId(cid);
		}
		app.ms.content.getFileStreamForApiRequest(req, res, cid + req.route).catch((e) => {console.error(e); res.send(400)});
	});
}