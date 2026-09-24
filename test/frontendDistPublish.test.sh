#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

UI_ROOT="$TMP_DIR/ui"
PUBLISH_DIR="$TMP_DIR/published"
mkdir -p "$UI_ROOT/src" "$PUBLISH_DIR"

cat > "$UI_ROOT/index.html" <<'HTML'
<script type="module" src="/src/main.ts"></script>
HTML
cat > "$UI_ROOT/src/main.ts" <<'TS'
window.__sourceEntryLoaded = true;
TS
cat > "$UI_ROOT/package.json" <<'JSON'
{"name":"@geesome/ui-test"}
JSON
cat > "$UI_ROOT/yarn.lock" <<'YARN'
# source marker
YARN
cat > "$UI_ROOT/tsconfig.json" <<'JSON'
{}
JSON
cat > "$PUBLISH_DIR/stale.txt" <<'TXT'
old
TXT

GEESOME_UI_ROOT="$UI_ROOT" \
GEESOME_FRONTEND_PUBLISH_DIR="$PUBLISH_DIR" \
GEESOME_UI_NODE_VERSION= \
GEESOME_UI_BUILD_COMMAND='mkdir -p dist/assets && printf "%s\n" "<script type=\"module\" src=\"/assets/app.js\"></script>" > dist/index.html && printf "%s\n" "console.log(\"built\")" > dist/assets/app.js && cp package.json dist/package.json' \
  bash "$ROOT_DIR/bash/publish-frontend-dist.sh"

test -f "$PUBLISH_DIR/index.html"
test -f "$PUBLISH_DIR/assets/app.js"
test -f "$PUBLISH_DIR/package.json"
test ! -e "$PUBLISH_DIR/stale.txt"
test ! -e "$PUBLISH_DIR/src/main.ts"
test ! -e "$PUBLISH_DIR/yarn.lock"
test ! -e "$PUBLISH_DIR/tsconfig.json"
! grep -q '/src/main.ts' "$PUBLISH_DIR/index.html"

# Exercise the default build (not GEESOME_UI_BUILD_COMMAND) with an NVM switch
# that removes the backend bin directory and an npm default prefix off PATH.
REAL_NODE="$(command -v node)"
for scenario in existing-yarn install-yarn; do
  CASE_DIR="$TMP_DIR/$scenario"
  mkdir -p "$CASE_DIR/backend/bin" "$CASE_DIR/frontend/bin" "$CASE_DIR/nvm" "$CASE_DIR/ui"
  cp "$UI_ROOT/package.json" "$CASE_DIR/ui/package.json"
  ln -s "$REAL_NODE" "$CASE_DIR/frontend/bin/node"
  ln -s "$REAL_NODE" "$CASE_DIR/backend/bin/node"
  cat > "$CASE_DIR/yarn.js" <<'JS'
const fs = require('fs');
if (process.argv[2] === '--version') {
  console.log('1.22.22');
} else {
  if (process.env.YARN_IGNORE_ENGINES !== '1') process.exit(10);
  fs.mkdirSync('node_modules/.bin', {recursive: true});
  fs.writeFileSync('node_modules/.bin/parcel', 'require("fs").mkdirSync("dist", {recursive: true}); require("fs").writeFileSync("dist/index.html", "<html>built</html>");');
  fs.writeFileSync('run-terser.js', '');
  fs.writeFileSync('yarn-ran', process.execPath);
}
JS
  if [ "$scenario" = existing-yarn ]; then
    cp "$CASE_DIR/yarn.js" "$CASE_DIR/backend/bin/yarn"
    chmod +x "$CASE_DIR/backend/bin/yarn"
  fi
  cat > "$CASE_DIR/nvm/nvm.sh" <<'SH'
nvm() {
  export PATH="$CASE_DIR/frontend/bin:/usr/bin:/bin"
}
SH
  cat > "$CASE_DIR/frontend/bin/npm" <<'SH'
#!/bin/bash
set -eu
# Reproduce npm reporting success while its global prefix is off PATH.
if [ "$1" = i ] && [ "$2" = -g ]; then
  mkdir -p "$CASE_DIR/off-path/bin"
  cp "$CASE_DIR/yarn.js" "$CASE_DIR/off-path/bin/yarn"
  exit 0
fi
test "$1" = install
test "$2" = --global
test "$3" = --prefix
test "$4" = "$CASE_DIR/frontend"
test "$5" = yarn@1.22.22
cp "$CASE_DIR/yarn.js" "$4/bin/yarn"
SH
  chmod +x "$CASE_DIR/frontend/bin/npm"
  CASE_DIR="$CASE_DIR" PATH="$CASE_DIR/backend/bin:/usr/bin:/bin" \
    NVM_DIR="$CASE_DIR/nvm" GEESOME_UI_ROOT="$CASE_DIR/ui" \
    GEESOME_FRONTEND_PUBLISH_DIR="$CASE_DIR/published" \
    GEESOME_UI_NODE_VERSION=18.20.8 \
    bash "$ROOT_DIR/bash/publish-frontend-dist.sh"
  test -f "$CASE_DIR/ui/yarn-ran"
  test -f "$CASE_DIR/published/index.html"
  test -f "$CASE_DIR/published/package.json"
done

node --test "$ROOT_DIR/test/frontendBuildCache.test.mjs"
