#!/bin/bash

sudo apt-get update -y
sudo apt-get install nginx software-properties-common -y
sudo cp bash/uncert-nginx.conf /etc/nginx/sites-enabled/default

[ -z "$DOMAIN" ] && read -p "Enter Your Domain: " DOMAIN

rootDir=`pwd`
frontendDir="$rootDir/frontend"
appDir="$frontendDir/dist/"

parentDir="/var/www"
wwwAppDir="$parentDir/geesome-frontend"

mkdir -p $wwwAppDir
ln -s $appDir $wwwAppDir

[ -z "$EMAIL" ] && read -p "Enter Your Email: " EMAIL

sudo chown www-data:$USER $parentDir
sudo chmod g+r $parentDir

sudo chown -R www-data:www-data $wwwAppDir
sudo chmod -R 755 $wwwAppDir

sudo sed -i -e "s~\%app_domain\%~$DOMAIN~g" /etc/nginx/sites-enabled/default
sudo sed -i -e "s~\%app_dir\%~$appDir~g" /etc/nginx/sites-enabled/default

sudo service nginx restart

sudo add-apt-repository universe -y
sudo add-apt-repository ppa:certbot/certbot -y
sudo apt-get update -y
sudo apt-get install certbot python-certbot-nginx  -y

sudo mkdir /var/www/$DOMAIN/ || :
sudo chown -R www-data:www-data /var/www/

certbotOutput=$( sudo certbot --webroot certonly -w=/var/www/$DOMAIN/ --email $EMAIL --agree-tos -d $DOMAIN -n 2>&1 )

echo "$certbotOutput";

if [[ ($certbotOutput == *"Congratulations"*)  || ($certbotOutput == *"not yet due for renewal"*) ]]; 
then
    sudo cp bash/nginx.conf /etc/nginx/sites-enabled/default
    
    sudo sed -i -e "s~\%app_domain\%~$DOMAIN~g" /etc/nginx/sites-enabled/default
    sudo sed -i -e "s~\%app_dir\%~$appDir~g" /etc/nginx/sites-enabled/default
    
    (sudo crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --pre-hook 'service nginx stop' --post-hook 'service nginx start'") | sudo crontab -
    
    printf "\nDomain certificate successfully received! Your Geesome node now available by domain: $DOMAIN\n";
    sudo service nginx restart
else
    printf "\nError on get certificate. Your Geesome node available without certificate anyway: $DOMAIN";
    printf "\nYou can check DNS settings of domain and run ./bash/ubuntu-install-nginx.hs again after the DNS settings are correct\n";
fi
