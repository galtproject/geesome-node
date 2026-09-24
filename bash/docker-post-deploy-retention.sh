#!/bin/bash
set -euo pipefail

IMAGE_RETENTION="${GEESOME_DOCKER_IMAGE_RETENTION:-24h}"
BUILD_CACHE_RETENTION="${GEESOME_DOCKER_BUILD_CACHE_RETENTION:-24h}"
BUILD_CACHE_KEEP="${GEESOME_DOCKER_BUILD_CACHE_KEEP:-2GB}"

echo "==> Removing dangling images older than $IMAGE_RETENTION..."
docker image prune -f --filter "until=$IMAGE_RETENTION"

echo "==> Pruning unused build cache older than $BUILD_CACHE_RETENTION (keeping up to $BUILD_CACHE_KEEP)..."
docker builder prune -f \
  --filter "until=$BUILD_CACHE_RETENTION" \
  --keep-storage "$BUILD_CACHE_KEEP"

echo "==> Docker retention complete. Persistent volumes and active images were not pruned."
