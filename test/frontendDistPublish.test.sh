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
