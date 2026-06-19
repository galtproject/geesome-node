#!/bin/bash

sudo apt-get update -y

sudo apt-get install apt-transport-https ca-certificates curl gnupg lsb-release -y
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y

sudo apt-get install docker-ce docker-ce-cli containerd.io -y

sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

sudo chmod +x /usr/local/bin/docker-compose

# Low memory makes the yarn build corrupt its cache during extraction.
# Confirm swap is active before the memory-heavy build.
if [ -n "$(swapon --show)" ]; then
  echo "Swap is initialized:"
  swapon --show
else
  echo "WARNING: no active swap detected. The 'docker compose build' yarn step can"
  echo "run out of memory and fail with 'file appears to be corrupt' errors."
  echo "Run 'sudo bash/ubuntu-init-swapfile.sh' first, then re-run this script."
fi

docker compose build --no-cache && mkdir -p .docker-data

sudo sed "s|/root/geesome-node|$PWD|g" < bash/geesome-docker.service > /etc/systemd/system/geesome-docker.service

sudo cp bash/geesome-ipfs-restart.service /etc/systemd/system/geesome-ipfs-restart.service
sudo cp bash/geesome-ipfs-restart.timer /etc/systemd/system/geesome-ipfs-restart.timer

sudo systemctl daemon-reload
systemctl enable geesome-docker
systemctl start geesome-docker
systemctl enable --now geesome-ipfs-restart.timer