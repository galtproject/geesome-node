sudo apt-get update
sudo apt-get install python build-essential libssl-dev mysql-server
mysql -uroot -proot -e "create database geesome_core; ALTER DATABASE geesome_core CHARACTER SET utf8 COLLATE utf8_general_ci;"
mysql -uroot -proot -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root'"

sudo apt-get install curl python-software-properties
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install nodejs
