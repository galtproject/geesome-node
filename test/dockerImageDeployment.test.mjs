import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('pull/build modes, immutable state, dirty guards and failure preservation', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'geesome-images-'));
  const repo = path.join(temp, 'repo');
  const bin = path.join(temp, 'bin');
  fs.mkdirSync(repo);
  fs.mkdirSync(bin);
  fs.cpSync(path.join(source, 'bash'), path.join(repo, 'bash'), {recursive: true});
  fs.writeFileSync(path.join(repo, '.gitignore'), '.docker-deploy\n.docker-data\n.docker-build-cache\n');
  fs.writeFileSync(path.join(repo, 'docker-compose.yml'), 'services: {}\n');
  const command = (cmd, args, env = {}) => spawnSync(cmd, args, {cwd: repo, env: {...process.env, ...env}, encoding: 'utf8'});
  for (const args of [['init'], ['config', 'user.name', 'Test'], ['config', 'user.email', 'test@example.invalid'], ['add', '.'], ['commit', '-m', 'fixture']]) {
    assert.equal(command('git', args).status, 0);
  }
  const sha = command('git', ['rev-parse', 'HEAD']).stdout.trim();
  const id = 'sha256:' + 'a'.repeat(64);
  const digest = 'ghcr.io/galtproject/geesome-node@sha256:' + 'b'.repeat(64);
  const log = path.join(temp, 'docker.log');
  fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$MOCK_LOG"
case "$1 $2" in
  'info --format') echo amd64 ;;
  'pull --platform')
    case "\${MOCK_PULL:-ok}" in
      ok) exit 0 ;;
      missing) echo 'manifest unknown' >&2; exit 1 ;;
      network) echo 'connection refused' >&2; exit 1 ;;
    esac ;;
  'image inspect')
    case "$4" in
      *RepoDigests*) echo '${digest}' ;;
      *Labels*) echo "\${MOCK_REVISION:-$MOCK_SHA}|linux/amd64" ;;
      *) echo '${id}' ;;
    esac ;;
  'buildx inspect') echo 'Driver: docker' ;;
  'buildx imagetools')
    if [ "\${MOCK_REMOTE:-missing}" = existing ]; then
      exit 0
    fi
    if [ "\${MOCK_REMOTE:-missing}" = denied ]; then
      echo 'unauthorized' >&2
      exit 1
    fi
    echo 'manifest unknown' >&2; exit 1 ;;
  'buildx build') : ;;
  'tag '*|'push '*) : ;;
  'compose config') echo local-build ;;
  'compose build') test "\${MOCK_BUILD:-ok}" = ok ;;
  'compose --project-directory')
    while [ "$#" -gt 0 ]; do
      if [ "$1" = -f ]; then
        shift
        cat "$1" >> "$MOCK_LOG"
      fi
      shift
    done ;;
  *) echo "Unexpected Docker call: $*" >&2; exit 1 ;;
esac
`);
  fs.chmodSync(path.join(bin, 'docker'), 0o755);
  const env = {PATH: bin + ':' + process.env.PATH, MOCK_LOG: log, MOCK_SHA: sha};
  const prepare = (overrides = {}) => command('bash', ['bash/docker-prepare-image.sh'], {...env, ...overrides});
  const state = path.join(repo, '.docker-deploy/image');
  try {
    let result = prepare();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(state, 'utf8').trim(), digest);
    assert.doesNotMatch(fs.readFileSync(log, 'utf8'), /compose build/);
    result = command('bash', ['bash/docker-compose.sh', 'up', '-d', '--no-build'], env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(log, 'utf8'), /pull_policy: never/);
    assert.match(fs.readFileSync(log, 'utf8'), /@sha256:bbbb/);
    for (const overrides of [{MOCK_REVISION: 'wrong'}, {GEESOME_IMAGE_MODE: 'pull', MOCK_PULL: 'missing'}, {MOCK_PULL: 'network', MOCK_BUILD: 'fail'}]) {
      assert.notEqual(prepare(overrides).status, 0);
      assert.equal(fs.readFileSync(state, 'utf8').trim(), digest);
    }
    result = prepare({MOCK_PULL: 'missing'});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(state, 'utf8').trim(), id);
    assert.equal(fs.readFileSync(path.join(repo, '.docker-deploy/previous-image'), 'utf8').trim(), digest);
    fs.writeFileSync(log, '');
    assert.equal(prepare({GEESOME_IMAGE_MODE: 'build'}).status, 0);
    assert.doesNotMatch(fs.readFileSync(log, 'utf8'), /pull --platform/);
    fs.writeFileSync(path.join(repo, 'uncommitted-source'), 'changed');
    fs.writeFileSync(log, '');
    assert.notEqual(prepare().status, 0);
    assert.equal(fs.readFileSync(log, 'utf8'), '');
    fs.unlinkSync(path.join(repo, 'uncommitted-source'));
    fs.writeFileSync(path.join(repo, 'bash/docker-image-smoke.sh'), '#!/bin/bash\necho smoke >> "$MOCK_LOG"\n');
    assert.equal(command('git', ['add', '.']).status, 0);
    assert.equal(command('git', ['commit', '-m', 'smoke fixture']).status, 0);
    const publishEnv = {...env, MOCK_SHA: command('git', ['rev-parse', 'HEAD']).stdout.trim()};
    const publish = (overrides = {}) => command('bash', ['bash/docker-publish.sh'], {...publishEnv, ...overrides});
    fs.writeFileSync(log, '');
    result = publish();
    assert.equal(result.status, 0, result.stderr);
    let calls = fs.readFileSync(log, 'utf8');
    assert.match(calls, /buildx build/);
    assert.ok(calls.indexOf('smoke') < calls.indexOf('push '));
    fs.writeFileSync(log, '');
    result = publish({MOCK_REMOTE: 'existing'});
    assert.equal(result.status, 0, result.stderr);
    calls = fs.readFileSync(log, 'utf8');
    assert.doesNotMatch(calls, /buildx build|push /);
    assert.equal(command('git', ['tag', 'v0.4.7']).status, 0);
    fs.writeFileSync(log, '');
    result = publish({MOCK_REMOTE: 'existing', GEESOME_RELEASE_TAG: 'v0.4.7'});
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(log, 'utf8'), /push ghcr.io\/galtproject\/geesome-node:v0.4.7/);
    for (const overrides of [{MOCK_REMOTE: 'denied'}, {GEESOME_RELEASE_TAG: 'v9.9.9'}, {MOCK_REMOTE: 'existing', MOCK_REVISION: 'wrong'}]) {
      fs.writeFileSync(log, '');
      assert.notEqual(publish(overrides).status, 0);
      assert.doesNotMatch(fs.readFileSync(log, 'utf8'), /push /);
    }
    // Upgrade preparation failure must never touch systemd or overwrite selection.
    for (const name of ['ipfs-ownership-preflight.sh', 'docker-deploy-readiness.sh', 'install-host-retention.sh', 'docker-post-deploy-retention.sh']) {
      fs.writeFileSync(path.join(repo, 'bash', name), '#!/bin/bash\nexit 0\n');
      fs.chmodSync(path.join(repo, 'bash', name), 0o755);
    }
    fs.writeFileSync(path.join(bin, 'systemctl'), '#!/bin/bash\necho systemctl "$*" >> "$MOCK_LOG"\n');
    fs.chmodSync(path.join(bin, 'systemctl'), 0o755);
    command('git', ['add', '.']);
    command('git', ['commit', '-m', 'upgrade fixture']);
    const units = path.join(temp, 'units');
    const upgradeEnv = {...env, MOCK_SHA: command('git', ['rev-parse', 'HEAD']).stdout.trim(), GEESOME_SYSTEMD_UNIT_DIR: units};
    fs.writeFileSync(log, '');
    result = command('bash', ['bash/docker-upgrade-run.sh'], {...upgradeEnv, MOCK_PULL: 'missing', MOCK_BUILD: 'fail'});
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(fs.readFileSync(log, 'utf8'), /systemctl/);
    assert.equal(fs.existsSync(units), false);
    result = command('bash', ['bash/docker-upgrade-run.sh'], upgradeEnv);
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(path.join(units, 'geesome-docker.service.d/image-selection.conf'), 'utf8'), /docker-compose.sh up -d --no-build/);
    assert.match(fs.readFileSync(log, 'utf8'), /systemctl restart geesome-docker/);
    fs.writeFileSync(state, 'malformed-state');
    assert.notEqual(command('bash', ['bash/docker-compose.sh', 'up'], env).status, 0);
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
});

test('prepared runtime fails closed instead of compiling changed frontend input', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'geesome-prepared-'));
  try {
    const ui = path.join(temp, 'ui');
    fs.mkdirSync(ui);
    fs.writeFileSync(path.join(ui, 'index.html'), 'changed source');
    const result = spawnSync('bash', [path.join(source, 'bash/publish-frontend-dist.sh')], {
      env: {...process.env, GEESOME_UI_ROOT: ui, GEESOME_UI_NODE_VERSION: '',
        GEESOME_FRONTEND_IMAGE_DIST: path.join(temp, 'absent'),
        GEESOME_FRONTEND_PUBLISH_DIR: path.join(temp, 'output'),
        GEESOME_FRONTEND_ALLOW_BUILD: '0', GEESOME_UI_BUILD_COMMAND: 'touch should-not-build'}, encoding: 'utf8'
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Prepared frontend missing/);
    assert.equal(fs.existsSync(path.join(ui, 'should-not-build')), false);
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
});
