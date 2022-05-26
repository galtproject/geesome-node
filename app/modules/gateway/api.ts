import IGeesomeApiModule from "./interface";
import {IGeesomeApp} from "../../interface";

module.exports = (app: IGeesomeApp, module: IGeesomeApiModule) => {

	module.onGetRequest(async (req, res) => {
		const dnsLink = await module.getDnsLinkFromRequest(req);
		res.send(dnsLink);
	});
}