#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> [2/4] Building geesome-node-web image with Docker cache..."
if ! ./bash/docker-build.sh; then
  echo "==> Build failed. Pruning Docker caches and retrying once..."
  ./bash/docker-prune.sh --aggressive --repo-build-cache
  ./bash/docker-build.sh
fi

echo "==> [3/4] Checking IPFS repo ownership before restart..."
./bash/ipfs-ownership-preflight.sh

echo "==> [4/4] Restarting geesome-docker (recreating containers with the new image)..."
systemctl daemon-reload
systemctl restart geesome-docker

echo "==> Build caches preserved for faster future upgrades."
echo "==> Done. Current containers:"
docker compose ps || true
echo "Follow node startup with: docker compose logs -f web"
