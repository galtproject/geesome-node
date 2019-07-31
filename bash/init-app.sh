#!/bin/bash

npm i -g yarn

yarn

# frontend
( cd frontend && yarn && npm run dev-build )

# backend
[ -z "$STORAGE_REPO" ] && STORAGE_REPO=``
[ -z "$DATABASE_NAME" ] && DATABASE_NAME=``

npm i -g pm2
pm2 install typescript
start_script=`DATABASE_NAME="$DATABASE_NAME" STORAGE_REPO="$STORAGE_REPO" pm2 start ./index.ts --name "geesome-node"`
$start_script
pm2 save
sudo pm2 startup
