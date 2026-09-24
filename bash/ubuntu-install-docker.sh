#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
source bash/docker-image-common.sh
clean_revision > /dev/null

sudo apt-get update -y

sudo apt-get install apt-transport-https ca-certificates curl gnupg lsb-release -y
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y

sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y

bash bash/docker-prepare-image.sh

sed "s|/root/geesome-node|$PWD|g" < bash/geesome-docker.service | sudo tee /etc/systemd/system/geesome-docker.service > /dev/null

sudo cp bash/geesome-ipfs-restart.service /etc/systemd/system/geesome-ipfs-restart.service
sudo cp bash/geesome-ipfs-restart.timer /etc/systemd/system/geesome-ipfs-restart.timer

sudo systemctl daemon-reload
systemctl enable geesome-docker
systemctl start geesome-docker
bash bash/docker-deploy-readiness.sh
systemctl enable --now geesome-ipfs-restart.timer
