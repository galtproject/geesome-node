#!/bin/bash
set -euo pipefail

UI_ROOT="${GEESOME_UI_ROOT:-/geesome-node/node_modules/@geesome/ui}"
UI_DIST="${GEESOME_UI_DIST:-$UI_ROOT/dist}"
PUBLISH_DIR="${GEESOME_FRONTEND_PUBLISH_DIR:-/geesome-node/frontend/docker-dist}"
UI_NODE_VERSION="${GEESOME_UI_NODE_VERSION-18.20.8}"
UI_NODE_MAX_OLD_SPACE_SIZE="${GEESOME_UI_NODE_MAX_OLD_SPACE_SIZE:-4096}"
UI_PARCEL_WORKERS="${GEESOME_UI_PARCEL_WORKERS:-1}"
# NVM removes the previous Node bin directory from PATH. Keep its Yarn launcher.
FRONTEND_YARN="$(command -v yarn || true)"

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

}

build_frontend_dist() {
  if [ -n "${GEESOME_UI_BUILD_COMMAND:-}" ]; then
    eval "$GEESOME_UI_BUILD_COMMAND"
    return
  fi

  if [ -z "$FRONTEND_YARN" ] || [ ! -f "$FRONTEND_YARN" ]; then
    FRONTEND_YARN="$(command -v yarn || true)"
  fi
  if [ -z "$FRONTEND_YARN" ]; then
    # Do not inherit an npm prefix pointing at another Node installation.
    local node_prefix
    node_prefix="$(dirname "$(dirname "$(command -v node)")")"
    npm install --global --prefix "$node_prefix" yarn@1.22.22
    FRONTEND_YARN="$node_prefix/bin/yarn"
  fi
  # Run the launcher with the selected frontend Node, even if Yarn came from
  # the backend Node installation. No global-bin PATH lookup is required.
  node "$FRONTEND_YARN" --version
  YARN_IGNORE_ENGINES=1 node "$FRONTEND_YARN" install --frozen-lockfile --force --network-concurrency 1
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

MANIFEST_TOOL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/frontend-build-manifest.mjs"
IMAGE_DIST="${GEESOME_FRONTEND_IMAGE_DIST:-/opt/geesome/frontend}"
# Never delete a source/publication root when rebuilding a configured dist.
node - "$UI_DIST" "$UI_ROOT" "$PUBLISH_DIR" "$IMAGE_DIST" <<'JS'
const path = require('path');
const [dist, ...roots] = process.argv.slice(2).map(value => path.resolve(value));
if (dist === path.parse(dist).root || roots.some(root => root === dist || root.startsWith(dist + path.sep))) {
  throw new Error('Unsafe frontend dist directory: ' + dist);
}
JS
export GEESOME_UI_NODE_VERSION="$UI_NODE_VERSION"
export GEESOME_UI_NODE_MAX_OLD_SPACE_SIZE="$UI_NODE_MAX_OLD_SPACE_SIZE"
export GEESOME_UI_PARCEL_WORKERS="$UI_PARCEL_WORKERS"
INPUT_HASH="$(node "$MANIFEST_TOOL" inputs "$UI_ROOT")"

if node "$MANIFEST_TOOL" verify "$PUBLISH_DIR" "$INPUT_HASH"; then
  echo "Reusing verified server frontend ($INPUT_HASH)."
  exit 0
fi

if node "$MANIFEST_TOOL" verify "$IMAGE_DIST" "$INPUT_HASH"; then
  echo "Reusing prepared Docker frontend ($INPUT_HASH)."
  UI_DIST="$IMAGE_DIST"
else
  echo "No matching frontend build; building from $UI_ROOT ($INPUT_HASH)..."
  # Unmanifested dist is not evidence that these sources were built.
  rm -rf "$UI_DIST"
  (
    cd "$UI_ROOT"
    setup_frontend_node
    build_frontend_dist
  )
  node "$MANIFEST_TOOL" create "$UI_DIST" "$INPUT_HASH"
fi

node "$MANIFEST_TOOL" verify "$UI_DIST" "$INPUT_HASH"
node "$MANIFEST_TOOL" publish "$UI_DIST" "$INPUT_HASH" "$PUBLISH_DIR"
echo "Published verified GeeSome UI dist to $PUBLISH_DIR"
