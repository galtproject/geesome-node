#!/bin/bash

# Compose v2 names the image geesome-node-web (dash); v1 used geesome-node_web.
# Remove either if present, but do not gate the rebuild on it: rmi of a missing
# image exits non-zero, and --no-cache already forces a clean rebuild anyway.
docker rmi -f geesome-node-web geesome-node_web 2>/dev/null || true
docker compose build --no-cache && mkdir -p .docker-data