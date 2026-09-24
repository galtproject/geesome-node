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
console.log('FIXTURE_FRONTEND_COMPILED');
fs.mkdirSync('dist', {recursive: true});
fs.writeFileSync('dist/index.html', '<html>prepared in image</html>');
JS
cat > "$CASE_DIR/Dockerfile" <<'DOCKER'
# syntax=docker/dockerfile:1.7
FROM node:22.21.1-bookworm-slim AS inputs
COPY bash /app/bash
COPY ui /app/ui
ENV GEESOME_UI_ROOT=/app/ui GEESOME_UI_NODE_VERSION="" GEESOME_UI_BUILD_COMMAND="node build.cjs"
FROM inputs AS frontend-build
ARG CACHE_ID
ARG BACKEND_REVISION
ARG FORBID_BUILD=0
RUN --mount=type=cache,id=${CACHE_ID},target=/frontend-cache,sharing=locked \
    echo "Backend revision: $BACKEND_REVISION" && \
    RUNTIME=$FORBID_BUILD GEESOME_FRONTEND_BUILD_CACHE=/frontend-cache GEESOME_FRONTEND_PUBLISH_DIR=/prepared bash /app/bash/publish-frontend-dist.sh
FROM inputs AS runtime
COPY --from=frontend-build /prepared /opt/geesome/frontend
ENV GEESOME_FRONTEND_PUBLISH_DIR=/published RUNTIME=1
CMD ["bash", "/app/bash/publish-frontend-dist.sh"]
DOCKER
build_image() {
  docker build --progress=plain --build-arg CACHE_ID="$VOLUME" \
    --build-arg BACKEND_REVISION="$1" --build-arg FORBID_BUILD="$2" \
    -t "$IMAGE" "$CASE_DIR" > "$CASE_DIR/build.log" 2>&1 || {
      cat "$CASE_DIR/build.log"
      return 1
    }
}
build_image first 0
grep 'FIXTURE_FRONTEND_COMPILED' "$CASE_DIR/build.log"
# Invalidate the RUN layer, and fail if the compiler is invoked.
build_image backend-only-change 1
grep 'Reusing BuildKit frontend cache' "$CASE_DIR/build.log"
printf '%s\n' 'custom source' > "$CASE_DIR/ui/source.txt"
build_image frontend-change 0
grep 'FIXTURE_FRONTEND_COMPILED' "$CASE_DIR/build.log"
# Both frontend versions remain available, keyed by their input fingerprints.
printf '%s\n' 'source' > "$CASE_DIR/ui/source.txt"
build_image return-to-original 1
grep 'Reusing BuildKit frontend cache' "$CASE_DIR/build.log"
docker volume create "$VOLUME" >/dev/null
FIRST="$(docker run --rm -v "$VOLUME:/published" "$IMAGE")"
printf '%s\n' "$FIRST"
[[ "$FIRST" == *'Reusing prepared Docker frontend'* ]]
SECOND="$(docker run --rm -v "$VOLUME:/published" "$IMAGE")"
printf '%s\n' "$SECOND"
[[ "$SECOND" == *'Reusing verified server frontend'* ]]
