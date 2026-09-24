#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> [2/7] Building geesome-node-web image with Docker cache..."
if ! ./bash/docker-build.sh; then
  echo "==> Build failed. Pruning Docker caches and retrying once..."
  ./bash/docker-prune.sh --aggressive --repo-build-cache
  ./bash/docker-build.sh
fi

echo "==> [3/7] Checking IPFS repo ownership before restart..."
./bash/ipfs-ownership-preflight.sh

echo "==> [4/7] Restarting geesome-docker (recreating containers with the new image)..."
systemctl daemon-reload
systemctl restart geesome-docker

echo "==> [5/7] Waiting for the replacement web container..."
./bash/docker-deploy-readiness.sh

echo "==> [6/7] Applying bounded host journal retention..."
./bash/install-host-retention.sh

echo "==> [7/7] Applying safe Docker retention..."
./bash/docker-post-deploy-retention.sh

echo "==> Done. Current containers:"
docker compose ps || true
echo "Follow node startup with: docker compose logs -f web"
