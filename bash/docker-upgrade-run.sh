#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> [2/7] Preparing published image or local build..."
bash bash/docker-prepare-image.sh

# Existing installations must adopt the persisted-image launcher too.
SERVICE_DROPIN=/etc/systemd/system/geesome-docker.service.d
mkdir -p "$SERVICE_DROPIN"
printf '[Service]\nExecStart=\nExecStart=/bin/bash %s/bash/docker-compose.sh up -d --no-build\nExecStop=\nExecStop=/bin/bash %s/bash/docker-compose.sh down\n' "$ROOT_DIR" "$ROOT_DIR" > "$SERVICE_DROPIN/image-selection.conf"

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
bash bash/docker-compose.sh ps || true
echo "Follow node startup with: npm run docker-compose -- logs -f web"
