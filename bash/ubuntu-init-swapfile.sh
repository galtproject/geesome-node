#!/bin/bash

SIZE="${SIZE:-8G}"

ensure_swap_fstab() {
  if ! grep -Eq '^[[:space:]]*/swapfile[[:space:]]+' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  fi
}

if [ -n "$(swapon --show)" ]; then
  echo "Swap is already initialized:"
  swapon --show
  ensure_swap_fstab
  exit 0
fi

if [ -f /swapfile ]; then
  sudo chmod 600 /swapfile
  sudo swapon /swapfile
  sudo swapon --show
  ensure_swap_fstab
  exit 0
fi

sudo fallocate -l $SIZE /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
sudo swapon --show
ensure_swap_fstab
