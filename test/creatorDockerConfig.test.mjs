import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = [
  'MODULES',
  'PAYMENTS_WORKER', 'PAYMENTS_COLLECTION_WORKER', 'DIRECT_CRYPTO_SEED_PHRASE',
  'DIRECT_CRYPTO_ONEINCH_API_KEY', 'DIRECT_CRYPTO_CONFIG', 'DIRECT_CRYPTO_ETHEREUM_RPC',
  'DIRECT_CRYPTO_ARBITRUM_RPC', 'DIRECT_CRYPTO_BASE_RPC', 'DIRECT_CRYPTO_TRON_RPC',
  'DIRECT_CRYPTO_BITCOIN_RPC', 'DIRECT_CRYPTO_ETHEREUM_INDEXER',
  'DIRECT_CRYPTO_ARBITRUM_INDEXER', 'DIRECT_CRYPTO_BASE_INDEXER', 'DIRECT_CRYPTO_PRICE_URL', 'TRONGRID_API_KEY'
];
function compose(work) {
  const env = {...process.env};
  for (const name of [...names, 'GEESOME_DATA']) {
    delete env[name];
  }
  const result = spawnSync('docker', ['compose', '--project-directory', work, '-f', path.join(root, 'docker-compose.yml'), 'config', '--format', 'json'], {encoding: 'utf8', env});
  assert.equal(result.status, 0, 'docker compose config must resolve successfully');
  return JSON.parse(result.stdout).services.web;
}
test('creator configuration reaches the container through .env and the persistent data mount', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'geesome-creator-compose-'));
  try {
    const values = Object.fromEntries(names.map(name => [name, `fixture-${name.toLowerCase()}`]));
    Object.assign(values, {MODULES: 'database,api,group,googleAuthorization,payments,membership',
      PAYMENTS_WORKER: '0', PAYMENTS_COLLECTION_WORKER: '0',
      DIRECT_CRYPTO_CONFIG: '{"networks":["base"]}', DIRECT_CRYPTO_SEED_PHRASE: 'synthetic configuration fixture only'});
    const data = path.join(work, 'persistent-data');
    fs.writeFileSync(path.join(work, '.env'), Object.entries({...values, GEESOME_DATA: data}).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n');
    const web = compose(work);
    for (const [name, value] of Object.entries(values)) {
      assert.equal(web.environment[name], value, name);
    }
    assert(web.volumes.some(volume => volume.source === data && volume.target === '/geesome-node/data'));
    assert(!Object.values(web.build.args || {}).includes(values.DIRECT_CRYPTO_SEED_PHRASE));
  } finally {
    fs.rmSync(work, {recursive: true, force: true});
  }
});
test('both money workers remain disabled and no site is configured with no .env', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'geesome-creator-defaults-'));
  try {
    const web = compose(work);
    for (const name of ['PAYMENTS_WORKER', 'PAYMENTS_COLLECTION_WORKER']) {
      assert.equal(web.environment[name], '0');
    }
    for (const name of ['MODULES', 'DIRECT_CRYPTO_SEED_PHRASE', 'DIRECT_CRYPTO_ONEINCH_API_KEY']) {
      assert.equal(web.environment[name], '');
    }
  } finally {
    fs.rmSync(work, {recursive: true, force: true});
  }
});
