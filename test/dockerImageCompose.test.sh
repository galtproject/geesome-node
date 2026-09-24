#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
PROJECT="geesome-image-selection-$$"
cleanup() {
  bash "$WORK/bash/docker-compose.sh" -p "$PROJECT" down >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
mkdir -p "$WORK/bash" "$WORK/.docker-deploy"
cp "$ROOT/bash/docker-compose.sh" "$WORK/bash/"
docker image inspect node:22.21.1-bookworm-slim >/dev/null 2>&1 || docker pull node:22.21.1-bookworm-slim
docker image inspect --format '{{.Id}}' node:22.21.1-bookworm-slim > "$WORK/.docker-deploy/image"
cat > "$WORK/docker-compose.yml" <<'YAML'
services:
  web:
    image: deliberately-unavailable.invalid/geesome:do-not-pull
    command: ["node", "-e", "console.log('persisted image selected')"]
YAML
bash "$WORK/bash/docker-compose.sh" -p "$PROJECT" up --no-build --abort-on-container-exit --exit-code-from web
# A new invocation has no exported image selection; it reads the state again.
bash "$WORK/bash/docker-compose.sh" -p "$PROJECT" up --no-build --abort-on-container-exit --exit-code-from web
