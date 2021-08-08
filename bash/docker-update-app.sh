#!/bin/bash

docker cp index.ts geesome:/geesome-node/
docker cp publish-docs.ts geesome:/geesome-node/
docker cp components/. geesome:/geesome-node/components/
