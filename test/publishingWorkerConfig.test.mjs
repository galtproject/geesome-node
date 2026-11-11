import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import startCron from '../app/modules/socNetPublishing/cron.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = ['SOC_NET_PUBLISHING_WORKER', 'SOC_NET_PUBLISHING_INTERVAL_MS', 'SOC_NET_PUBLISHING_BATCH_SIZE'];
function cleanEnv() {
  const env = {...process.env};
  for (const name of names) {
    delete env[name];
  }
  return env;
}
function runtime(values = {}) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    "import config from './app/config.ts'; console.log(JSON.stringify({socNetPublishingConfig:config.socNetPublishingConfig,modules:config.modules}));"],
  {cwd: root, env: {...cleanEnv(), ...values}, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function compose(values = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'geesome-publishing-compose-'));
  try {
    fs.writeFileSync(path.join(work, '.env'), Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'));
    const result = spawnSync('docker', ['compose', '--project-directory', work, '-f', path.join(root, 'docker-compose.yml'), 'config', '--format', 'json'],
      {env: cleanEnv(), encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).services.web.environment;
  } finally {
    fs.rmSync(work, {recursive: true, force: true});
  }
}
test('runtime defaults to enabled and retains explicit enable/disable', () => {
  const config = runtime();
  assert.equal(config.socNetPublishingConfig.serverWorker, true);
  assert(config.modules.includes('socNetAccount'));
  assert.equal(runtime({SOC_NET_PUBLISHING_WORKER: '1'}).socNetPublishingConfig.serverWorker, true);
  assert.equal(runtime({SOC_NET_PUBLISHING_WORKER: '0'}).socNetPublishingConfig.serverWorker, false);
});
test('Compose enables the worker by default and forwards .env overrides', () => {
  const defaults = compose();
  assert.equal(defaults.SOC_NET_PUBLISHING_WORKER, '1');
  assert.equal(defaults.SOC_NET_PUBLISHING_INTERVAL_MS, '60000');
  assert.equal(defaults.SOC_NET_PUBLISHING_BATCH_SIZE, '');
  const values = {SOC_NET_PUBLISHING_WORKER: '0', SOC_NET_PUBLISHING_INTERVAL_MS: '2500', SOC_NET_PUBLISHING_BATCH_SIZE: '3'};
  const configured = compose(values);
  for (const name of names) {
    assert.equal(configured[name], values[name]);
  }
});
test('default runtime starts a delayed worker, processes a batch and stops cleanly', async () => {
  const config = runtime();
  const original = globalThis.setInterval;
  let tick, interval, calls = 0;
  globalThis.setInterval = (callback, ms) => {
    tick = callback;
    interval = ms;
    return original(() => {}, 3600000);
  };
  let worker;
  try {
    worker = startCron({config}, {async processServerQueue() {calls++;}});
    assert(worker);
    assert.equal(interval, 60000);
    assert.equal(calls, 0);
    tick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    await worker.stop();
    tick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
  } finally {
    globalThis.setInterval = original;
    await worker?.stop();
  }
});
test('explicit opt-out does not start a worker; enabled custom modules require socNetAccount', () => {
  assert.equal(startCron({config: {...runtime({SOC_NET_PUBLISHING_WORKER: '0'}), modules: []}}, {}), null);
  assert.throws(() => startCron({config: {...runtime(), modules: ['socNetPublishing']}}, {}), /server_publishing_requires_socNetAccount/);
});
