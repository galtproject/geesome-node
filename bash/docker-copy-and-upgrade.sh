#!/bin/bash

git checkout -- .
git pull

sudo chmod +x bash/*.sh && ./bash/docker-copy-app.sh

docker restart geesome