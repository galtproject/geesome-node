#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
STATE="$ROOT_DIR/.docker-deploy/image"
args=(--project-directory "$ROOT_DIR" -f "$ROOT_DIR/docker-compose.yml")
if [ -f "$STATE" ]; then
  IMAGE="$(cat "$STATE")"
  if ! [[ "$IMAGE" =~ ^sha256:[a-f0-9]{64}$ || "$IMAGE" =~ ^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$ ]]; then
    echo "Invalid deployment image state: $STATE" >&2
    exit 1
  fi
  OVERRIDE="$(mktemp)"
  trap 'rm -f "$OVERRIDE"' EXIT
  printf 'services:\n  web:\n    image: "%s"\n    pull_policy: never\n' "$IMAGE" > "$OVERRIDE"
  args+=(-f "$OVERRIDE")
fi
docker compose "${args[@]}" "$@"
