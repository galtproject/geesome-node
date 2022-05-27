#!/bin/bash

[ -z "$DOMAIN" ] && read -p "Enter Your Geesome Node Domain: " DOMAIN
[ -z "$EMAIL" ] && read -p "Enter Your Email: " EMAIL

DOMAIN_FRONTEND_DIR="/var/www/geesome-frontend"
FRONTEND_DIST_DIR="$DOMAIN_FRONTEND_DIR/dist"

WWW_DOMAIN="/var/www/$DOMAIN/"

sudo mkdir -p $WWW_DOMAIN || :
sudo chown -R www-data:www-data $WWW_DOMAIN
sudo chmod -R 755 $WWW_DOMAIN

sudo mv /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default.bak
sudo cp bash/uncert-nginx.conf /etc/nginx/sites-enabled/default

sudo sed -i -e "s~\%app_domain\%~$DOMAIN~g" /etc/nginx/sites-enabled/default
sudo sed -i -e "s~\%app_dir\%~$FRONTEND_DIST_DIR~g" /etc/nginx/sites-enabled/default

sudo service nginx restart

certbotOutput=$( sudo certbot --webroot certonly -w=$WWW_DOMAIN --email $EMAIL --agree-tos -d $DOMAIN -n 2>&1 )
echo "$certbotOutput";

sudo mv /etc/nginx/sites-available/default.bak /etc/nginx/sites-enabled/default
sudo service nginx restart