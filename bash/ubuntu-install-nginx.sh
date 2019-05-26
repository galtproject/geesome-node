sudo apt-get update -y
sudo apt-get install nginx software-properties-common -y
sudo cp bash/uncert-nginx.conf /etc/nginx/sites-enabled/default

read -p "Enter Your Domain: "  appDomain
rootDir=`pwd`
parentDir=`dirname "$rootDir"`
appDir="$rootDir/frontend/dist/"

read -p "Enter Your Email: "  userEmail

sudo chown www-data:$USER $parentDir
sudo chmod g+r $parentDir
sudo chown www-data:$USER $rootDir
sudo chmod g+r $rootDir
sudo chown www-data:$USER $rootDir/frontend
sudo chmod g+r $rootDir/frontend

sudo chown -R www-data:www-data $rootDir/frontend/dist
sudo chmod -R 755 $rootDir/frontend/dist

sudo sed -i -e "s~\%app_domain\%~$appDomain~g" /etc/nginx/sites-enabled/default
sudo sed -i -e "s~\%app_dir\%~$appDir~g" /etc/nginx/sites-enabled/default

sudo service nginx restart

sudo add-apt-repository universe -y
sudo add-apt-repository ppa:certbot/certbot -y
sudo apt-get update -y
sudo apt-get install certbot python-certbot-nginx  -y

sudo mkdir /var/www/$appDomain/ || :
sudo chown -R www-data:www-data /var/www/

certbotOutput=$( sudo certbot --webroot certonly -w=/var/www/$appDomain/ --email $userEmail --agree-tos -d $appDomain -n 2>&1 )

echo "$certbotOutput";

if [[ ($certbotOutput == *"Congratulations"*)  || ($certbotOutput == *"not yet due for renewal"*) ]]; 
then
    sudo cp bash/nginx.conf /etc/nginx/sites-enabled/default
    
    sudo sed -i -e "s~\%app_domain\%~$appDomain~g" /etc/nginx/sites-enabled/default
    sudo sed -i -e "s~\%app_dir\%~$appDir~g" /etc/nginx/sites-enabled/default
    
    (sudo crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --pre-hook 'service nginx stop' --post-hook 'service nginx start'") | sudo crontab -
    
    printf "\nDomain certificate successfully received! Your Geesome node now available by domain: $appDomain";
    sudo service nginx restart
else
    printf "\nError on get certificate. Your Geesome node available without certificate anyway: $appDomain";
    printf "\nYou can check DNS settings of domain and run ./bash/ubuntu-install-nginx.hs again after the DNS settings are correct";
fi
