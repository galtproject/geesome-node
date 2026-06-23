#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p .docker-data .docker-build-cache

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

CACHE_LOG="$(mktemp)"
trap 'rm -f "$CACHE_LOG"' EXIT

BUILDX_DRIVER="$(docker buildx inspect 2>/dev/null | awk -F': *' '/^Driver:/ { print $2; exit }' || true)"
CACHE_EXPORT_MODE="${GEESOME_DOCKER_CACHE_EXPORT:-auto}"
USE_EXTERNAL_CACHE="0"

case "$CACHE_EXPORT_MODE" in
  1|true|yes)
    USE_EXTERNAL_CACHE="1"
    ;;
  0|false|no)
    USE_EXTERNAL_CACHE="0"
    ;;
  auto)
    if [ -n "$BUILDX_DRIVER" ] && [ "$BUILDX_DRIVER" != "docker" ]; then
      USE_EXTERNAL_CACHE="1"
    fi
    ;;
  *)
    echo "GEESOME_DOCKER_CACHE_EXPORT must be auto, 1, or 0."
    exit 1
    ;;
esac

if [ "$USE_EXTERNAL_CACHE" = "1" ]; then
  if docker compose -f docker-compose.yml -f docker-compose.build-cache.yml build web 2>&1 | tee "$CACHE_LOG"; then
    exit 0
  fi

  if ! grep -qi "cache export is not supported" "$CACHE_LOG"; then
    exit 1
  fi

  echo "Docker build cache export is not supported by this builder; retrying without external cache export."
fi

if [ "$CACHE_EXPORT_MODE" = "auto" ] && [ "$BUILDX_DRIVER" = "docker" ]; then
  echo "Docker buildx driver is docker; using normal Docker layer cache without external cache export."
fi

docker compose build web
