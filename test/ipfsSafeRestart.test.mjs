import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('host maintenance requires a live fence, restarts once and waits for readiness', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ipfs-restart-'));
  const bin = path.join(temp, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'timeout'), '#!/bin/bash\nshift 3\nexec "$@"\n', {mode: 0o755});
  fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/bash
set -eu
echo "$*" >> "$FIXTURE_LOG"
case "$1" in
  inspect) exit 0 ;;
  restart)
    touch "$FIXTURE_DIR/restarted"
    test "$SCENARIO" != restart-failed
    exit ;;
  exec)
    case "$*" in
      *check/storageMaintenanceSession.ts*)
        test "$SCENARIO" != helper-missing || exit 1
        test "$SCENARIO" != drain-failed || exit 1
        if [ "$SCENARIO" = invalid-protocol ]; then echo UNKNOWN; exit 1; fi
        echo READY
        checks=0
        while IFS= read -r line; do
          echo "$line" >> "$FIXTURE_LOG"
          case "$line" in
            CHECK)
              checks=$((checks+1))
              if [ "$SCENARIO" = fence-lost ] && [ "$checks" -eq 2 ]; then exit 1; fi
              echo HELD ;;
            RELEASE) echo RELEASED; exit 0 ;;
            *) exit 1 ;;
          esac
        done ;;
      *'diag healthy'*)
        if [ "$SCENARIO" = initially-unhealthy ]; then exit 1; fi
        if [ -f "$FIXTURE_DIR/restarted" ]; then
          if [ "$SCENARIO" = readiness-failed ]; then exit 1; fi
          if [ "$SCENARIO" = delayed-ready ] && [ ! -f "$FIXTURE_DIR/waited" ]; then
            touch "$FIXTURE_DIR/waited"; exit 1
          fi
        fi
        exit 0 ;;
      *) exit 1 ;;
    esac ;;
  *) exit 1 ;;
esac
`, {mode: 0o755});
  try {
    for (const scenario of ['success', 'delayed-ready', 'helper-missing', 'drain-failed', 'invalid-protocol', 'fence-lost', 'initially-unhealthy', 'restart-failed', 'readiness-failed']) {
      const fixture = path.join(temp, scenario);
      fs.mkdirSync(fixture);
      const log = path.join(fixture, 'log');
      const result = spawnSync('bash', [path.join(root, 'bash/ipfs-safe-restart.sh')], {
        env: {...process.env, PATH: bin + ':' + process.env.PATH, SCENARIO: scenario,
          FIXTURE_DIR: fixture, FIXTURE_LOG: log, GEESOME_IPFS_DRAIN_TIMEOUT_SECONDS: '1', GEESOME_IPFS_READY_TIMEOUT_SECONDS: '1'},
        encoding: 'utf8', timeout: 8000,
      });
      assert.equal(result.error, undefined, `${scenario}: ${result.error}`);
      const calls = fs.readFileSync(log, 'utf8');
      if (['success', 'delayed-ready'].includes(scenario)) {
        assert.equal(result.status, 0, `${scenario}: ${result.stderr}`);
        assert.match(result.stdout, /IPFS is ready; storage fence released/);
        assert.equal((calls.match(/^restart /gm) || []).length, 1);
        assert.ok(calls.indexOf('CHECK\n') < calls.indexOf('restart '));
        assert.match(calls, /restart [^\n]+\nCHECK\nexec [^\n]+diag healthy\n(?:CHECK\nexec [^\n]+diag healthy\n)*CHECK\nRELEASE\n/);
      } else {
        assert.notEqual(result.status, 0, `${scenario} must fail closed`);
        assert.doesNotMatch(result.stdout, /IPFS is ready; storage fence released/);
        if (!['restart-failed', 'readiness-failed'].includes(scenario)) {
          assert.doesNotMatch(calls, /^restart /m, `${scenario} must not restart IPFS`);
        }
      }
    }
    const unit = fs.readFileSync(path.join(root, 'bash/geesome-ipfs-restart.service'), 'utf8');
    assert.match(unit, /ipfs-safe-restart\.sh/);
    assert.doesNotMatch(unit, /ExecStart=.*docker restart/);
    for (const installer of ['ubuntu-install-docker.sh', 'docker-upgrade-run.sh']) {
      assert.match(fs.readFileSync(path.join(root, 'bash', installer), 'utf8'), /geesome-ipfs-restart\.service/);
    }
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
});
