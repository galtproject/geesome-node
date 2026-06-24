#!/bin/bash
set -euo pipefail

UI_ROOT="${GEESOME_UI_ROOT:-/geesome-node/node_modules/@geesome/ui}"
UI_DIST="${GEESOME_UI_DIST:-$UI_ROOT/dist}"
PUBLISH_DIR="${GEESOME_FRONTEND_PUBLISH_DIR:-/geesome-node/frontend/docker-dist}"
UI_NODE_VERSION="${GEESOME_UI_NODE_VERSION-18.20.8}"
UI_NODE_MAX_OLD_SPACE_SIZE="${GEESOME_UI_NODE_MAX_OLD_SPACE_SIZE:-4096}"
UI_PARCEL_WORKERS="${GEESOME_UI_PARCEL_WORKERS:-1}"

setup_frontend_node() {
  if [ -z "$UI_NODE_VERSION" ]; then
    return
  fi

  local nvm_script="${NVM_DIR:-/usr/local/nvm}/nvm.sh"
  if [ ! -s "$nvm_script" ]; then
    echo "NVM not found at $nvm_script; building frontend with current Node $(node -v 2>/dev/null || echo unknown)"
    return
  fi

  # shellcheck source=/dev/null
  . "$nvm_script"
  nvm install "$UI_NODE_VERSION"
  nvm use "$UI_NODE_VERSION"

  if ! command -v yarn >/dev/null 2>&1; then
    npm i -g yarn@1.22.22
  fi
}

build_frontend_dist() {
  if [ -n "${GEESOME_UI_BUILD_COMMAND:-}" ]; then
    eval "$GEESOME_UI_BUILD_COMMAND"
    return
  fi

  YARN_IGNORE_ENGINES=1 yarn install --force --network-concurrency 1
  rm -rf .parcel-cache ./dist
  PARCEL_WORKERS="$UI_PARCEL_WORKERS" node "--max-old-space-size=$UI_NODE_MAX_OLD_SPACE_SIZE" \
    ./node_modules/.bin/parcel build ./index.html --no-content-hash --no-optimize --dist-dir ./dist
  node ./run-terser.js
  cp package.json ./dist/
}

if [ -z "$PUBLISH_DIR" ] || [ "$PUBLISH_DIR" = "/" ]; then
  echo "Refusing to publish frontend to an unsafe directory: '$PUBLISH_DIR'" >&2
  exit 1
fi

if [ ! -d "$UI_ROOT" ]; then
  echo "GeeSome UI package was not found at $UI_ROOT" >&2
  exit 1
fi

if [ ! -f "$UI_DIST/index.html" ]; then
  echo "GeeSome UI dist is missing; building frontend from $UI_ROOT..."
  (
    cd "$UI_ROOT"
    setup_frontend_node
    build_frontend_dist
  )
fi

if [ ! -f "$UI_DIST/index.html" ]; then
  echo "GeeSome UI build did not produce $UI_DIST/index.html" >&2
  exit 1
fi

if grep -Eq 'src=["'\'']/src/main\.ts["'\'']' "$UI_DIST/index.html"; then
  echo "Refusing to publish an unbuilt GeeSome UI index.html from $UI_DIST" >&2
  exit 1
fi

mkdir -p "$PUBLISH_DIR"
find "$PUBLISH_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R "$UI_DIST"/. "$PUBLISH_DIR"/

if [ -e "$PUBLISH_DIR/src/main.ts" ] || [ -e "$PUBLISH_DIR/yarn.lock" ] || [ -e "$PUBLISH_DIR/tsconfig.json" ]; then
  echo "Refusing to leave GeeSome UI source files in $PUBLISH_DIR" >&2
  exit 1
fi

echo "Published GeeSome UI dist to $PUBLISH_DIR"
