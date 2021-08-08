#!/bin/bash

git checkout -- .
git pull

sudo chmod +x bash/*.sh && ./bash/docker-build.sh

systemctl restart geesome-docker