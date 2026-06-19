#!/bin/bash
set -e

# TODO: ask user if there is uncomitted changes
echo "==> [1/4] Updating source (git pull)..."
git checkout -- .
git pull

sudo chmod +x bash/*.sh

echo "==> [2/4] Building geesome-node-web image (--no-cache; can take several minutes)..."
./bash/docker-build.sh

# Restart BEFORE prune so the new image and base images are held by running
# containers; otherwise prune would remove the just-built image and force a
# full rebuild/re-pull on the next start.
echo "==> [3/4] Restarting geesome-docker (recreating containers with the new image)..."
systemctl daemon-reload
systemctl restart geesome-docker

echo "==> [4/4] Pruning dangling images and build cache..."
./bash/docker-prune.sh

echo "==> Done. Current containers:"
docker compose ps || true
echo "Follow node startup with: docker compose logs -f web"
