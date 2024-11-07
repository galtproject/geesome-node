import morgan from 'morgan';
import express from 'express';
import bodyParser from 'body-parser';
import bearerToken from 'express-bearer-token';
import IGeesomeGatewayModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";
import helpers from "./helpers.js";

export default async (app: IGeesomeApp) => {
	app.checkModules(['api']);
	const module = await getModule(app, process.env.GATEWAY_PORT || 2082);
	(await import('./api.js')).default(app, module);
	return module;
}

async function getModule(app: IGeesomeApp, port) {
	const service = express();

	const maxBodySizeMb = 2000;
	service.use(express.static('frontend/dist'));
	service.use(bodyParser.json({limit: maxBodySizeMb + 'mb'}));
	service.use(bodyParser.urlencoded({extended: true}));
	service.use(bearerToken());
	service.use(morgan('combined'));

	service.use(async (req, res, next) => {
		setHeaders(res);

		res.redirect = (url) => {
			//https://github.com/jkyberneees/ana/issues/16
			res.status(301).location(encodeURI(url)).send('');
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

	const server = await service.listen(port);

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
		stop(): any {
			try {
				server.close();
			} catch (e) {
				if (!e.message.includes('Server is not running')) {
					throw e;
				}
			}
		}
	}
	return new GeesomeGatewayModule(port);
}