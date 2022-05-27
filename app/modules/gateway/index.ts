import {IGeesomeApp} from "../../interface";
import IGeesomeGatewayModule from "./interface";

const helpers = require("./helpers");

module.exports = async (app: IGeesomeApp) => {
	const module = await getModule(app, process.env.GATEWAY_PORT || 2082);
	require('./api')(app, module);
	return module;
}

async function getModule(app: IGeesomeApp, port) {
	const service = require('restana')({
		ignoreTrailingSlash: true,
		maxParamLength: 2000,
		errorHandler(err, req, res) {
			console.log(`Something was wrong: ${err.message || err}`, err)
			res.send(err)
		}
	});

	service.use(require('morgan')('combined'));

	service.use(async (req, res, next) => {
		setHeaders(res);

		res.redirect = (url) => {
			//https://github.com/jkyberneees/ana/issues/16
			res.send('', 301, {
				Location: encodeURI(url)
			});
		};

		next();
	});

	service.options("/*", function (req, res, next) {
		setHeaders(res);
		res.send(200);
	});
	service.head("/*", function (req, res, next) {
		setHeaders(res);
		res.send(200);
	});

	await service.start(port);

	function setHeaders(res) {
		res.setHeader('Strict-Transport-Security', 'max-age=0');
		res.setHeader('Access-Control-Allow-Credentials', 'true');
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD");
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
		res.setHeader('Connection', 'close'); //TODO: determine the best solution https://serverfault.com/questions/708319/chrome-requests-get-stuck-pending
	}

	class GeesomeGatewayModule implements IGeesomeGatewayModule {
		port;
		constructor(port) {
			this.port = port;
		}
		async getDnsLinkPathFromRequest(req) {
			return helpers.getDnsLinkPathFromHost(req.headers.host);
		}
		onGetRequest(callback) {
			service.get("/*", (req, res) => {
				setHeaders(res);
				callback(app.ms.api.reqToModuleInput(req), app.ms.api.resToModuleOutput(res));
			});
		}
	}
	return new GeesomeGatewayModule(port);
}