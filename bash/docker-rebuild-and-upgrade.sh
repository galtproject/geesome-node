#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> [1/4] Updating source (git pull --ff-only)..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to upgrade with uncommitted local changes:"
  git status --short
  echo "Commit or stash the local changes, then rerun npm run docker-upgrade."
  exit 1
fi

git pull --ff-only

if [ -f .gitmodules ]; then
  git submodule update --init --recursive
fi

sudo chmod +x bash/*.sh

exec bash "$ROOT_DIR/bash/docker-upgrade-run.sh"
