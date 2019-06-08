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
export DOMAIN="geesome.galtproject.io" EMAIL="info@galtproject.io"; ./bash/full-install.sh 
```
There is additional parameters that can be used in export:

| Parameter | Description |
|-----|-------------|
| DATABASE_NAME | Database name to store app data |
| STORAGE_REPO | Directory to store IPFS content  |

3. Enter your domain with login/password: admin/admin

## Minimal requirements
- System: Ubuntu 16.04
- 2 GB RAM
- 1 GB free HDD + space for your files

## Dependencies
- Node 10.x
- Mysql Server 5.7
- ffmpeg
- Cerbot(Letsencrypt)
