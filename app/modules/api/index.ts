import _ from 'lodash';
import morgan from 'morgan';
import express from 'express';
import bodyParser from 'body-parser';
import bearerToken from 'express-bearer-token';
import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
import {buildOpenApiFromApiDoc, getApiDocData} from "../../apiDocSpec.js";
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
	service.use(bodyParser.json({
		limit: maxBodySizeMb + 'mb',
		type: ['application/json', 'application/*+json'],
		verify: captureRawBody
	}));
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
		const docsLinks = buildDocsDiscoveryLinks(version, app.docsStorageId);
		setDocsHeaders(res, docsLinks);
	}

	class GeesomeApiModule implements IGeesomeApiModule {
		port;

		constructor(_port) {
			this.port = _port;
		}
		async handleCallback(req, res, callback) {
			try {
				await Promise.resolve(callback(reqToModuleInput(req), resToModuleOutput(res)));
			} catch (error) {
				const callbackError = error as any;
				console.error(error);
				if (isResponseClosed(res)) {
					return;
				}
				const statusCode = Number.isInteger(callbackError?.code) ? callbackError.code : 500;
				const body = {message: callbackError.message || callbackError, errorCode: 3};
				if (typeof res.status === 'function') {
					return res.status(statusCode).send(body);
				}
				return res.send(body, statusCode);
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

		onUnversionPost(routeName: string, callback: (req: IApiModulePotInput, res: IApiModuleCommonOutput) => any) {
			routeName = trimStart(routeName, '/');
			trackRoute('POST', `/${routeName}`);
			service.post(`/${routeName}`, (req, res) => this.handleCallback(req, res, callback));
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
				onUnversionGet: (routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) => {
					return this.onUnversionGet(routePrefix + routeName, callback);
				},
				onPost: (routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) => {
					return this.onPost(routePrefix + routeName, callback);
				},
				onUnversionPost: (routeName: string, callback: (req: IApiModulePotInput, res: IApiModuleCommonOutput) => any) => {
					return this.onUnversionPost(routePrefix + routeName, callback);
				},
				onHead: (routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) => {
					return this.onHead(routePrefix + routeName, callback);
				},
				onUnversionHead: (routeName: string, callback: (req: IApiModuleGetInput, res: IApiModuleCommonOutput) => any) => {
					return this.onUnversionHead(routePrefix + routeName, callback);
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
		if (req.rawBody) {
			input['rawBody'] = req.rawBody;
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

	function isResponseClosed(res) {
		return res.headersSent || res.writableEnded || res.stream?.headersSent || res.stream?.writableEnded;
	}

	function captureRawBody(req, _res, buf) {
		if (!shouldCaptureRawBody(req)) {
			return;
		}
		req.rawBody = buf;
	}

	function shouldCaptureRawBody(req) {
		const method = String(req.method || '').toUpperCase();
		if (method !== 'POST') {
			return false;
		}
		const url = String(req.originalUrl || req.url || '');
		const path = url.split('?')[0];
		if (path.startsWith('/ap/')) {
			return true;
		}
		return Boolean(req.headers?.signature || req.headers?.digest || req.headers?.['content-digest']);
	}

	const apiModule = new GeesomeApiModule(port);

	// OpenAPI 3 document built from the live route registry. It lists every
	// operation, path params, and which require a bearer token, and points to the
	// full apiDoc (params/examples) on IPFS via x-docs-ipfs. Served as JSON so
	// tooling/agents can consume it directly.
	// Fallback spec built only from the route registry (method/path/auth), used if
	// apiDoc parsing is unavailable at runtime. The primary spec is generated from
	// the apiDoc annotations via buildOpenApiFromApiDoc (full param schemas).
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
	// Primary spec is generated from the node's apiDoc annotations (full param
	// schemas); fall back to the route-registry map if apiDoc parsing is
	// unavailable at runtime.
	const openapiHandler = (req, res) => res.send(buildOpenApiFromApiDoc(version, app.docsStorageId) || buildOpenApi());
	apiModule.onGet('openapi.json', openapiHandler);
	// Raw apiDoc data (native format) for clients that prefer it.
	apiModule.onGet('apidoc.json', (req, res) => res.send(getApiDocData() || []));
	// Also serve at conventional unversioned paths an agent is likely to guess, so
	// they return the real spec instead of being shadowed by the frontend SPA.
	['openapi.json', 'swagger.json', 'api-docs.json', '.well-known/openapi.json'].forEach((p) => apiModule.onUnversionGet(p, openapiHandler));

	// Machine-readable discovery index so an agent with only the node URL can find
	// the route map and the published API docs. Served at GET /{version} and
	// /{version}/ (e.g. /api/v1 behind nginx). Fast JSON, never the SPA shell.
	const discoveryHandler = (req, res) => {
		const docsLinks = buildDocsDiscoveryLinks(version, app.docsStorageId);
		return res.send({
			name: 'geesome-node',
			version,
			docs: {
				description: 'Full API reference (apiDoc) is generated and published to IPFS on each node boot.',
				discovery: docsLinks.discovery,
				openapi: docsLinks.openapi,
				apidoc: docsLinks.apidoc,
				apiHtml: docsLinks.apiHtml,
				repoDocs: docsLinks.repoDocs,
				moduleDocs: docsLinks.moduleDocs,
				agentMap: docsLinks.agentMap,
				conventionalOpenapi: docsLinks.conventionalOpenapi,
				ipfsStorageId: app.docsStorageId || null,
				ipfsPath: docsLinks.ipfsRoot,
				repo: docsLinks.repo,
			},
			routesCount: registeredRoutes.length,
			routes: registeredRoutes,
		});
	};
	apiModule.onGet('', discoveryHandler);
	apiModule.onUnversionGet(version, discoveryHandler);

	return apiModule;
}

function buildDocsDiscoveryLinks(version: string, docsStorageId?: string) {
	const repo = 'https://github.com/galtproject/geesome-node';
	const docsRepoRoot = `${repo}/tree/master/docs`;
	const docsRepoBlob = `${repo}/blob/master/docs`;
	const ipfsRoot = docsStorageId ? `/ipfs/${docsStorageId}` : null;
	return {
		repo,
		discovery: `/${version}`,
		openapi: `/${version}/openapi.json`,
		apidoc: `/${version}/apidoc.json`,
		apiHtml: ipfsRoot || docsRepoRoot,
		repoDocs: ipfsRoot ? `${ipfsRoot}/README.md` : `${docsRepoBlob}/README.md`,
		moduleDocs: ipfsRoot ? `${ipfsRoot}/modules.md` : `${docsRepoBlob}/modules.md`,
		agentMap: ipfsRoot ? `${ipfsRoot}/agent-map.md` : `${docsRepoBlob}/agent-map.md`,
		ipfsRoot,
		conventionalOpenapi: {
			openapi: '/openapi.json',
			swagger: '/swagger.json',
			apiDocs: '/api-docs.json',
			wellKnown: '/.well-known/openapi.json',
		},
	};
}

function setDocsHeaders(res, docsLinks) {
	res.setHeader('X-Api-Docs', docsLinks.apiHtml);
	res.setHeader('X-Api-Docs-Openapi', docsLinks.openapi);
	res.setHeader('X-Api-Docs-Discovery', docsLinks.discovery);
	if (docsLinks.ipfsRoot) {
		res.setHeader('X-Api-Docs-Ipfs', docsLinks.ipfsRoot);
	}
	res.setHeader('Link', [
		`<${docsLinks.openapi}>; rel="service-desc"; type="application/openapi+json"`,
		`<${docsLinks.repoDocs}>; rel="describedby"; type="text/markdown"`,
		`<${docsLinks.moduleDocs}>; rel="describedby"; type="text/markdown"`,
	].join(', '));
}
