# Geesome

## Install with domain
1. Set DNS settings for domain: ip address of server
2. Clone repo to server that bound to domain
```
git clone https://github.com/galtspace/geesome-core.git
```
3. Run script with parameters: domain and email for letsencrypt
```
cd geesome-core
export domain="geesome.galtproject.io" email="info@galtproject.io"; ./bash/full-install.sh 
```
3. Enter your domain with login/password: admin/admin

## Minimal requirements
- System: Ubuntu 16.04
- 2 GB RAM
- 1 GB free HDD + space for your files

## Dependencies
- Node 10.x
- Mysql Server 5.7
- ffmpeg
