#!/usr/bin/env bash
set -euo pipefail

export GROUP_DERIVED_STATE_ASYNC="${GROUP_DERIVED_STATE_ASYNC:-0}"
export GATEWAY_PORT="${GATEWAY_PORT:-2083}"
export PORT="${PORT:-7772}"
export SSG_RUNTIME="${SSG_RUNTIME:-1}"
export DATA_DIR="${DATA_DIR:-test-data}"

exec node --import tsx --experimental-global-customevent ./node_modules/.bin/mocha \
	--require ./test/setupQuietLogs.cjs \
	'test/**/*.test.ts' \
	--exit \
	'test/**/*.test.ts' \
	-t 10000
