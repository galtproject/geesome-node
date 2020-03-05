#!/bin/bash

sudo apt-get update

sudo add-apt-repository ppa:jonathonf/ffmpeg-4 -y
sudo apt-get update

sudo apt-get install python build-essential libssl-dev postgresql postgresql-contrib ffmpeg -y

createuser -s geesome
sudo -u postgres psql -c "ALTER USER geesome PASSWORD 'geesome';"
adduser --disabled-password --gecos "" geesome
sudo -u geesome createdb geesome_node

sudo apt-get install curl python-software-properties -y
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install nodejs -y

(sudo crontab -l 2>/dev/null; echo "0 1 * * * dpkg --list 'linux-image*'|awk '{ if ($1=="ii") print $2}'|grep -v `uname -r` | xargs apt-get purge $1 -y") | sudo crontab -
