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
