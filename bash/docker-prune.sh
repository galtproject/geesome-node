#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="standard"
REMOVE_REPO_CACHE="0"

for arg in "$@"; do
  case "$arg" in
    --aggressive|aggressive)
      MODE="aggressive"
      ;;
    --repo-build-cache)
      REMOVE_REPO_CACHE="1"
      ;;
    *)
      echo "Usage: bash/docker-prune.sh [--aggressive] [--repo-build-cache]"
      exit 1
      ;;
  esac
done

# Reclaim space without nuking in-use images. Normal upgrades preserve build
# caches; this script is for explicit cleanup or failed-build retry fallback.
docker image prune -f

if [ "$MODE" = "aggressive" ]; then
  docker builder prune -af
  docker volume prune -f
else
  docker builder prune -f
  docker volume ls -qf dangling=true | xargs -r docker volume rm
fi

if [ "$REMOVE_REPO_CACHE" = "1" ] && [ -d "$ROOT_DIR/.docker-build-cache" ]; then
  rm -rf "$ROOT_DIR/.docker-build-cache"
fi
