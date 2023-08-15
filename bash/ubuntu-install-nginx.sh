#!/bin/bash

sudo apt-get update -y
sudo apt-get install nginx software-properties-common -y
sudo cp bash/uncert-nginx.conf /etc/nginx/sites-enabled/default

[ -z "$DOMAIN" ] && read -p "Enter Your Geesome Node Domain: " DOMAIN
[ -z "$EMAIL" ] && read -p "Enter Your Email: " EMAIL
[ -z "$GATEWAY" ] && read -p "Do you want to install gateway?(y/n) " GATEWAY

sudo add-apt-repository universe -y
sudo add-apt-repository ppa:certbot/certbot -y
sudo apt-get update -y
sudo apt-get install certbot python3-certbot-nginx  -y

DOMAIN_FRONTEND_DIR="/var/www/geesome-frontend"
GATEWAY_DOMAIN="gateway.$DOMAIN"

WWW_DOMAIN="/var/www/$DOMAIN/"
WWW_GATEWAY_DOMAIN="/var/www/$GATEWAY_DOMAIN/"

sudo mkdir -p $WWW_DOMAIN || :
sudo chown -R www-data:www-data $WWW_DOMAIN
sudo chmod -R 755 $WWW_DOMAIN

sudo mkdir -p $DOMAIN_FRONTEND_DIR || :
sudo chown -R www-data:www-data $DOMAIN_FRONTEND_DIR
sudo chmod -R 755 $DOMAIN_FRONTEND_DIR

sudo chmod -R 755 $DOMAIN_FRONTEND_DIR
sudo chown -R www-data:www-data $DOMAIN_FRONTEND_DIR

sudo sed -i -e "s~\%app_domain\%~$DOMAIN~g" /etc/nginx/sites-enabled/default
sudo sed -i -e "s~\%app_dir\%~$DOMAIN_FRONTEND_DIR~g" /etc/nginx/sites-enabled/default

sudo service nginx restart

if [[ ($GATEWAY == *"y"*) || ($GATEWAY == *"1"*) ]];
then
  sudo mkdir -p $WWW_GATEWAY_DOMAIN || :
  sudo chown -R www-data:www-data $WWW_GATEWAY_DOMAIN
  sudo chmod -R 755 $WWW_GATEWAY_DOMAIN
  certbotOutput=$( sudo certbot --webroot certonly -w=$WWW_GATEWAY_DOMAIN --email $EMAIL --agree-tos -d $GATEWAY_DOMAIN -n 2>&1 )
  echo "$certbotOutput";
fi

certbotOutput=$( sudo certbot --webroot certonly -w=$WWW_DOMAIN --email $EMAIL --agree-tos -d $DOMAIN -n 2>&1 )
echo "$certbotOutput";

if [[ ($certbotOutput == *"Congratulations"*)  || ($certbotOutput == *"not yet due for renewal"*) ]];
then
    if [ ! -z "$CF" ]
    then
        sudo cp bash/cf-nginx.conf /etc/nginx/sites-enabled/default
    else
        sudo cp bash/nginx.conf /etc/nginx/sites-enabled/default
    fi

    sudo sed -i -e "s~\%app_domain\%~$DOMAIN~g" /etc/nginx/sites-enabled/default
    sudo sed -i -e "s~\%app_dir\%~$DOMAIN_FRONTEND_DIR~g" /etc/nginx/sites-enabled/default
    
    (sudo crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --pre-hook 'service nginx stop' --post-hook 'service nginx start'") | sudo crontab -
    
    printf "\nDomain certificate successfully received! Your Geesome node now available by domain: $DOMAIN\n";
    sudo service nginx restart
else
    printf "\nError on get certificate. Your Geesome node available without certificate anyway: $DOMAIN";
    printf "\nYou can check DNS settings of domain and run ./bash/ubuntu-install-nginx.hs again after the DNS settings are correct\n";
fi
