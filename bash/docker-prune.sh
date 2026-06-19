#!/bin/bash

# Reclaim space without nuking in-use or tagged base images. `docker system
# prune -af` removes ALL unused images (postgres/nginx/ipfs, and even a freshly
# built geesome-node-web when no container is holding it), which forces a full
# re-pull and rebuild on the next start. Prune only dangling images and the
# build cache instead, and drop dangling volumes.
docker image prune -f
docker builder prune -af
docker volume ls -qf dangling=true | xargs -r docker volume rm
