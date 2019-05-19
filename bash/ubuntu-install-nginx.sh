sudo apt-get update -y
sudo apt-get install nginx software-properties-common -y
sudo cp bash/uncert-nginx.conf /etc/nginx/sites-enabled/default

read -p "Enter Your Domain: "  appDomain
appDir="$(pwd)/frontend/dist"

read -p "Enter Your Email: "  userEmail

sudo sed -i -e "s~\%app_domain\%~$appDomain~g" /etc/nginx/sites-enabled/default
sudo sed -i -e "s~\%app_dir\%~$appDir~g" /etc/nginx/sites-enabled/default

sudo service nginx restart

sudo add-apt-repository universe -y
sudo add-apt-repository ppa:certbot/certbot -y
sudo apt-get update -y
sudo apt-get install certbot python-certbot-nginx  -y

sudo mkdir /var/www/$appDomain/
sudo chown -R www-data:www-data /var/www/
sudo certbot --webroot certonly -w=/var/www/$appDomain/ --email $userEmail --agree-tos -d $appDomain -n

sudo cp bash/nginx.conf /etc/nginx/geesome.conf

sudo sed -i -e "s~\%app_domain\%~$appDomain~g" /etc/nginx/sites-enabled/default
sudo sed -i -e "s~\%app_dir\%~$appDir~g" /etc/nginx/sites-enabled/default

sudo service nginx restart

(sudo crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --pre-hook 'service nginx stop' --post-hook 'service nginx start'") | sudo crontab -
(sudo crontab -l 2>/dev/null; echo "0 1 * * * dpkg --list 'linux-image*'|awk '{ if ($1=="ii") print $2}'|grep -v `uname -r` | xargs apt-get purge $1 -y") | sudo crontab -
