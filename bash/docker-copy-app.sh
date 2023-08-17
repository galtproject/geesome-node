#!/bin/bash

docker cp index.ts geesome:/geesome-node/
docker cp publish-docs.ts geesome:/geesome-node/
docker cp package.json geesome:/geesome-node/
docker cp yarn.lock geesome:/geesome-node/
docker cp app/. geesome:/geesome-node/app/
docker cp check/. geesome:/geesome-node/check/

