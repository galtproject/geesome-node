#!/bin/bash

sudo apt-get update -y

sudo apt-get install apt-transport-https ca-certificates curl gnupg lsb-release -y
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y

sudo apt-get install docker-ce docker-ce-cli containerd.io -y

docker-compose build --no-cache && mkdir -p .docker-data

sudo sed "s|/root/geesome-node|$PWD|g" < bash/geesome-docker.service > /etc/systemd/system/geesome-docker.service

systemctl enable geesome-docker