sudo apt-get update
sudo apt-get install python build-essential libssl-dev mysql-server
mysql -uroot -proot -e "create database geesome_core; use geesome_core; ALTER TABLE geesome_core CONVERT TO CHARACTER SET utf8 COLLATE utf8_general_ci; ALTER TABLE geesome_core DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;"
mysql -uroot -proot -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root'"

#wget https://dist.ipfs.io/go-ipfs/v0.4.20/go-ipfs_v0.4.20_linux-amd64.tar.gz
#tar xvfz go-ipfs_v0.4.20_linux-amd64.tar.gz
#sudo mv go-ipfs/ipfs /usr/local/bin/ipfs
#rm go-ipfs_v0.4.20_linux-amd64.tar.gz && rm -R ./go-ipfs
#IPFS_PATH=~/.ipfs ipfs init --profile server
#cp bash/go-ipfs.service /lib/systemd/system/go-ipfs.service
#systemctl daemon-reload && systemctl start go-ipfs

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
echo "Then execute: nvm install 10.15 && nvm alias default 10.15 && nvm use default"
