#!/bin/bash

[ -z "$SIZE" ] && SIZE="8G"

sudo fallocate -l $SIZE /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
sudo swapon --show