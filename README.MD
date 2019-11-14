<h1 align="center">
  <img src="https://github.com/galtproject/geesome-node/raw/master/frontend/assets/logos-long.png"
  alt="geesome" width="470"></a>
</h1>

<h3 align="center">File Storage and Social Media Node</h3>
<div align="center">
  Current state: 0.2.0 - Alpha
</div>

<br />

<div align="center">
<img src="https://img.shields.io/github/issues-raw/galtproject/geesome-node.svg?color=green&style=flat-square" alt="opened issues"/>
<img src="https://img.shields.io/github/issues-closed-raw/galtproject/geesome-node.svg?color=blue&style=flat-square" alt="closed issues" />
<img src="https://img.shields.io/github/issues-pr-closed/galtproject/geesome-node.svg?color=green&style=flat-square" alt="closed PR"/>
<img src="https://img.shields.io/github/issues-pr-raw/galtproject/geesome-node.svg?color=green&style=flat-square" alt="opened PR"/>
</div>
<br/>
<br/>
<div align="center">
  <img src="https://img.shields.io/badge/contributions-welcome-orange.svg?style=flat-square" alt="Contributions Welcome" />
  <a href="https://t.me/geesome"><img src="https://img.shields.io/badge/Join%20Us%20On-Telegram-2599D2.svg?style=flat-square" alt="Join Us On Telegram" /></a>
</div>
<br/>

# GeeSome Node
GeeSome Node allows you to run your own file storage with social media functional: 
make you own public or private group with posts and content.
It's a Node on top of IPFS for define and manage data structure of files, users and groups.
Node provides a UI for storing and accessing your saved data or remote data of other nodes: files, posts, groups.

![GeeSome Main Page](./frontend/assets/screenshots/main-page.png)

## About GeeSome Project
GeeSome protocol created to provide communication tool between communities of property owners in Galt Project. 

Galt Project team is aware of many cases of censorship and blocking in different social networks. These cases forced us to develop a new decentralized protocol and node application that would allow anyone to upload any content to his personal node and to share this content with the whole world without the risk of being blocked.

Using the GeeSome protocol, communities in the Galt Project will be able to communicate in encrypted chat groups, share images, video, text or any data.

We are sure that this tool should be used not only by the project's communities, but also by anyone who is concerned about the safety of their data, censorship and blocking in web.

## GeeSome Protocol
A new open protocol for unstopable social networking and communication on IPFS.
It defines the structure of social network data to describe familiar to the modern user entities: content, posts, tags, groups.

## GeeSome UI
GeeSome UI - it's Vue application, that using GeeSome node API for saving content and IPFS in-browser node for getting content. It's completly separated client from node and can be connected to any other GeeSome node. There are also many cases when it’s not necessary to use GeeSome UI. You can use GeeSome node API and GeesomeClient class in your projects for build you own UI with some important for you functions.

## Summary
With the help of GeeSome Node, anyone can create an instance of a decentralized social network, with groups like in YouTube, Instagram or Telegram but with content preservation and no locks or censorship thanks to the concept of personal GeeSome Node using IPFS Node to store content, access data and receive updates by libp2p.

GeeSome Node can be used:
- to create and maintain your blog
- to save important content like Saved messages in telegrams and / or in the form of a file structure as in Google Drive
- as a media platform for adding and viewing / listening to audio and video content, creating playlists
- to share the uploaded content in any form (blog, playlist, file, folder)
- to create chat groups

## GeeSome Scheme
![GeeSome-Scheme](https://user-images.githubusercontent.com/4842007/68893921-d912cf00-072e-11ea-8fe4-7d2937f32342.png)

You can run personal or public GeeSome node. It used for storing files, manage entities and prepare content for publishing.
Also because of IPNS updates issues - GeeSome node have IPNS caching based on signed PubSub events. 
Also there is an [issue](https://github.com/galtproject/geesome-node/issues/115) about IPNS keys of user. 
Currently its storing in GeeSome node, but need to improve it.

## UI Screenshots

### File explorer
![GeeSome File explorer](./frontend/assets/screenshots/file-explorer.png)

### Test group
![GeeSome Test Group](./frontend/assets/screenshots/test-group.png)

### Encrypted personal chat
![GeeSome Personal Chat](https://user-images.githubusercontent.com/4842007/68895796-b97da580-0732-11ea-9fad-cddfafe2c146.jpg)

### Mobile version
| Main page | Menu | Groups list | Group page |
| --- | --- | --- | --- |
| ![GeeSome Mobile UI](https://user-images.githubusercontent.com/4842007/62469801-5080ac00-b799-11e9-8fa7-374d2186665d.png) | ![GeeSome Mobile UI](https://user-images.githubusercontent.com/4842007/62469811-55ddf680-b799-11e9-9138-219be5cf1364.png) | ![GeeSome Mobile UI](https://user-images.githubusercontent.com/4842007/62469812-55ddf680-b799-11e9-8116-1c6692040422.png) | ![GeeSome Mobile UI](https://user-images.githubusercontent.com/4842007/62469813-56768d00-b799-11e9-87c5-7664103a2460.png) |

## Install with domain to your server
1. Set DNS settings for domain: ip address of server
2. Clone repo to server that bound to domain
```
git clone https://github.com/galtproject/geesome-node.git
```
3. Run script with parameters: domain and email for letsencrypt
```
cd geesome-node
export DOMAIN="your-site.com" EMAIL="info@your-site.com"; ./bash/full-install.sh 
```
There is additional parameters that can be used in export:

| Parameter | Description |
|-----|-------------|
| DATABASE_NAME | Database name to store app data. Default: `geesome-node` |
| STORAGE_REPO | Directory to store IPFS content. Default: `~/.jsipfs`  |

4. Open your-site.com/#/setup and create first admin user

## Getting started with GeeSome Node API
1. Get apiKey from GeeSome UI of your node
```
You can get your current session api key after login by enter localStorage.getItem('geesome-api-key') in browser console of UI page. Soon it will be more convenient and correct by keys generation in UI.
```
2. Install GeeSome libs by npm:
```
npm i --save git://github.com/galtproject/geesome-libs.git
```
or yarn:
```
yarn add git://github.com/galtproject/geesome-libs.git
```
3. Init GeeSome client and save image to your IPFS node
```javascript
const { GeesomeClient } = require('geesome-libs/src/GeesomeClient');

const geesomeClient = new GeesomeClient({
    server: 'https://your-site.com:7722', // or 'http://localhost:7711'
    // paste apiKey from GeeSome UI here
    apiKey: '4J1VYKW-ZP34Y0W-PREH1Q2-DYN9Q8E'
});
geesomeClient.init().then(async () => {
    const contentObj = await geesomeClient.saveDataByUrl('https://picsum.photos/500/300.jpg');
    
    console.log('content ipfs', contentObj.storageId);
    console.log('content manifest ipld', contentObj.manifestStorageId);
});
```
You can also use `geesomeClient.loginUserPass` for login via login and password without manually 
setting `apiKey`. But more safer to use `apiKey`, because you can always disable it `apiKey` and 
create another if there is a leak.

4. Create and publish IPFS site directory with content
```javascript
geesomeClient.init().then(async () => {
    await geesomeClient.saveDataByUrl('https://picsum.photos/500/300.jpg', {path: '/my-site/image.jpg'});
    
    await geesomeClient.saveContentData('<h1>Hello world!</h1> <img src="./image.jpg"/>', {path: '/my-site/index.html'});
    
    const mySiteFolder = await geesomeClient.getFileCatalogItemByPath('/my-site/', 'folder');
    
    const {storageId, staticId} = await geesomeClient.publishFolder(mySiteFolder.id);
    
    console.log(`check out by IPFS hash: ${geesomeClient.server}/ipfs/${storageId}/`); // for example: https://your-site.com:7722/ipfs/QmbDxAcbnSc5bgX77MgqqZ9bPVcczv5McZAYrWXoRxExi8/

    console.log(`check out by IPNS hash: ${geesomeClient.server}/ipns/${staticId}/`); // for example: https://your-site.com:7722/ipns/QmcqRcmu7p3UHkMPz8XJ886KPWbzxgpc9uNXy9GUDfUD87/
    
    // resolve IPNS by api:
    const resolvedStorageId = await geesomeClient.resolveIpns(staticId);
    
    console.log(storageId === resolvedStorageId); // true
});
```

## Current state and features:
- Encrypted personal messages
- Public channels and posts
- Streamable media api(video and audio)
- Basic file manager
- User profile
- Api keys for access to all node features
- Api keys managment in UI
- Separated content and folders list and access by users
- Users upload limits
- IPNS caching for fast resolving
- IPFS and IPNS directories for HTML sites and more
- Ethereum authentication by signature

## TODO:
- Share folder by ipld, ipns manifest
- Play audio and video content in groups as playlist
- Public chat groups
- Private chat groups
- Feed for aggregate channels, chats, personal messages like in Telegram
- Local IPNS accounts (in-browser) and signing authentication or publish transactions

## Minimal requirements
- System: Ubuntu 16.04
- 2 GB RAM
- 1 GB free HDD + space for your files

## Dependencies
- Node 10.x
- Mysql Server 5.7
- ffmpeg
- Cerbot(Letsencrypt)

## Local install and run
```
bash/ubuntu-install-deps.sh # if not ubuntu - execute commands manually for your OS
npm i -g yarn # install if not installed
yarn
npm rebuild youtube-dl
npm run start
```
In another terminal tab:
```
cd frontend && yarn
npm run local
```
Open UI by url: [http://localhost:8081/](http://localhost:8081/)

Api available by [http://localhost:7711](http://localhost:7711) endpoint.

## Links
- [Manifests example](./docs/manifests-example.md)
- [API](./components/api/http-v1/index.ts)
- [Libs repo](https://github.com/galtproject/geesome-libs)

## Articles
- [How to make the internet great again](https://medium.com/geesome/how-to-make-the-internet-great-again-with-the-help-of-geesome-and-ipfs-ae516aa06f89)
- Signing and encrypt messages by IPNS keys (Soon...)
- How to add site to IPFS with GeeSome node (Soon...)
- Use GeeSome as IPFS file storage in your decentralized project (Soon...)
- IPNS updates problem and how we solved it (Soon...)
- Are we ready for true decentralized messages and content? (Soon...)
- We need backups for our Social Neworks! (Soon...)

## Do you like the project? ✨
Put a star and fork it. Join Us On [Telegram](https://t.me/geesome). Thank you!
