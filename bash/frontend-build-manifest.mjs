import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const manifestName = '.geesome-build.json';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const helperDir = path.dirname(fileURLToPath(import.meta.url));

function files(root, source = false) {
  const result = {};
  const excluded = new Set(['node_modules', '.git', 'dist', '.parcel-cache', '.cache', 'coverage']);
  function walk(relative, ancestors) {
    const full = path.join(root, relative);
    if (source && relative && ['GEESOME_UI_DIST', 'GEESOME_FRONTEND_PUBLISH_DIR'].some(key =>
      process.env[key] && path.resolve(full) === path.resolve(process.env[key]))) {
      return;
    }
    const real = fs.realpathSync(full);
    if (ancestors.has(real)) {
      throw new Error(`Cyclic frontend symlink: ${relative}`);
    }
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      const next = new Set([...ancestors, real]);
      for (const name of fs.readdirSync(full).sort()) {
        if (name === manifestName || (source && excluded.has(name))) {
          continue;
        }
        walk(path.join(relative, name), next);
      }
    } else if (stat.isFile()) {
      result[relative] = digest(fs.readFileSync(full));
    } else {
      throw new Error(`Unsupported frontend file: ${relative}`);
    }
  }
  walk('', new Set());
  return result;
}

function validateDist(root) {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  if (!index.trim() || /src=["']\/src\/main\.ts["']/.test(index)) {
    throw new Error('Frontend index is empty or references unbuilt source');
  }
  for (const name of ['src/main.ts', 'yarn.lock', 'tsconfig.json']) {
    if (fs.existsSync(path.join(root, name))) {
      throw new Error(`Frontend dist contains source file: ${name}`);
    }
  }
}

const [command, root, inputHash, destination] = process.argv.slice(2);
if (command === 'inputs') {
  const env = {};
  // Include frontend environment conventions and explicitly declared custom inputs.
  const custom = (process.env.GEESOME_UI_BUILD_ENV_KEYS || '').split(',').filter(Boolean);
  for (const key of [...new Set([...Object.keys(process.env).filter(key => /^(VUE_APP_|VITE_|PARCEL_|REACT_APP_)/.test(key)),
    'NODE_ENV', 'BABEL_ENV', 'NODE_OPTIONS', 'GEESOME_UI_NODE_VERSION',
    'GEESOME_UI_BUILD_COMMAND', 'GEESOME_UI_BUILD_ENV_KEYS',
    'GEESOME_UI_NODE_MAX_OLD_SPACE_SIZE', 'GEESOME_UI_PARCEL_WORKERS', ...custom])].sort()) {
    env[key] = process.env[key] || '';
  }
  const recipe = ['publish-frontend-dist.sh', 'frontend-build-manifest.mjs'].map(name =>
    digest(fs.readFileSync(path.join(helperDir, name))));
  console.log(digest(JSON.stringify({schema: 1, files: files(root, true), env, recipe})));
} else if (command === 'create') {
  validateDist(root);
  fs.writeFileSync(path.join(root, manifestName), JSON.stringify({schema: 1, inputHash, files: files(root)}, null, 2));
} else if (command === 'verify') {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestName), 'utf8'));
    validateDist(root);
    if (manifest.schema !== 1 || manifest.inputHash !== inputHash ||
      JSON.stringify(manifest.files) !== JSON.stringify(files(root))) {
      process.exitCode = 1;
    }
  } catch {
    process.exitCode = 1;
  }
} else if (command === 'publish') {
  // Stage on the publication filesystem. The directory may be a bind mount,
  // so replace files atomically, with index last, rather than rename its root.
  validateDist(root);
  fs.mkdirSync(destination, {recursive: true});
  const staging = fs.mkdtempSync(path.join(destination, '.publish-'));
  try {
    fs.cpSync(root, staging, {recursive: true, dereference: true});
    const names = Object.keys(files(staging)).filter(name => name !== 'index.html');
    for (const name of [...names, 'index.html', manifestName]) {
      const target = path.join(destination, name);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.renameSync(path.join(staging, name), target);
    }
    // Remove obsolete files only after the new index and manifest are installed.
    const expected = new Set([...names, 'index.html', manifestName]);
    function clean(dir, relative = '') {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const name = path.join(relative, entry.name);
        const full = path.join(dir, entry.name);
        if (full === staging) {
          continue;
        }
        if (entry.isDirectory()) {
          clean(full, name);
        } else if (!expected.has(name)) {
          fs.unlinkSync(full);
        }
      }
    }
    clean(destination);
  } finally {
    fs.rmSync(staging, {recursive: true, force: true});
  }
} else {
  throw new Error(`Unknown manifest command: ${command}`);
}
