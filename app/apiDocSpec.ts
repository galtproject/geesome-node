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
  if (field.isArray) {
    return {type: 'array', items: base};
  }
  return base;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'];

// Build an OpenAPI 3 document from the parsed apiDoc data: paths, path params,
// request bodies (multipart when a file field is present, else JSON), bearer
// security when an Authorization header is documented, and summaries/tags.
export function buildOpenApiFromApiDoc(version: string, docsStorageId?: string): any | null {
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

    const operation: any = {responses: {'200': {description: 'OK'}}};
    if (endpoint.name) {
      operation.operationId = endpoint.name;
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
    const body = endpoint.body || [];
    if (body.length && method !== 'get' && method !== 'head') {
      const isMultipart = body.some((b: any) => b.field === 'file' || (b.type || '').toLowerCase() === 'file');
      const properties: any = {};
      for (const field of body) {
        const schema = fieldSchema(field);
        const fieldDescription = stripHtml(field.description);
        if (fieldDescription) {
          schema.description = fieldDescription;
        }
        properties[field.field] = schema;
      }
      const contentType = isMultipart ? 'multipart/form-data' : 'application/json';
      operation.requestBody = {content: {[contentType]: {schema: {type: 'object', properties}}}};
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
    servers: [
      {url: `/${version}`, description: 'Direct node'},
      {url: `/api/${version}`, description: 'Behind the bundled nginx reverse proxy'},
    ],
    'x-docs-ipfs': docsStorageId ? `/ipfs/${docsStorageId}` : null,
    components: {securitySchemes: {bearerAuth: {type: 'http', scheme: 'bearer'}}},
    paths,
  };
}
