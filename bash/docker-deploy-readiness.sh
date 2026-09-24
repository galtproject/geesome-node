#!/bin/bash
set -euo pipefail

CONTAINER_NAME="${GEESOME_DOCKER_WEB_CONTAINER:-geesome}"
READY_URL="${GEESOME_DOCKER_READY_URL:-http://127.0.0.1:2052/}"
READY_ATTEMPTS="${GEESOME_DOCKER_READY_ATTEMPTS:-60}"
READY_INTERVAL="${GEESOME_DOCKER_READY_INTERVAL_SECONDS:-2}"

for ((attempt = 1; attempt <= READY_ATTEMPTS; attempt += 1)); do
  running="$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || true)"
  if [ "$running" = "true" ] && curl -sS -o /dev/null --max-time 5 "$READY_URL"; then
    echo "GeeSome accepted an HTTP connection at $READY_URL."
    exit 0
  fi

  sleep "$READY_INTERVAL"
done

echo "GeeSome did not become ready after $((READY_ATTEMPTS * READY_INTERVAL)) seconds." >&2
docker compose ps >&2 || true
docker compose logs --tail=100 web >&2 || true
exit 1
