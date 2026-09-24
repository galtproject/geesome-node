import apidoc from 'apidoc';

// Parse the node's own apiDoc annotations (the same source publish-docs renders)
// once and cache them, so the OpenAPI spec is generated from the real param
// definitions instead of being hand-authored. Returns null if parsing is not
// possible at runtime (e.g. source not present) so callers can fall back.
let cachedData: any[] | null = null;
let parseAttempted = false;

export function getApiDocData(): any[] | null {
  if (parseAttempted) {
    return cachedData;
  }
  parseAttempted = true;
  try {
    const doc: any = apidoc.createDoc({src: ['app/modules'], dryRun: true, silent: true});
    if (doc && doc.data) {
      cachedData = JSON.parse(doc.data);
    }
  } catch (e) {
    console.error('apidoc_parse_error', e.message);
  }
  return cachedData;
}

function stripHtml(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const text = value
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .trim();
  return text || undefined;
}

const TYPE_MAP: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  object: 'object',
  date: 'string',
};

function fieldSchema(field: any): any {
  if (field.field === 'file' || (field.type || '').toLowerCase() === 'file') {
    return {type: 'string', format: 'binary'};
  }
  const mapped = TYPE_MAP[(field.type || '').toLowerCase()];
	const base: any = mapped ? {type: mapped} : {};
	if (field.allowedValues?.length) {
		base.enum = field.allowedValues.map((value: string) => value.replace(/^\"|\"$/g, ''));
	}
	if (field.defaultValue !== undefined) {
		base.default = field.defaultValue;
	}
  if (field.isArray) {
    return {type: 'array', items: base};
  }
  return base;
}

function objectSchema(fields: any[]): any {
	const properties: any = {};
	const required: string[] = [];
	for (const field of fields) {
		const schema = fieldSchema(field);
		const description = stripHtml(field.description);
		if (description) {
			schema.description = description;
		}
		properties[field.field] = schema;
		if (!field.optional) {
			required.push(field.field);
		}
	}
	return {type: 'object', properties, ...(required.length ? {required} : {})};
}

const OPERATION_SCOPES: Record<string, string[]> = {
	AssetCreate: ['assets:write'],
	AssetGet: ['assets:read-private'],
	AssetBatchCreate: ['asset-batches:write'],
	AssetBatchGet: ['asset-batches:write'],
	AssetBatchComplete: ['asset-batches:write'],
	OperationGet: ['operations:read'],
	OperationCancel: ['operations:read']
};

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'];

// Build an OpenAPI 3 document from the parsed apiDoc data: paths, path params,
// request bodies (multipart when a file field is present, else JSON), bearer
// security when an Authorization header is documented, and summaries/tags.
export function buildOpenApiFromApiDoc(version: string, docsStorageId?: string, publicApiBaseUrl?: string): any | null {
  const data = getApiDocData();
  if (!data) {
    return null;
  }
  const versionPrefix = `/${version}`;
  const paths: any = {};
  for (const endpoint of data) {
    if (!endpoint.url || !endpoint.type) {
      continue;
    }
    const method = endpoint.type.toLowerCase();
    if (!HTTP_METHODS.includes(method)) {
      continue;
    }
    let relative = endpoint.url;
    if (relative.startsWith(versionPrefix + '/')) {
      relative = relative.slice(versionPrefix.length);
    } else if (relative === versionPrefix) {
      relative = '/';
    }
    const pathParams: string[] = [];
    const specPath = relative.replace(/:([A-Za-z0-9_]+)/g, (_m: string, name: string) => {
      pathParams.push(name);
      return `{${name}}`;
    });

    const operation: any = {responses: {}};
    if (endpoint.name) {
      operation.operationId = endpoint.name;
		if (OPERATION_SCOPES[endpoint.name]) {
			operation['x-required-scopes'] = OPERATION_SCOPES[endpoint.name];
		}
    }
    if (endpoint.title) {
      operation.summary = endpoint.title;
    }
    const description = stripHtml(endpoint.description);
    if (description) {
      operation.description = description;
    }
    if (endpoint.group) {
      operation.tags = [endpoint.group];
    }
    if (pathParams.length) {
      operation.parameters = pathParams.map((name) => ({name, in: 'path', required: true, schema: {type: 'string'}}));
    }
    const headerFields = (endpoint.header && endpoint.header.fields && endpoint.header.fields.Header) || [];
    if (headerFields.some((h: any) => h.field === 'Authorization')) {
      operation.security = [{bearerAuth: []}];
    }
		for (const field of headerFields.filter((item: any) => item.field !== 'Authorization')) {
			operation.parameters = operation.parameters || [];
			operation.parameters.push({name: field.field, in: 'header', required: !field.optional, schema: fieldSchema(field), description: stripHtml(field.description)});
		}
    const body = endpoint.body || [];
    if (body.length && method !== 'get' && method !== 'head') {
      const isMultipart = body.some((b: any) => b.field === 'file' || (b.type || '').toLowerCase() === 'file');
      const contentType = isMultipart ? 'multipart/form-data' : 'application/json';
		operation.requestBody = {required: body.some((field: any) => !field.optional), content: {[contentType]: {schema: objectSchema(body)}}};
    }
		const successGroups = endpoint.success?.fields || {};
		for (const [status, fields] of Object.entries(successGroups)) {
			operation.responses[status] = {description: status === '201' ? 'Created' : 'Success', content: {'application/json': {schema: objectSchema(fields as any[])}}};
		}
		const errorGroups = endpoint.error?.fields || {};
		for (const status of Object.keys(errorGroups)) {
			operation.responses[status] = {description: 'API problem', content: {'application/problem+json': {schema: {$ref: '#/components/schemas/ApiProblem'}}}};
		}
		if (!Object.keys(operation.responses).length) {
			operation.responses['200'] = {description: 'OK'};
		}
		if (operation.security) {
			operation.responses['403'] ||= {description: 'Insufficient scope', content: {'application/problem+json': {schema: {$ref: '#/components/schemas/ApiProblem'}}}};
		}

    paths[specPath] = paths[specPath] || {};
    paths[specPath][method] = operation;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'GeeSome Node API',
      version,
      description: "Generated from the node's apiDoc annotations. The full human reference is also published to IPFS on each boot (see x-docs-ipfs).",
    },
    servers: getOpenApiServers(version, publicApiBaseUrl),
    'x-docs-ipfs': docsStorageId ? `/ipfs/${docsStorageId}` : null,
		components: {
			securitySchemes: {bearerAuth: {type: 'http', scheme: 'bearer'}},
			schemas: {ApiProblem: {
				type: 'object',
				required: ['type', 'title', 'status', 'code', 'requestId'],
				properties: {
					type: {type: 'string'}, title: {type: 'string'}, status: {type: 'integer'},
					code: {type: 'string'}, detail: {type: 'string'}, requestId: {type: 'string'}
				}
			}}
		},
    paths,
  };
}

function getOpenApiServers(version: string, publicApiBaseUrl?: string) {
  if (publicApiBaseUrl) {
    return [{url: publicApiBaseUrl, description: 'Advertised public API'}];
  }
  return [
    {url: `/${version}`, description: 'Direct node'},
    {url: `/api/${version}`, description: 'Behind the bundled nginx reverse proxy'},
  ];
}
