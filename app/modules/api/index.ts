import _ from 'lodash';
import morgan from 'morgan';
import express from 'express';
import bodyParser from 'body-parser';
import bearerToken from 'express-bearer-token';
import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
import {IUser} from "../database/interface.js";
import IGeesomeApiModule, {
	IApiModuleCommonOutput,
	IApiModuleGetInput,
	IApiModulePotInput
} from "./interface.js";
const {trimStart} = _;

export default async (app: IGeesomeApp, options: any = {}) => {
	const module = await getModule(app, 'v1', process.env.PORT || app.config.port || 2052);
	(await import('./api.js')).default(app, module);
	return module;
}

async function getModule(app: IGeesomeApp, version, port) {
	const service = express();

	// Registry of routes for the discovery index (GET /v1) and OpenAPI spec.
	const registeredRoutes: {method: string, path: string, authorized?: boolean}[] = [];
	function trackRoute(method: string, path: string) {
		registeredRoutes.push({method, path});
	}
	function markLastRouteAuthorized() {
		const last = registeredRoutes[registeredRoutes.length - 1];
		if (last) {
			last.authorized = true;
		}
	}

	const maxBodySizeMb = 2000;
	service.use(express.static('frontend/dist'));
	service.use(bodyParser.json({limit: maxBodySizeMb + 'mb'}));
	service.use(bodyParser.urlencoded({extended: true}));
	service.use(bearerToken());
	if (helpers.isAccessLogEnabled()) {
		service.use(morgan('combined'));
	}

	service.use(async (req, res, next) => {
		setHeaders(res);

		req.query = {};
		if (req.url.includes('?')) {
			const searchParams: any = new URLSearchParams(req.url.split('?')[1]);
			const keys = searchParams.keys();
			for (let key = keys.next(); key.done !== true; key = keys.next()) {
				req.query[key.value] = searchParams.get(key.value);
			}
		}
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

	function setHeaders(res) {
		res.setHeader('Strict-Transport-Security', 'max-age=0');
		res.setHeader('Access-Control-Allow-Credentials', 'true');
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD");
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
		res.setHeader('Connection', 'close'); //TODO: determine the best solution https://serverfault.com/questions/708319/chrome-requests-get-stuck-pending
		// Point clients/agents at the API docs. Use the IPFS path (served at /ipfs/
		// regardless of any reverse-proxy prefix) so it is unambiguous; the JSON
		// discovery index is reachable at the API base root (GET /{version}).
		res.setHeader('X-Api-Docs', app.docsStorageId ? `/ipfs/${app.docsStorageId}` : 'https://github.com/galtproject/geesome-node');
	}

	class GeesomeApiModule implements IGeesomeApiModule {
		port;

		constructor(_port) {
			this.port = _port;
		}
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
			routeName = trimStart(routeName, '/');
			trackRoute('GET', `/${version}/${routeName}`);
			service.get(`/${version}/${routeName}`, (req, res) => this.handleCallback(req, res, callback));
		}

		onUnversionGet(routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) {
			routeName = trimStart(routeName, '/');
			trackRoute('GET', `/${routeName}`);
			service.get(`/${routeName}`, (req, res) => this.handleCallback(req, res, callback));
		}

		onPost(routeName: string, callback: (req: IApiModulePotInput, res: IApiModuleCommonOutput) => any) {
			routeName = trimStart(routeName, '/');
			trackRoute('POST', `/${version}/${routeName}`);
			service.post(`/${version}/${routeName}`, (req, res) => this.handleCallback(req, res, callback));
		}

		onHead(routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) {
			routeName = trimStart(routeName, '/');
			trackRoute('HEAD', `/${version}/${routeName}`);
			service.head(`/${version}/${routeName}`, (req, res) => this.handleCallback(req, res, callback));
		}

		onUnversionHead(routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) {
			routeName = trimStart(routeName, '/');
			trackRoute('HEAD', `/${routeName}`);
			service.head(`/${routeName}`, (req, res) => this.handleCallback(req, res, callback));
		}

		async authorizeAndHandleCallback(req: IApiModuleGetInput, res: IApiModuleCommonOutput, callback) {
			if (!req.token) {
				return res.send({error: "Need authorization token", errorCode: 1}, 401);
			}
			const {user, apiKey} = await app.getUserByApiToken(req.token);
			req.user = user;
			req.apiKey = apiKey;
			if (!req.user || !req.user.id) {
				return res.send({error: "Not authorized", errorCode: 2}, 401);
			}
			return app.runWithApiKey(apiKey, () => this.handleCallback(req, res, callback));
		}

		onAuthorizedGet(routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) {
			this.onGet(routeName, async (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => {
				return this.authorizeAndHandleCallback(req, res, callback);
			});
			markLastRouteAuthorized();
		}

		onAuthorizedPost(routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) {
			this.onPost(routeName, (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => {
				return this.authorizeAndHandleCallback(req, res, callback);
			});
			markLastRouteAuthorized();
		}

		async handleAuthResult(res: IApiModuleCommonOutput, user: IUser) {
			if (user) {
				return res.send({user, apiKey: await app.generateUserApiKey(user.id, {type: "password_auth"}, true)}, 200);
			} else {
				return res.send(403);
			}
		}

		setStorageHeaders(res: IApiModuleCommonOutput) {
			//TODO: store max-age cache to content database?
			res.setHeader('Cache-Control', 'public, max-age=3600, stale-if-error=0');
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
			try {
				server.close();
			} catch (e) {
				if (!e.message.includes('Server is not running')) {
					throw e;
				}
			}
		}

		reqToModuleInput(req) {
			return reqToModuleInput(req);
		}

		resToModuleOutput(res) {
			return resToModuleOutput(res);
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

	const apiModule = new GeesomeApiModule(port);

	// OpenAPI 3 document built from the live route registry. It lists every
	// operation, path params, and which require a bearer token, and points to the
	// full apiDoc (params/examples) on IPFS via x-docs-ipfs. Served as JSON so
	// tooling/agents can consume it directly.
	// Hand-authored request bodies for the upload operations (the registry has no
	// param schemas). Documents the multipart fields and the driver option,
	// including driver:{"raw":true} for byte-exact / no-transcode uploads.
	const driverProp = {
		type: 'string',
		description: 'Source/processing driver. A name like "youtubeVideo", or a JSON object string {"name?","params?","raw?"}. Set {"raw":true} to store the original bytes unchanged (no video transcoding, no preview generation) so the stored content CID equals the uploaded file.',
		example: '{"raw":true}',
	};
	const asyncProp = {type: 'boolean', description: 'Process in the background; the response then returns {asyncOperationId, channel} instead of the content object.'};
	const operationOverlay = {
		'POST /user/save-file': {
			summary: 'Store a file (multipart form-data).',
			requestBody: {required: true, content: {'multipart/form-data': {schema: {type: 'object', required: ['file'], properties: {
				file: {type: 'string', format: 'binary', description: 'File to store.'},
				driver: driverProp,
				path: {type: 'string', description: 'Virtual path / filename in the user file catalog.'},
				groupId: {type: 'string'},
				folderId: {type: 'integer'},
				async: asyncProp,
			}}}}},
		},
		'POST /user/save-data': {
			summary: 'Store data (string or buffer) as JSON.',
			requestBody: {required: true, content: {'application/json': {schema: {type: 'object', required: ['content'], properties: {
				content: {description: 'Raw content to store (string or buffer).'},
				fileName: {type: 'string'},
				mimeType: {type: 'string'},
				driver: driverProp,
				groupId: {type: 'string'},
				folderId: {type: 'integer'},
				path: {type: 'string'},
				async: asyncProp,
			}}}}},
		},
		'POST /user/save-data-by-url': {
			summary: 'Download and store data from a URL.',
			requestBody: {required: true, content: {'application/json': {schema: {type: 'object', required: ['url'], properties: {
				url: {type: 'string'},
				driver: driverProp,
				mimeType: {type: 'string'},
				groupId: {type: 'string'},
				folderId: {type: 'integer'},
				path: {type: 'string'},
				async: asyncProp,
			}}}}},
		},
	};
	function buildOpenApi() {
		const versionPrefix = `/${version}`;
		const paths = {};
		for (const route of registeredRoutes) {
			if (!route.path.startsWith(versionPrefix + '/')) {
				continue;
			}
			const parameters = [];
			const specPath = route.path.slice(versionPrefix.length).replace(/:([A-Za-z0-9_]+)/g, (_m, name) => {
				parameters.push({name, in: 'path', required: true, schema: {type: 'string'}});
				return `{${name}}`;
			});
			const operation: any = {responses: {'200': {description: 'OK'}}};
			if (parameters.length) {
				operation.parameters = parameters;
			}
			if (route.authorized) {
				operation.security = [{bearerAuth: []}];
			}
			const overlay = operationOverlay[`${route.method} ${specPath}`];
			if (overlay) {
				Object.assign(operation, overlay);
			}
			paths[specPath] = paths[specPath] || {};
			paths[specPath][route.method.toLowerCase()] = operation;
		}
		return {
			openapi: '3.0.3',
			info: {
				title: 'GeeSome Node API',
				version,
				description: 'Operation/route map generated from the live node. Full parameter and response details (apiDoc) are published to IPFS on each boot — see x-docs-ipfs and the GET /' + version + ' discovery index.',
			},
			servers: [
				{url: `/${version}`, description: 'Direct node'},
				{url: `/api/${version}`, description: 'Behind the bundled nginx reverse proxy'},
			],
			'x-docs-ipfs': app.docsStorageId ? `/ipfs/${app.docsStorageId}` : null,
			components: {securitySchemes: {bearerAuth: {type: 'http', scheme: 'bearer'}}},
			paths,
		};
	}
	const openapiHandler = (req, res) => res.send(buildOpenApi(), 200);
	apiModule.onGet('openapi.json', openapiHandler);
	// Also serve at conventional unversioned paths an agent is likely to guess, so
	// they return the real spec instead of being shadowed by the frontend SPA.
	['openapi.json', 'swagger.json', 'api-docs.json', '.well-known/openapi.json'].forEach((p) => apiModule.onUnversionGet(p, openapiHandler));

	// Machine-readable discovery index so an agent with only the node URL can find
	// the route map and the published API docs. Served at GET /{version} and
	// /{version}/ (e.g. /api/v1 behind nginx). Fast JSON, never the SPA shell.
	const discoveryHandler = (req, res) => res.send({
		name: 'geesome-node',
		version,
		docs: {
			description: 'Full API reference (apiDoc) is generated and published to IPFS on each node boot.',
			openapi: `/${version}/openapi.json`,
			ipfsStorageId: app.docsStorageId || null,
			ipfsPath: app.docsStorageId ? `/ipfs/${app.docsStorageId}` : null,
			repo: 'https://github.com/galtproject/geesome-node',
		},
		routesCount: registeredRoutes.length,
		routes: registeredRoutes,
	}, 200);
	apiModule.onGet('', discoveryHandler);
	apiModule.onUnversionGet(version, discoveryHandler);

	return apiModule;
}
