sudo apt-get update
sudo apt-get install python build-essential libssl-dev mysql-server
mysql -uroot -proot -e "create database geesome_core;"
mysql -uroot -proot -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root'"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
echo "Then execute: nvm install 10.15 && nvm alias default 10.15 && nvm use default"
