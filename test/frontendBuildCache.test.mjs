import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('../bash/publish-frontend-dist.sh', import.meta.url));

test('image and persistent server builds are reused only for matching inputs and intact assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-cache-'));
  try {
    const ui = path.join(root, 'ui');
    const image = path.join(root, 'image');
    const published = path.join(root, 'published');
    const count = path.join(root, 'build-count');
    fs.mkdirSync(ui);
    fs.writeFileSync(path.join(ui, 'package.json'), '{}');
    fs.writeFileSync(path.join(ui, 'yarn.lock'), '# lock');
    fs.writeFileSync(path.join(ui, 'index.html'), '<html>source</html>');
    fs.writeFileSync(path.join(ui, 'build.cjs'), `
      const fs = require('fs');
      fs.appendFileSync(process.env.BUILD_COUNT, 'built\\n');
      fs.mkdirSync('dist', {recursive: true});
      fs.writeFileSync('dist/index.html', '<html>built</html>');
      fs.writeFileSync('dist/app.js', 'console.log(1)');
      if (process.env.FAIL_BUILD === '1') {
        process.exit(12);
      }
    `);
    const env = {...process.env, GEESOME_UI_ROOT: ui, GEESOME_UI_NODE_VERSION: '',
      GEESOME_UI_BUILD_COMMAND: 'node build.cjs', BUILD_COUNT: count,
      GEESOME_FRONTEND_IMAGE_DIST: image, GEESOME_FRONTEND_PUBLISH_DIR: published};
    const run = (overrides = {}, success = true) => {
      const result = spawnSync('bash', [script], {env: {...env, ...overrides}, encoding: 'utf8'});
      assert.equal(result.status === 0, success, result.stdout + result.stderr);
      return result.stdout;
    };
    const builds = () => fs.readFileSync(count, 'utf8').trim().split('\n').length;
    // Simulate build-stage output, then a clean runtime source tree with no dist.
    run({GEESOME_FRONTEND_PUBLISH_DIR: image});
    assert.equal(builds(), 1);
    fs.rmSync(path.join(ui, 'dist'), {recursive: true});
    assert.match(run(), /Reusing prepared Docker frontend/);
    assert.equal(builds(), 1);
    assert.match(run(), /Reusing verified server frontend/);
    assert.equal(builds(), 1);

    // Installed dependency/cache noise must not invalidate a source fingerprint.
    fs.mkdirSync(path.join(ui, 'node_modules'));
    fs.writeFileSync(path.join(ui, 'node_modules/noise'), 'irrelevant');
    assert.match(run(), /Reusing verified server frontend/);
    // A damaged published asset is recovered from the verified image.
    fs.writeFileSync(path.join(published, 'app.js'), 'damaged');
    assert.match(run(), /Reusing prepared Docker frontend/);
    assert.equal(builds(), 1);
    fs.writeFileSync(path.join(ui, 'index.html'), '<html>custom</html>');
    assert.match(run(), /No matching frontend build/);
    assert.equal(builds(), 2);
    assert.match(run(), /Reusing verified server frontend/);
    assert.equal(builds(), 2);
    fs.appendFileSync(path.join(ui, 'yarn.lock'), '\n# new lock');
    run();
    assert.equal(builds(), 3);
    run({VUE_APP_TITLE: 'custom title'});
    assert.equal(builds(), 4);
    assert.match(run({VUE_APP_TITLE: 'custom title'}), /Reusing verified server frontend/);
    const previous = fs.readFileSync(path.join(published, '.geesome-build.json'), 'utf8');
    fs.appendFileSync(path.join(ui, 'index.html'), 'modified again');
    run({FAIL_BUILD: '1'}, false);
    assert.equal(fs.readFileSync(path.join(published, '.geesome-build.json'), 'utf8'), previous);
    assert.equal(fs.readFileSync(path.join(published, 'index.html'), 'utf8'), '<html>built</html>');
    run();
    assert.equal(builds(), 6);
    // Corrupted server cache with mismatched image must rebuild.
    fs.unlinkSync(path.join(published, 'app.js'));
    run();
    assert.equal(builds(), 7);
    // Returning to standard sources must not accept a damaged image artifact.
    fs.writeFileSync(path.join(ui, 'index.html'), '<html>source</html>');
    fs.writeFileSync(path.join(ui, 'yarn.lock'), '# lock');
    fs.writeFileSync(path.join(image, 'app.js'), 'corrupt image');
    run();
    assert.equal(builds(), 8);
    fs.writeFileSync(path.join(published, '.geesome-build.json'), 'invalid json');
    run();
    assert.equal(builds(), 9);
    run({GEESOME_UI_BUILD_ENV_KEYS: 'CUSTOM_TITLE', CUSTOM_TITLE: 'one'});
    assert.equal(builds(), 10);
    assert.match(run({GEESOME_UI_BUILD_ENV_KEYS: 'CUSTOM_TITLE', CUSTOM_TITLE: 'one'}), /Reusing verified server frontend/);
    run({GEESOME_UI_BUILD_ENV_KEYS: 'CUSTOM_TITLE', CUSTOM_TITLE: 'two'});
    assert.equal(builds(), 11);
    // Only the root output directory is excluded; src/dist is valid source.
    fs.mkdirSync(path.join(ui, 'src/dist'), {recursive: true});
    fs.writeFileSync(path.join(ui, 'src/dist/component.js'), 'changed');
    run({GEESOME_UI_BUILD_ENV_KEYS: 'CUSTOM_TITLE', CUSTOM_TITLE: 'two'});
    assert.equal(builds(), 12);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('build cache survives publication removal and rejects corrupt entries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-buildkit-cache-'));
  try {
    const ui = path.join(root, 'ui');
    const cache = path.join(root, 'cache');
    const published = path.join(root, 'published');
    const counter = path.join(root, 'count');
    fs.mkdirSync(ui);
    fs.writeFileSync(path.join(ui, 'build.cjs'), `
      const fs = require('fs');
      if (process.env.FORBID_BUILD === '1') {
        throw new Error('Unexpected compilation');
      }
      fs.appendFileSync(process.env.BUILD_COUNTER, 'build\\n');
      fs.mkdirSync('dist', {recursive: true});
      fs.writeFileSync('dist/index.html', '<html>cache fixture</html>');
    `);
    const env = {...process.env, GEESOME_UI_ROOT: ui, GEESOME_UI_NODE_VERSION: '',
      GEESOME_UI_BUILD_COMMAND: 'node build.cjs', BUILD_COUNTER: counter,
      GEESOME_FRONTEND_IMAGE_DIST: path.join(root, 'absent-image'),
      GEESOME_FRONTEND_BUILD_CACHE: cache, GEESOME_FRONTEND_PUBLISH_DIR: published};
    const run = (forbid = false) => {
      const result = spawnSync('bash', [script], {env: {...env, FORBID_BUILD: forbid ? '1' : '0'}, encoding: 'utf8'});
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return result.stdout;
    };
    run();
    const entries = fs.readdirSync(cache);
    assert.equal(entries.length, 1);
    assert.match(entries[0], /^[a-f0-9]{64}$/);
    fs.rmSync(published, {recursive: true});
    fs.rmSync(path.join(ui, 'dist'), {recursive: true});
    assert.match(run(true), /Reusing BuildKit frontend cache/);
    assert.equal(fs.readFileSync(counter, 'utf8'), 'build\n');
    fs.writeFileSync(path.join(cache, entries[0], 'index.html'), 'corrupt');
    fs.rmSync(published, {recursive: true});
    assert.match(run(), /No matching frontend build/);
    assert.equal(fs.readFileSync(counter, 'utf8'), 'build\nbuild\n');
    fs.rmSync(published, {recursive: true});
    assert.match(run(true), /Reusing BuildKit frontend cache/);
    assert.deepEqual(fs.readdirSync(cache), entries);
    fs.writeFileSync(path.join(ui, 'changed-source.txt'), 'new inputs');
    const failed = spawnSync('bash', [script], {env: {...env, FORBID_BUILD: '1'}, encoding: 'utf8'});
    assert.notEqual(failed.status, 0);
    assert.deepEqual(fs.readdirSync(cache), entries);
    assert.equal(fs.readFileSync(path.join(published, 'index.html'), 'utf8'), '<html>cache fixture</html>');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
