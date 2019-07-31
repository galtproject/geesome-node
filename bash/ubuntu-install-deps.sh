#!/bin/bash

sudo apt-get update

sudo debconf-set-selections <<< 'mysql-server-5.7 mysql-server/root_password password root'
sudo debconf-set-selections <<< 'mysql-server-5.7 mysql-server/root_password_again password root'

sudo apt-get install python build-essential libssl-dev mysql-server-5.7 ffmpeg -y
bash/create-database.sh
mysql -uroot -proot -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root'"

sudo apt-get install curl python-software-properties -y
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install nodejs -y

(sudo crontab -l 2>/dev/null; echo "0 1 * * * dpkg --list 'linux-image*'|awk '{ if ($1=="ii") print $2}'|grep -v `uname -r` | xargs apt-get purge $1 -y") | sudo crontab -
