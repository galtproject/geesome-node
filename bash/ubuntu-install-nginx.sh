sudo apt-get update -y
sudo apt-get install nginx software-properties-common -y
sudo cp bash/uncert-nginx.conf /etc/nginx/geesome.conf

read -p "Enter Your Domain: "  appDomain
appDir="$(pwd)"

read -p "Enter Your Email: "  userEmail

sudo sed -ie "s/\%app_domain\%/$appDomain/g" /etc/nginx/geesome.conf
sudo sed -ie "s/\%app_dir\%/$appDir/g" /etc/nginx/geesome.conf

sudo service nginx restart

sudo add-apt-repository universe -y
sudo add-apt-repository ppa:certbot/certbot -y
sudo apt-get update -y
sudo apt-get install certbot python-certbot-nginx  -y

sudo mkdir /var/www/$appDomain/
sudo certbot --webroot certonly -w=/var/www/$appDomain/ --email $userEmail --agree-tos -d $appDomain

sudo cp bash/nginx.conf /etc/nginx/geesome.conf

sudo sed -ie "s/\%app_domain\%/$appDomain/g" /etc/nginx/geesome.conf
sudo sed -ie "s/\%app_dir\%/$appDir/g" /etc/nginx/geesome.conf

sudo service nginx restart
