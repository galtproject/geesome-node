#!/bin/bash
set -euo pipefail
cd /geesome-node
# Image construction has already installed dependencies and compiled the UI.
export GEESOME_FRONTEND_ALLOW_BUILD="${GEESOME_FRONTEND_ALLOW_BUILD:-0}"
bash bash/publish-frontend-dist.sh
npm run database:sync-models
npm run migrate-all-database
exec node --import tsx --experimental-global-customevent ./index.ts
