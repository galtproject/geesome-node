import {IGeesomeApp} from "../../../interface";
import IGeesomeApiModule, {
	IApiModuleCommonOutput,
	IApiModuleGetInput,
	IApiModulePotInput
} from "./interface";
import {IUser} from "../../../../database/interface";

const _ = require('lodash');

module.exports = async (app: IGeesomeApp, options: any = {}) => {
	const module = await getModule(app, 'v1', process.env.PORT || app.config.port || 7711);
	require('./api')(app, module);
	return module;
}

async function getModule(app: IGeesomeApp, version, port) {
	const bodyParser = require('body-parser');
	const bearerToken = require('express-bearer-token');

	const service = require('restana')({
		ignoreTrailingSlash: true,
		maxParamLength: 2000,
		errorHandler(err, req, res) {
			console.log(`Something was wrong: ${err.message || err}`, err)
			res.send(err)
		}
	});

	const maxBodySizeMb = 2000;

	service.use(bodyParser.json({limit: maxBodySizeMb + 'mb'}));
	service.use(bodyParser.urlencoded({extended: true}));
	service.use(bearerToken());

	service.use(require('morgan')('combined'));

	service.use(async (req, res, next) => {
		setHeaders(res);

		req.query = {};
		if (_.includes(req.url, '?')) {
			const searchParams: any = new URLSearchParams(req.url.split('?')[1]);
			const keys = searchParams.keys();
			for (let key = keys.next(); key.done !== true; key = keys.next()) {
				req.query[key.value] = searchParams.get(key.value);
			}
		}
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

	class GeesomeApiModule implements IGeesomeApiModule {
		async handleCallback(req, res, callback) {
			try {
				await callback(reqToModuleInput(req), resToModuleOutput(res)).catch(error => {
					console.error(error);
					return res.send({message: error.message || error, errorCode: 3}, error.code || 500);
				});
			} catch (error) {
				console.error(error);
				return res.send({message: error.message || error, errorCode: 3}, error.code || 500);
			}
		}

		onGet(routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) {
			routeName = _.trimStart(routeName, '/');
			service.get(`/${version}/${routeName}`, (req, res) => this.handleCallback(req, res, callback));
		}

		onPost(routeName: string, callback: (req: IApiModulePotInput, res: IApiModuleCommonOutput) => any) {
			routeName = _.trimStart(routeName, '/');
			service.post(`/${version}/${routeName}`, (req, res) => this.handleCallback(req, res, callback));
		}

		onHead(routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) {
			routeName = _.trimStart(routeName, '/');
			service.head(`/${version}/${routeName}`, (req, res) => this.handleCallback(req, res, callback));
		}

		async authorizeAndHandleCallback(req: IApiModuleGetInput, res: IApiModuleCommonOutput, callback) {
			if (!req.token) {
				return res.send({error: "Need authorization token", errorCode: 1}, 401);
			}
			req.user = await app.getUserByApiKey(req.token);
			if (!req.user || !req.user.id) {
				return res.send({error: "Not authorized", errorCode: 2}, 401);
			}
			return this.handleCallback(req, res, callback);
		}

		onAuthorizedGet(routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) {
			this.onGet(routeName, async (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => {
				return this.authorizeAndHandleCallback(req, res, callback);
			});
		}

		onAuthorizedPost(routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) {
			this.onPost(routeName, (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => {
				return this.authorizeAndHandleCallback(req, res, callback);
			});
		}

		async handleAuthResult(res: IApiModuleCommonOutput, user: IUser) {
			if (user) {
				return res.send({user, apiKey: await app.generateUserApiKey(user.id, {type: "password_auth"}, true)}, 200);
			} else {
				return res.send(403);
			}
		}

		setStorageHeaders(res: IApiModuleCommonOutput) {
			res.setHeader('Cache-Control', 'public, max-age=31536000, stale-if-error=0');
			res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
			res.setHeader('Connection', 'close'); //TODO: determine the best solution https://serverfault.com/questions/708319/chrome-requests-get-stuck-pending
		}

		setDefaultHeaders(res: IApiModuleCommonOutput) {
			setHeaders(res)
		}

		prefix(routePrefix) {
			return {
				onGet: (routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) => {
					return this.onGet(routePrefix + routeName, callback);
				},
				onPost: (routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) => {
					return this.onPost(routePrefix + routeName, callback);
				},
				onHead: (routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) => {
					return this.onHead(routePrefix + routeName, callback);
				},
				onAuthorizedGet: (routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) => {
					return this.onAuthorizedGet(routePrefix + routeName, callback);
				},
				onAuthorizedPost: (routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) => {
					return this.onAuthorizedPost(routePrefix + routeName, callback);
				},
				prefix: this.prefix.bind(this),
				setDefaultHeaders: this.setDefaultHeaders.bind(this),
				setStorageHeaders: this.setStorageHeaders.bind(this),
				handleAuthResult: this.handleAuthResult.bind(this)
			} as IGeesomeApiModule
		}

		stop(): any {
			return service.close();
		}
	}

	function reqToModuleInput(req) {
		if (req.stream) {
			return req;
		}
		const input = {
			params: req.params,
			headers: req.headers,
			token: req.token,
			user: req.user,
			query: req.query,
			route: req.url.replace(version + '/', ''),
			fullRoute: req.originalUrl.replace(version + '/', ''),
			stream: req
		};
		if (req.body) {
			input['body'] = req.body;
		}
		return input;
	}

	function resToModuleOutput(res) {
		if (res.stream) {
			return res;
		}
		return {
			send: res.send.bind(res),
			setHeader: res.setHeader.bind(res),
			writeHead: res.writeHead.bind(res),
			stream: res,
		};
	}

	return new GeesomeApiModule();
}