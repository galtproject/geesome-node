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
# Analyze total available memory (RAM + swap) before the memory-heavy build.
MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
TOTAL_MB=$((MEM_MB + SWAP_MB))
MIN_MB=2048
if [ "$TOTAL_MB" -lt "$MIN_MB" ]; then
  echo "WARNING: only ${TOTAL_MB}MB total memory (RAM ${MEM_MB}MB + swap ${SWAP_MB}MB),"
  echo "below the ${MIN_MB}MB recommended for the build. The 'docker compose build' yarn"
  echo "step can run out of memory and fail with 'file appears to be corrupt' errors."
  echo "Run 'sudo bash/ubuntu-init-swapfile.sh' first to add swap, then re-run this script."
else
  echo "Memory OK: ${TOTAL_MB}MB total (RAM ${MEM_MB}MB + swap ${SWAP_MB}MB)."
fi

docker compose build --no-cache && mkdir -p .docker-data

sudo sed "s|/root/geesome-node|$PWD|g" < bash/geesome-docker.service > /etc/systemd/system/geesome-docker.service

sudo cp bash/geesome-ipfs-restart.service /etc/systemd/system/geesome-ipfs-restart.service
sudo cp bash/geesome-ipfs-restart.timer /etc/systemd/system/geesome-ipfs-restart.timer

sudo systemctl daemon-reload
systemctl enable geesome-docker
systemctl start geesome-docker
systemctl enable --now geesome-ipfs-restart.timer