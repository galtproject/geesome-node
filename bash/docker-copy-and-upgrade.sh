#!/bin/bash

git checkout -- .
git pull

sudo chmod +x bash/*.sh && ./bash/docker-copy-app.sh

systemctl daemon-reload
systemctl restart geesome-docker