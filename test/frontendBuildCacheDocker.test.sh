#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CASE_DIR="$(mktemp -d)"
IMAGE="geesome-frontend-cache-test:$$"
VOLUME="geesome-frontend-cache-test-$$"
trap 'docker volume rm "$VOLUME" >/dev/null 2>&1 || true; docker image rm "$IMAGE" >/dev/null 2>&1 || true; rm -rf "$CASE_DIR"' EXIT
mkdir -p "$CASE_DIR/bash" "$CASE_DIR/ui"
cp "$ROOT_DIR/bash/publish-frontend-dist.sh" "$ROOT_DIR/bash/frontend-build-manifest.mjs" "$CASE_DIR/bash/"
printf '%s\n' '{"name":"frontend-cache-fixture"}' > "$CASE_DIR/ui/package.json"
printf '%s\n' 'source' > "$CASE_DIR/ui/source.txt"
cat > "$CASE_DIR/ui/build.cjs" <<'JS'
const fs = require('fs');
if (process.env.RUNTIME === '1') {
  throw new Error('Unexpected runtime frontend build');
}
fs.mkdirSync('dist', {recursive: true});
fs.writeFileSync('dist/index.html', '<html>prepared in image</html>');
JS
cat > "$CASE_DIR/Dockerfile" <<'DOCKER'
FROM node:22.21.1-bookworm-slim AS inputs
COPY bash /app/bash
COPY ui /app/ui
ENV GEESOME_UI_ROOT=/app/ui GEESOME_UI_NODE_VERSION="" GEESOME_UI_BUILD_COMMAND="node build.cjs"
FROM inputs AS frontend-build
RUN GEESOME_FRONTEND_PUBLISH_DIR=/prepared bash /app/bash/publish-frontend-dist.sh
FROM inputs AS runtime
COPY --from=frontend-build /prepared /opt/geesome/frontend
ENV GEESOME_FRONTEND_PUBLISH_DIR=/published RUNTIME=1
CMD ["bash", "/app/bash/publish-frontend-dist.sh"]
DOCKER
docker build -q -t "$IMAGE" "$CASE_DIR"
docker volume create "$VOLUME" >/dev/null
FIRST="$(docker run --rm -v "$VOLUME:/published" "$IMAGE")"
printf '%s\n' "$FIRST"
[[ "$FIRST" == *'Reusing prepared Docker frontend'* ]]
SECOND="$(docker run --rm -v "$VOLUME:/published" "$IMAGE")"
printf '%s\n' "$SECOND"
[[ "$SECOND" == *'Reusing verified server frontend'* ]]
