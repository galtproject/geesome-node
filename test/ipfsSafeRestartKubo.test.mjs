import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import config from '../app/modules/database/config.ts';
import {stopStorageFence, withStorageFence} from '../app/storageLifecycle.ts';

const ipfs = process.env.GEESOME_RESTART_TEST_IPFS_CONTAINER;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('real Kubo restart drains a PostgreSQL writer and preserves pinned bytes', {skip: !ipfs, timeout: 90000}, async () => {
  assert.match(ipfs, /^geesome-restart-test-[0-9]+-ipfs$/);
  assert.equal(config.database, 'geesome_restart_test');
  const docker = spawnSync('which', ['docker'], {encoding: 'utf8'}).stdout.trim();
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'geesome-restart-kubo-'));
  const writer = {ms: {database: {sequelize: {config, getDialect: () => 'postgres'}}}};
  const sql = new pg.Client({host: config.host, port: config.port, database: config.database, user: config.username, password: config.password});
  let release, child;
  const gate = new Promise(resolve => {release = resolve;});
  let active;
  try {
    // macOS hosts may not have GNU timeout; this fixture preserves its bounded
    // subprocess contract without changing the Linux production wrapper.
    await fs.writeFile(path.join(fixture, 'timeout'), `#!${process.execPath}
const {spawn}=require('node:child_process');
const args=process.argv.slice(2), child=spawn(args[3],args.slice(4),{stdio:'inherit'});
let expired=false, kill;
const timer=setTimeout(()=>{expired=true;child.kill('SIGTERM');kill=setTimeout(()=>child.kill('SIGKILL'),2000);},Number(args[2])*1000);
child.on('error',()=>{clearTimeout(timer);process.exit(1);});
child.on('exit',code=>{clearTimeout(timer);clearTimeout(kill);process.exit(expired?124:code??1);});
`, {mode: 0o755});
    // The host test executes the exact in-container helper on this host, with
    // disposable DB settings. Every IPFS command uses a real isolated container.
    await fs.writeFile(path.join(fixture, 'docker'), `#!${process.execPath}
const {spawnSync}=require('node:child_process');
const args=process.argv.slice(2), web='restart-fixture-web';
if(args[0]==='inspect'&&args[1]===web)process.exit(0);
let result;
if(args[0]==='exec'&&args.includes(web)){
 const start=args.indexOf(web)+1;
 const assignment=args[args.indexOf('-e')+1];
 const split=assignment.indexOf('=');
 result=spawnSync(process.execPath,args.slice(start+1),{stdio:'inherit',env:{...process.env,[assignment.slice(0,split)]:assignment.slice(split+1)}});
}else result=spawnSync(${JSON.stringify(docker)},args,{stdio:'inherit'});
process.exit(result.status??1);
`, {mode: 0o755});
    let ipfsUrl = process.env.GEESOME_RESTART_TEST_IPFS_URL;
    const rpc = async (route, body) => {
      const response = await fetch(ipfsUrl + '/api/v0/' + route, {method: 'POST', body, signal: AbortSignal.timeout(10000)});
      assert.equal(response.status, 200);
      return response;
    };
    const bytes = Buffer.from('Pinned upload survives scheduled maintenance');
    const form = new FormData();
    form.append('file', new Blob([bytes]), 'maintenance.txt');
    const added = JSON.parse(await (await rpc('add?pin=true', form)).text());
    let entered;
    const begun = new Promise(resolve => {entered = resolve;});
    active = withStorageFence(writer, 'shared', async () => {entered(); await gate;});
    await begun;
    const started = spawnSync(docker, ['inspect', '--format', '{{.State.StartedAt}}', ipfs], {encoding: 'utf8'}).stdout.trim();
    child = spawn('bash', ['bash/ipfs-safe-restart.sh'], {cwd: root,
      env: {...process.env, PATH: fixture + ':' + process.env.PATH, GEESOME_DOCKER_WEB_CONTAINER: 'restart-fixture-web',
        GEESOME_STORAGE_FENCE_DIAGNOSTICS: '1',
        GEESOME_DOCKER_IPFS_CONTAINER: ipfs, GEESOME_IPFS_DRAIN_TIMEOUT_SECONDS: '15', GEESOME_IPFS_READY_TIMEOUT_SECONDS: '20'},
      stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', data => {stdout += data;});
    child.stderr.on('data', data => {stderr += data;});
    const finished = new Promise(resolve => {child.once('exit', code => resolve(code));});
    await sql.connect();
    let draining = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      draining = (await sql.query(`SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=17419 AND objid=9301 AND mode='ExclusiveLock' AND NOT granted`)).rowCount > 0;
      if (draining || child.exitCode !== null) {
        break;
      }
      await pause(30);
    }
    assert.ok(draining, stdout + stderr);
    assert.equal(spawnSync(docker, ['inspect', '--format', '{{.State.StartedAt}}', ipfs], {encoding: 'utf8'}).stdout.trim(), started);
    release();
    await active;
    assert.equal(await finished, 0, stdout + stderr);
    assert.match(stdout, /IPFS is ready; storage fence released/);
    assert.notEqual(spawnSync(docker, ['inspect', '--format', '{{.State.StartedAt}}', ipfs], {encoding: 'utf8'}).stdout.trim(), started);
    // Docker can assign a different ephemeral host port after restart. The node
    // uses container DNS; only this host-side verification must rediscover it.
    const published = spawnSync(docker, ['port', ipfs, '5001'], {encoding: 'utf8'}).stdout.trim();
    ipfsUrl = 'http://' + published;
    assert.equal(await (await rpc('cat?arg=' + added.Hash)).text(), bytes.toString());
    assert.ok((await (await rpc('pin/ls?arg=' + added.Hash)).json()).Keys[added.Hash]);
  } finally {
    release();
    await active;
    child?.kill('SIGTERM');
    await sql.end();
    await stopStorageFence(writer);
    await fs.rm(fixture, {recursive: true, force: true});
  }
});
