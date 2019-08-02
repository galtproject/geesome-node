<h1 align="center">
  <img src="https://github.com/galtspace/geesome-node/raw/master/frontend/assets/logos-long.png"
  alt="geesome" width="470"></a>
</h1>

<h3 align="center">File Storage and Social Media Node</h3>
<div align="center">
  Current state: 0.2 - Alpha
</div>

<br />

<div align="center">
<img src="https://img.shields.io/github/issues-raw/galtspace/geesome-node.svg?color=green&style=flat-square" alt="opened issues"/>
<img src="https://img.shields.io/github/issues-closed-raw/galtspace/geesome-node.svg?color=blue&style=flat-square" alt="closed issues" />
<img src="https://img.shields.io/github/issues-pr-closed/galtspace/geesome-node.svg?color=green&style=flat-square" alt="closed PR"/>
<img src="https://img.shields.io/github/issues-pr-raw/galtspace/geesome-node.svg?color=green&style=flat-square" alt="opened PR"/>
</div>
<br/>
<br/>
<div align="center">
  <img src="https://img.shields.io/badge/contributions-welcome-orange.svg?style=flat-square" alt="Contributions Welcome" />
  <a href="https://t.me/fuckgoogle"> <img src="https://img.shields.io/badge/Join%20Us%20On-Telegram-2599D2.svg?style=flat-square" alt="Join Us On Telegram" /></a>
</div>
<br/>

# GeeSome Node
GeeSome Node allows you to run your own file storage with social media functional: 
make you own public or private group with posts and content.
It's a Node on top of IPFS for define and manage data structure of files, users and groups.
Node provides a UI for storing and accessing your saved data or remote data of other nodes: files, posts, groups.

## GeeSome Protocol
A new open protocol for unstopable social networking and communication on IPFS.
It defines the structure of social network data to describe familiar to the modern user entities: content, posts, tags, groups.

## Summary
With the help of GeeSome Node, anyone can create an instance of a decentralized social network, with groups like in YouTube, Instagram or Telegram but with content preservation and no locks or censorship thanks to the concept of personal GeeSome Node using IPFS Node to store content, access data and receive updates by libp2p.

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
git clone https://github.com/galtspace/geesome-node.git
```
3. Run script with parameters: domain and email for letsencrypt
```
cd geesome-node
export DOMAIN="your-site.com" EMAIL="info@your-site.com"; ./bash/full-install.sh 
```
There is additional parameters that can be used in export:

| Parameter | Description |
|-----|-------------|
| DATABASE_NAME | Database name to store app data. Default: ~/.jsipfs |
| STORAGE_REPO | Directory to store IPFS content  |

4. Open your-site.com/#/setup and create first admin user

## Minimal requirements
- System: Ubuntu 16.04
- 2 GB RAM
- 1 GB free HDD + space for your files

## Dependencies
- Node 10.x
- Mysql Server 5.7
- ffmpeg
- Cerbot(Letsencrypt)

## Links
- [Manifests example](./docs/manifests-example.md)
- [API](./components/api/http-v1/index.ts)
- [Libs repo](https://github.com/galtspace/geesome-libs)
