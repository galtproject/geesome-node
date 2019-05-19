sudo apt-get update -y
sudo apt-get install nginx software-properties-common -y
sudo cp bash/uncert-nginx.conf /etc/nginx/geesome.conf

read -p "Enter Your Domain: "  appDomain
appDir=`pwd`

read -p "Enter Your Email: "  userEmail

sudo sed -ie "s~\%app_domain\%~$appDomain~g" /etc/sites-enabled/default
sudo sed -ie "s~\%app_dir\%~$appDir~g" /etc/sites-enabled/default

sudo service nginx restart

sudo add-apt-repository universe -y
sudo add-apt-repository ppa:certbot/certbot -y
sudo apt-get update -y
sudo apt-get install certbot python-certbot-nginx  -y

sudo mkdir /var/www/$appDomain/
sudo chmod -R www-data:www-data /var/www/
sudo certbot --webroot certonly -w=/var/www/$appDomain/ --email $userEmail --agree-tos -d $appDomain -n

sudo cp bash/nginx.conf /etc/nginx/geesome.conf

sudo sed -ie "s~\%app_domain\%~$appDomain~g" /etc/sites-enabled/default
sudo sed -ie "s~\%app_dir\%~$appDir~g" /etc/sites-enabled/default

sudo service nginx restart

(crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --pre-hook 'service nginx stop' --post-hook 'service nginx start'") | crontab -
