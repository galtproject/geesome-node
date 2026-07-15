import morgan from 'morgan';
import express from 'express';
import bodyParser from 'body-parser';
import bearerToken from 'express-bearer-token';
import IGeesomeGatewayModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";
import appHelpers from "../../helpers.js";
import {trackRuntimeHttpRequest} from '../../memoryProfiler.js';
import {closeHttpServer} from '../../httpServer.js';
import gatewayHelpers from "./helpers.js";
import {cleanupAndRethrow} from '../../resourceCleanup.js';

export default async (app: IGeesomeApp, options: {registerApi?: boolean, port?: number | string} = {}) => {
	app.checkModules(['api']);
	const module = await getModule(app, options.port || process.env.GATEWAY_PORT || 2082);
	try {
		if (options.registerApi !== false) {
			(await import('./api.js')).default(app, module);
		}
		return module;
	} catch (error) {
		return cleanupAndRethrow(error, 'gateway_bootstrap', () => module.stop());
	}
}

async function getModule(app: IGeesomeApp, port) {
	const service = express();

	const maxBodySizeMb = 2000;
	service.use(express.static('frontend/dist'));
	service.use(bodyParser.json({limit: maxBodySizeMb + 'mb'}));
	service.use(bodyParser.urlencoded({extended: true}));
	service.use(bearerToken());
	if (appHelpers.isAccessLogEnabled()) {
		service.use(morgan('combined'));
	}
	service.use((req, res, next) => {
		trackRuntimeHttpRequest('gateway', req, res);
		next();
	});

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
		next();
	});

	const server = await service.listen(port);
	let stopPromise: Promise<void> | null = null;

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
			return gatewayHelpers.getDnsLinkPathFromHost(req.headers.host);
		}
		onGetRequest(callback) {
			service.get("/*", (req, res) => {
				setHeaders(res);
				callback(app.ms.api.reqToModuleInput(req), app.ms.api.resToModuleOutput(res));
			});
		}
		onHeadRequest(callback) {
			service.head("/*", (req, res) => {
				setHeaders(res);
				callback(app.ms.api.reqToModuleInput(req), app.ms.api.resToModuleOutput(res));
			});
		}
		stop(): Promise<void> {
			if (!stopPromise) {
				stopPromise = closeHttpServer(server);
			}
			return stopPromise;
		}
	}
	return new GeesomeGatewayModule(port);
}
