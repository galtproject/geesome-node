# Geesome Inter Planetary Social Protocol - A new open protocol for unstopable social networking and communication on IPFS

## About
GeeSome is a protocol that, on top of IPFS, defines the structure of social network data and provides a UI for storing and accessing this data. With the help of GeeSome Node, anyone can create an instance of a decentralized social network, with groups like in YouTube, Instagram or Telegram but with content preservation and no locks or censorship thanks to the concept of personal GeeSome Node using IPFS Node to store content, access data and receive updates by libp2p.

GeeSome Node can be used:
- to create and maintain your blog
- to save important content like Saved messages in telegrams and / or in the form of a file structure as in Google Drive
- as a media platform for adding and viewing / listening to audio and video content, creating playlists
- to share the uploaded content in any form (blog, playlist, file, folder)
- to create chat groups

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
| DATABASE_NAME | Database name to store app data. Default: ~/.jsipfs |
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
