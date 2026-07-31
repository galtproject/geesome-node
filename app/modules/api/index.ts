import _ from 'lodash';
import morgan from 'morgan';
import express from 'express';
import bodyParser from 'body-parser';
import bearerToken from 'express-bearer-token';
import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
import {trackRuntimeHttpRequest} from '../../memoryProfiler.js';
import {closeHttpServer} from '../../httpServer.js';
import {buildOpenApiFromApiDoc, getApiDocData} from "../../apiDocSpec.js";
import {IUser} from "../database/interface.js";
import {cleanupAndRethrow} from '../../resourceCleanup.js';
import {ApiProblemError, getRequestId, sendApiProblem, sendResponse} from './problem.js';
import {getPublicApiContext} from './publicUrls.js';
import IGeesomeApiModule, {
	IApiModuleCommonOutput,
	IApiModuleGetInput,
	IApiModulePotInput
} from "./interface.js";
const {trimStart} = _;

export default async (app: IGeesomeApp, options: any = {}) => {
	const module = await getModule(app, 'v1', options.port || process.env.PORT || app.config.port || 2052, options.host || '0.0.0.0');
	try {
		await (options.registerRoutes || registerApiRoutes)(app, module);
		return module;
	} catch (error) {
		return cleanupAndRethrow(error, 'api_bootstrap', () => module.stop());
	}
}

async function getModule(app: IGeesomeApp, version, port, host) {
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
	service.use((req, res, next) => {
		const requestId = getRequestId(req.headers['x-request-id'] as string);
		req.requestId = requestId;
		res.locals.requestId = requestId;
		res.setHeader('X-Request-Id', requestId);
		trackRuntimeHttpRequest('api', req, res);
		next();
	});

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

	const server = await service.listen(port, host);
	let stopPromise: Promise<void> | null = null;

	function setHeaders(res) {
		res.setHeader('Strict-Transport-Security', 'max-age=0');
		res.setHeader('Access-Control-Allow-Credentials', 'true');
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD");
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, Idempotency-Key, X-Request-Id, X-Requested-With');
		res.setHeader('Access-Control-Expose-Headers', 'Content-Digest, ETag, Link, Location, Retry-After, X-Geesome-Storage-Id, X-Request-Id');
		res.setHeader('Connection', 'close'); //TODO: determine the best solution https://serverfault.com/questions/708319/chrome-requests-get-stuck-pending
		// Point clients/agents at the API docs. Use the IPFS path (served at /ipfs/
		// regardless of any reverse-proxy prefix) so it is unambiguous; the JSON
		// discovery index is reachable at the API base root (GET /{version}).
		const docsLinks = buildDocsDiscoveryLinks(version, app.docsStorageId, getPublicApiContext(app, version, port));
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
				return sendApiProblem(res, callbackError, req.requestId);
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
				return sendApiProblem(res, new ApiProblemError(401, 'credentials_required', 'Credentials required', 'Supply a bearer token in the Authorization header.'), req.requestId);
			}
			const {user, apiKey} = await app.getUserByApiToken(req.token);
			req.user = user;
			req.apiKey = apiKey;
			if (!req.user || !req.user.id) {
				return sendApiProblem(res, new ApiProblemError(401, 'invalid_credentials', 'Invalid credentials', 'The supplied bearer token is invalid, expired, or revoked.'), req.requestId);
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

		stop(): Promise<void> {
			if (!stopPromise) {
				stopPromise = closeHttpServer(server);
			}
			return stopPromise;
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
			requestId: req.requestId || req.locals?.requestId,
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
		const sendWithStatus = (data, status?) => {
			if (status === undefined && typeof data === 'number' && data >= 400 && data <= 599) {
				return res.status(data).send();
			}
			return sendResponse(res, data, status);
		};
		return {
			send: sendWithStatus,
			sendWithStatus,
			setHeader: res.setHeader.bind(res),
			writeHead: res.writeHead.bind(res),
			stream: res,
			requestId: res.locals?.requestId,
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
			servers: [{url: getPublicApiContext(app, version, port).apiBaseUrl, description: 'Advertised public API'}],
			'x-docs-ipfs': app.docsStorageId ? `/ipfs/${app.docsStorageId}` : null,
			components: {securitySchemes: {bearerAuth: {type: 'http', scheme: 'bearer'}}},
			paths,
		};
	}
	// Primary spec is generated from the node's apiDoc annotations (full param
	// schemas); fall back to the route-registry map if apiDoc parsing is
	// unavailable at runtime.
	const openapiHandler = (req, res) => {
		const publicApiBaseUrl = getPublicApiContext(app, version, port).apiBaseUrl;
		return res.send(buildOpenApiFromApiDoc(version, app.docsStorageId, publicApiBaseUrl) || buildOpenApi());
	};
	apiModule.onGet('openapi.json', openapiHandler);
	// Raw apiDoc data (native format) for clients that prefer it.
	apiModule.onGet('apidoc.json', (req, res) => res.send(getApiDocData() || []));
	// Also serve at conventional unversioned paths an agent is likely to guess, so
	// they return the real spec instead of being shadowed by the frontend SPA.
	['openapi.json', 'swagger.json', 'api-docs.json', '.well-known/openapi.json'].forEach((p) => apiModule.onUnversionGet(p, openapiHandler));

	/**
	 * @api {get} /.well-known/geesome Discover GeeSome public API
	 * @apiName GeesomeDiscovery
	 * @apiGroup Discovery
	 * @apiDescription Returns absolute public API, gateway, documentation, health, capability, compatibility, and storage-characteristic links for automated clients.
	 * @apiSuccess {Number} schemaVersion Discovery schema version.
	 * @apiSuccess {String} product Product identifier.
	 * @apiSuccess {String} apiVersion API version.
	 * @apiSuccess {String} apiBaseUrl Absolute public API base URL.
	 * @apiSuccess {String} gatewayBaseUrl Absolute public gateway base URL.
	 * @apiSuccess {String} openapiUrl Absolute OpenAPI URL.
	 */
	const wellKnownDiscoveryHandler = (req, res) => res.send(buildPublicDiscovery(app, version, port));
	apiModule.onUnversionGet('.well-known/geesome', wellKnownDiscoveryHandler);

	/**
	 * @api {get} /v1/health Get API health
	 * @apiName ApiHealth
	 * @apiGroup Discovery
	 * @apiSuccess {Boolean} ok Whether the HTTP API is serving requests.
	 * @apiSuccess {String} apiVersion API version.
	 */
	apiModule.onGet('health', (req, res) => res.send({ok: true, apiVersion: version}));

	// Machine-readable discovery index so an agent with only the node URL can find
	// the route map and the published API docs. Served at GET /{version} and
	// /{version}/ (e.g. /api/v1 behind nginx). Fast JSON, never the SPA shell.
	const discoveryHandler = (req, res) => {
		const publicDiscovery = buildPublicDiscovery(app, version, port);
		const docsLinks = buildDocsDiscoveryLinks(version, app.docsStorageId, getPublicApiContext(app, version, port));
		return res.send({
			name: 'geesome-node',
			version,
			publicDiscovery,
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

function buildDocsDiscoveryLinks(version: string, docsStorageId?: string, publicContext?: any) {
	const repo = 'https://github.com/galtproject/geesome-node';
	const docsRepoRoot = `${repo}/tree/master/docs`;
	const docsRepoBlob = `${repo}/blob/master/docs`;
	const origin = publicContext?.publicUrl || '';
	const apiBaseUrl = publicContext?.apiBaseUrl || `${origin}/${version}`;
	const ipfsRoot = docsStorageId ? `${origin}/ipfs/${docsStorageId}` : null;
	return {
		repo,
		discovery: `${apiBaseUrl}`,
		openapi: `${apiBaseUrl}/openapi.json`,
		apidoc: `${apiBaseUrl}/apidoc.json`,
		apiHtml: ipfsRoot || docsRepoRoot,
		repoDocs: ipfsRoot ? `${ipfsRoot}/README.md` : `${docsRepoBlob}/README.md`,
		moduleDocs: ipfsRoot ? `${ipfsRoot}/modules.md` : `${docsRepoBlob}/modules.md`,
		agentMap: ipfsRoot ? `${ipfsRoot}/agent-map.md` : `${docsRepoBlob}/agent-map.md`,
		ipfsRoot,
		conventionalOpenapi: {
			openapi: `${origin}/openapi.json`,
			swagger: `${origin}/swagger.json`,
			apiDocs: `${origin}/api-docs.json`,
			wellKnown: `${origin}/.well-known/openapi.json`,
		},
	};
}

function buildPublicDiscovery(app: IGeesomeApp, version: string, port: number | string) {
	const context = getPublicApiContext(app, version, port);
	const docsLinks = buildDocsDiscoveryLinks(version, app.docsStorageId, context);
	const maxUploadBytes = parsePositiveNumber(app.config?.apiConfig?.maxUploadBytes);
	return {
		schemaVersion: 1,
		product: 'geesome',
		deploymentVersion: app.config?.apiConfig?.deploymentVersion || 'unknown',
		apiVersion: version,
		apiBaseUrl: context.apiBaseUrl,
		gatewayBaseUrl: context.publicUrl,
		openapiUrl: docsLinks.openapi,
		docsUrl: docsLinks.apiHtml,
		healthUrl: `${context.apiBaseUrl}/health`,
		capabilities: {
			contentUpload: Boolean(app.ms.content),
			rawContentUpload: Boolean(app.ms.content),
			assetUpload: Boolean(app.ms['asset']),
			asyncOperations: Boolean(app.ms.asyncOperation),
			batchContentUpload: Boolean(app.ms['asset']?.supportsBatches)
		},
		limits: {
			maxUploadBytes
		},
		storage: {
			identity: 'cid',
			immediateRead: true,
			pinPolicy: app.ms['pin'] ? 'deployment-configured' : 'local-storage',
			rangeRequests: true,
			contentDigest: 'sha-256'
		},
		compatibility: {
			changelogUrl: 'https://github.com/galtproject/geesome-node/commits/dev',
			migrationNotesUrl: `${docsLinks.repoDocs.replace(/README\.md$/, 'implemented.md')}`
		}
	};
}

function parsePositiveNumber(value): number | null {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return null;
	}
	return Math.floor(parsed);
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

async function registerApiRoutes(app, module) {
	(await import('./api.js')).default(app, module);
}
