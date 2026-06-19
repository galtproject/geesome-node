#!/bin/bash

[ -z "$SIZE" ] && SIZE="8G"

if [ -n "$(swapon --show)" ] || [ -f /swapfile ]; then
  echo "Swap is already initialized:"
  swapon --show
  exit 0
fi

sudo fallocate -l $SIZE /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
sudo swapon --show