#!/bin/bash

git checkout -- .
git pull

./bash/docker-build.sh

systemctl restart geesome-docker