import fs from 'node:fs';
import path from 'node:path';

type RouteRow = {
  moduleName: string;
  source: string;
  method: string;
  route: string;
  auth: string;
  permissions: string[];
  notes: string[];
};

const rootDir = process.cwd();
const modulesDir = path.join(rootDir, 'app/modules');
const outputPath = path.join(rootDir, 'docs/security-route-inventory.md');
const args = new Set(process.argv.slice(2));

function walkApiFiles(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkApiFiles(fullPath);
    }
    return entry.isFile() && entry.name === 'api.ts' ? [fullPath] : [];
  }).sort();
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function normalizeRoute(route: string): string {
  return route.replace(/^\/+/, '');
}

function methodFor(registration: string): string {
  if (registration.includes('Post')) {
    return 'POST';
  }
  if (registration.includes('Head')) {
    return 'HEAD';
  }
  return 'GET';
}

function routePrefixFor(registration: string): string {
  return registration.includes('Unversion') ? '/' : '/v1/';
}

function extractPermissions(block: string): string[] {
  const routeBlock = block.replace(/\nasync function can(?:Read|Manage)AdminStorageSpace[\s\S]*$/g, '');
  const permissions = new Set<string>();
  const permissionRegex = /app\.(?:checkUserCan|isUserCan|isAdminCan|isUserCanByUserPermissionOnly|isAdminCanByUserPermissionOnly)\([^)]*,\s*(CorePermissionName\.\w+|['"`][^'"`]+['"`])/g;
  for (const match of routeBlock.matchAll(permissionRegex)) {
    permissions.add(match[1].replace(/^CorePermissionName\./, '').replace(/^['"`]|['"`]$/g, ''));
  }
  const groupPermissionRegex = /GroupPermissionName\.(\w+)/g;
  for (const match of routeBlock.matchAll(groupPermissionRegex)) {
    permissions.add(`group:${match[1]}`);
  }
  if (routeBlock.includes('canReadAdminStorageSpace')) {
    permissions.add('AdminRead');
  }
  if (routeBlock.includes('canManageAdminStorageSpace')) {
    permissions.add('AdminAll');
  }
  return [...permissions].sort();
}

function notesFor(route: RouteRow, block: string): string[] {
  const notes = new Set<string>();
  const routeLower = route.route.toLowerCase();
  const blockLower = block.toLowerCase();

  if (route.auth === 'public') {
    notes.add('public entrypoint');
  }
  if (route.auth === 'authorized' && route.permissions.length === 0) {
    notes.add('token only; module/user ownership checks expected');
  }
  if (routeLower.includes('login') || routeLower.includes('auth') || routeLower.includes('invite')) {
    notes.add('authentication flow');
  }
  if (routeLower.includes('webhook')) {
    notes.add('webhook/token-in-path review');
  }
  if (routeLower.includes('/pin/') || blockLower.includes('secretapikey')) {
    notes.add('external service secret boundary');
  }
  if (routeLower.includes('content') || routeLower.includes('file') || routeLower.includes('ipfs')) {
    notes.add('content/storage boundary');
  }
  if (routeLower === '/v1/content/:contentid' && blockLower.includes('getpubliccontentmetadata')) {
    notes.add('public-safe metadata projection; private DB ids hidden');
  }
  if (routeLower.includes('telegram') || routeLower.includes('twitter') || routeLower.includes('soc-net')) {
    notes.add('social account credential boundary');
  }
  if (blockLower.includes('encrypt') || blockLower.includes('encrypted') || blockLower.includes('privatekey')) {
    notes.add('encryption/key boundary');
  }
  return [...notes].sort();
}

function parseFile(filePath: string): RouteRow[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(rootDir, filePath);
  const moduleName = path.relative(modulesDir, path.dirname(filePath)).split(path.sep)[0];
  const aliases = new Map<string, string>();
  const localApiRegistrars = new Set<string>();
  const routes: Array<RouteRow & {index: number}> = [];

  if (relPath === 'app/modules/api/api.ts') {
    localApiRegistrars.add('module');
  }

  const prefixRegex = /(?:const|let|var)\s+(\w+)\s*=\s*app\.ms\.api\.prefix\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  for (const match of source.matchAll(prefixRegex)) {
    aliases.set(match[1], match[2]);
  }

  const routeRegex = /(?:(app\.ms\.api)|(\w+))\.(onAuthorizedGet|onAuthorizedPost|onUnversionGet|onUnversionHead|onGet|onPost|onHead)\(\s*['"`]([^'"`]+)['"`]/g;
  for (const match of source.matchAll(routeRegex)) {
    const alias = match[2];
    if (alias && !aliases.has(alias) && !localApiRegistrars.has(alias)) {
      continue;
    }
    const registration = match[3];
    const localRoute = normalizeRoute(match[4]);
    const routePrefix = routePrefixFor(registration);
    const aliasPrefix = alias ? aliases.get(alias) || '' : '';
    const fullRoute = `${routePrefix}${normalizeRoute(`${aliasPrefix}${localRoute}`)}`.replace(/\/$/, '');
    routes.push({
      moduleName,
      source: relPath,
      method: methodFor(registration),
      route: fullRoute,
      auth: registration.includes('Authorized') ? 'authorized' : 'public',
      permissions: [],
      notes: [],
      index: match.index || 0,
    });
  }

  return routes.map((route, index) => {
    const blockEnd = routes[index + 1]?.index ?? source.length;
    const block = source.slice(route.index, blockEnd);
    const cleanRoute = {...route};
    delete (cleanRoute as any).index;
    cleanRoute.permissions = extractPermissions(block);
    cleanRoute.notes = notesFor(cleanRoute, block);
    return cleanRoute;
  }).sort((a, b) => `${a.moduleName}:${a.route}:${a.method}`.localeCompare(`${b.moduleName}:${b.route}:${b.method}`));
}

function render(rows: RouteRow[]): string {
  const publicRoutes = rows.filter((row) => row.auth === 'public').length;
  const authorizedRoutes = rows.filter((row) => row.auth === 'authorized').length;
  const tokenOnlyRoutes = rows.filter((row) => row.auth === 'authorized' && row.permissions.length === 0).length;

  const lines = [
    '# Security Route Inventory',
    '',
    '## Source Of Truth',
    '',
    'Original request for this slice: continue the GeeSome Node TODO by starting the API and encryption security review tracked in [#782](https://github.com/galtproject/geesome-node/issues/782).',
    '',
    'This file is generated by `npm run security:route-inventory:update`. Do not hand-edit the route table; update route code or the inventory script, then regenerate.',
    '',
    '## Summary',
    '',
    `- API route registrations: ${rows.length}`,
    `- Public registrations: ${publicRoutes}`,
    `- Authorized registrations: ${authorizedRoutes}`,
    `- Authorized registrations without nearby core-permission checks: ${tokenOnlyRoutes}`,
    '',
    'Interpretation notes:',
    '',
    '- `authorized` means the route requires a valid API token through `onAuthorizedGet` or `onAuthorizedPost`.',
    '- `token only` routes can still be safe when the called module enforces user ownership, group membership, or object ownership internally. They need manual review because the core-permission check is not visible at the route layer.',
    '- Public authentication, webhook, content, and gateway routes need abuse-case review even when they are intentionally public.',
    '',
    '## Route Matrix',
    '',
    '| Module | Method | Route | Auth | Nearby Permission Checks | Security Notes | Source |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const row of rows) {
    lines.push(`| ${escapeCell(row.moduleName)} | ${row.method} | \`${escapeCell(row.route)}\` | ${row.auth} | ${escapeCell(row.permissions.join(', ') || '-')} | ${escapeCell(row.notes.join('; ') || '-')} | \`${escapeCell(row.source)}\` |`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

const rows = walkApiFiles(modulesDir).flatMap(parseFile);
const generated = render(rows);

if (args.has('--write')) {
  fs.writeFileSync(outputPath, generated);
  console.log(`wrote ${path.relative(rootDir, outputPath)}`);
} else if (args.has('--check')) {
  const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (existing !== generated) {
    console.error(`${path.relative(rootDir, outputPath)} is out of date. Run npm run security:route-inventory:update.`);
    process.exit(1);
  }
  console.log(`${path.relative(rootDir, outputPath)} is up to date`);
} else {
  process.stdout.write(generated);
}
