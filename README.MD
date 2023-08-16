<h1 align="center">
  <img src="https://github.com/galtproject/geesome-node/assets/4842007/6ecd86d3-fdfb-4055-9b55-ab2eecb9f957"
  alt="geesome" width="470"></a>
</h1>

<h3 align="center">File Storage and Social Media Node</h3>
<div align="center">
  Current state: 0.3.0 - Beta
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
Node provides an UI and API for storing and accessing your saved data or remote data of other nodes: files, posts, groups.

![GeeSome Main Page](https://github.com/galtproject/geesome-node/assets/4842007/6779b4a3-cca5-4da6-815f-c5c14d9be0b9)

## About GeeSome Project
GeeSome protocol created to provide communication tool between communities of property owners in Galt Project. 

Galt Project team is aware of many cases of censorship and blocking in different social networks. These cases forced us to develop a new decentralized protocol and node application that would allow anyone to upload any content to his personal node and to share this content with the whole world without the risk of being blocked.

Using the GeeSome protocol, communities in the Galt Project will be able to communicate in encrypted chat groups, share images, video, text or any data.

We are sure that this tool should be used not only by the project's communities, but also by anyone who is concerned about the safety of their data, censorship and blocking in web.

## GeeSome Protocol
A new open protocol for unstopable social networking and communication on IPFS.
It defines the structure of social network data to describe familiar to the modern user entities: content, posts, tags, groups.

## GeeSome UI
[GeeSome UI](https://github.com/galtproject/geesome-ui) - it's Vue application, that using GeeSome node API for saving content and IPFS in-browser node for getting content. It's completly separated client from node and can be connected to any other GeeSome node. There are also many cases when it’s not necessary to use GeeSome UI. You can use GeeSome node API and GeesomeClient library in your project to build you own UI with some important features special for you.

## Summary
With the help of GeeSome Node, anyone can create an instance of a decentralized social network, with groups like in YouTube, Instagram or Telegram but with content preservation and no locks or censorship thanks to the concept of personal GeeSome Node using IPFS Node to store content, access data and receive updates by libp2p.

GeeSome Node can be used:
- to create and maintain your blog and generate static site for blog
- to save important content like Saved messages in telegrams and / or in the form of a file structure as in Google Drive
- as a media platform for adding and viewing / listening to audio and video content, creating playlists
- to share the uploaded content in any form (blog, playlist, file, folder)
- to create chat groups and communicate with your friends (they can be invited by special links)

## GeeSome Scheme
![GeeSome-Scheme](https://user-images.githubusercontent.com/4842007/68893921-d912cf00-072e-11ea-8fe4-7d2937f32342.png)

You can run personal or public GeeSome node. It used for storing files, manage entities and prepare content for publishing.
Also because of IPNS updates issues - GeeSome node have IPNS caching based on signed PubSub events. 
Also there is an [issue](https://github.com/galtproject/geesome-node/issues/115) about IPNS keys of user. 
Currently its storing in GeeSome node, but need to improve it.

## UI Screenshots

### File explorer
![GeeSome File explorer](https://github.com/galtproject/geesome-node/assets/4842007/8e569504-9e94-469f-b645-8c912f8f42d4)

### Test group
![GeeSome Test Group](https://github.com/galtproject/geesome-node/assets/4842007/e90053f3-e5f4-4fd4-bb98-3e334086fdc9)

### Encrypted personal chat
![GeeSome Personal Chat](https://user-images.githubusercontent.com/4842007/68895796-b97da580-0732-11ea-9fad-cddfafe2c146.jpg)

### Mobile version
| Main page | Menu | Groups list | Group page |
| --- | --- | --- | --- |
| ![GeeSome Mobile UI](https://user-images.githubusercontent.com/4842007/62469801-5080ac00-b799-11e9-8fa7-374d2186665d.png) | ![GeeSome Mobile UI](https://user-images.githubusercontent.com/4842007/62469811-55ddf680-b799-11e9-9138-219be5cf1364.png) | ![GeeSome Mobile UI](https://user-images.githubusercontent.com/4842007/62469812-55ddf680-b799-11e9-8116-1c6692040422.png) | ![GeeSome Mobile UI](https://user-images.githubusercontent.com/4842007/62469813-56768d00-b799-11e9-87c5-7664103a2460.png) |

## Install with domain to your server
1. Set `A` DNS record for your `geesome.your-site.com` domain with ip address of server
2. [Recommended] If you want to use gateway - set `A` DNS record for your `gateway.geesome.your-site.com` domain with ip address of server
3. Clone repo to server that bound to domain
```
git clone https://github.com/galtproject/geesome-node.git && cd geesome-node
```
4. [Recommended] actions before install:
```
sudo SIZE=8G bash/ubuntu-init-swapfile.sh # Init 8GB Swapfile
sudo PORT=4242 bash/ubuntu-set-ssh-port.sh # Change SSH port to custom
```
5. Run bash script with parameters: domain and email for letsencrypt
```
sudo chmod +x bash/*.sh && sudo bash/ubuntu-install-docker.sh
sudo DOMAIN=geesome.your-site.com EMAIL=your@email.com GATEWAY=1 bash/ubuntu-install-nginx.sh # add CF=1 before script to install for cloudflare
```
6. Open `geesome.your-site.com/#/setup` to create first admin user

# How to use gateway
1. Set `A` DNS record for your `gateway.geesome.your-site.com` domain with ip address of server
2. Set `CNAME` DNS record for your `your-site.com` or `blog.your-site.com`(for example) with gateway domain: `gateway.geesome.your-site.com`
3. Set `TXT` DNS record for your `your-site.com` or `blog.your-site.com`(for example) with IPFS or IPNS content: `dnslink=/ipns/bafzbeidjvkkvlsfeko4s43lhvi3zd4phlkfoudhf6ygqatl4rrveigmdi4`
4. Run bash script with parameters: domain and email for letsencrypt
```
sudo DOMAIN=your-site.com EMAIL=your@email.com bash/ubuntu-cert-domain.sh
```

Note: You can generate a static site from Geesome groups by UI and get IPNS or IPFS of static sites for the gateway using.

# Getting updates
```
bash/docker-prune.sh && bash/docker-rebuild-and-upgrade.sh
```
Warning: above commands deletes all stopped containers, not used images and docker build cache. Also, it's reverting not commited local git changes. 
If you know more efficient way to update GeeSome container app - please, make a PR.

## Getting started with GeeSome Node API
1. Install GeeSome libs by npm:
```
npm i --save git://github.com/galtproject/geesome-libs.git
```
or yarn:
```
yarn add git://github.com/galtproject/geesome-libs.git
```

2. Checkout [GeeSome API documentation](https://geesome-node.galtproject.io:7722/ipns/QmQdr2fJ1qsYHnGN2FC1G9kitypiUQ271GhLa8qEtJnSN7/)

3. Get apiKey from node by api and login pass authorization:
```javascript
const { GeesomeClient } = require('geesome-libs/src/GeesomeClient');

const geesomeClient = new GeesomeClient({
    server: 'https://your-site.com/api', // or 'http://localhost:2052', it can be set by default in geesome node frontend
    // apiKey: '4J1VYKW-ZP34Y0W-PREH1Q2-DYN9Q8E' // if you paste your apiKey here, so no need to authorization by loginPassword function
});

geesomeClient.init().then(async () => {
    await geesomeClient.loginPassword("username", "password");
    console.log('Congrats! You successfully authorized, your session api key:', geesomeClient.apiKey);
});
```
Or you can generate apiKey from UI in User Profile section by "Add api key" button.
More safer to use `apiKey` instead of login/password, because you can always disable it and create another if there is a leak.

4. Init GeeSome client and save image to your IPFS node
```javascript
geesomeClient.init().then(async () => {
    const contentObj = await geesomeClient.saveDataByUrl('https://picsum.photos/500/300.jpg');
    console.log('content ipfs', contentObj.storageId);
    console.log('content manifest ipld', contentObj.manifestStorageId);
});
```

5. Create group and publish post via API
```javascript
geesomeClient.init().then(async () => {
    const avatarPhoto = await geesomeClient.saveDataByUrl('https://picsum.photos/500/300.jpg');
    
    const group = await geesomeClient.createGroup(testUser.id, { name: 'test', title: 'Test', avatarImageId: avatarPhoto.id });

    const groupIpns = group.manifestStaticStorageId;
    console.log('group manifest ipld', group.manifestStorageId);
    console.log('group manifest ipns that points to ipld', groupIpns);
    
    const postContent1 = await geesomeClient.saveContentData('My first post');
    const postContent2 = await geesomeClient.saveDataByUrl('https://picsum.photos/1000/500.jpg');
    
    await geesomeClient.createPost([postContent1.id, postContent2.id], { groupId: group.id, status: 'published' });
    
    // get published group from IPFS with posts
    
    // resolve IPNS first
    const updatedGroupIpld = await geesomeClient.resolveIpns(groupIpns);
    console.log('new group manifest ipld with first post', updatedGroupIpld);
    
    // get JSON content of group by IPLD
    const updatedGroupManifest = await geesomeClient.getObject(updatedGroupIpld);
    console.log('fetched group manifest', updatedGroupManifest);
    // or you can simply use geesomeClient.getGroup(groupIpns) for auto-resolve IPNS, get manifest with avatar and cover contents included
    
    // get posts one by one from group's posts tree
    geesomeClient.getGroupPostsAsync(
      updatedGroupIpld, 
      {limit: 10, offset: 0, orderDir: 'desc'}, 
      function onItemCallback(fetchedPost) {
        console.log('fetchedPost', fetchedPost);
        console.log('fetchedPost contents array', fetchedPost.contents);
      }, 
      function onFinishCallback(postList) {
        console.log('postList', postList);
      }
    );
});
```

6. Create and publish IPFS site directory with content to IPNS
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
- Import telegram channel's posts
- Generate static sites from groups with posts and upload to IPFS
- Invite system for new users
- Auto-backup social networks channels(Telegram)

## TODO:
- Share folder by ipld, ipns manifest
- Play audio and video content in groups as playlist
- Public chat groups
- Private chat groups
- Feed for aggregate channels, chats, personal messages like in Telegram
- Local IPNS accounts (in-browser) and signing authentication or publish transactions
- PubSub communication with modules
- Auto-backup shared groups and folders to another node
- Auto-backup social networks channels(Twitter, YouTube, Instagram)
- Pin to services like pinata from UI

## GeeSome Services
You can develop your own GeeSome service in any programming language for extend GeeSome node functional by
communication by API with api keys. Service can communicate with GeeSome node by http requests and 
PubSub events(in future) for uploading content, managing users and groups.

Existing services:
- [GeeSome ETH Manager](https://github.com/galtproject/geesome-eth-manager): Ethereum listener library for managing GeeSome node by Smart Contracts events: register users, set storage limits.

## Minimal requirements
- System: Ubuntu 16.04
- 8 GB RAM
- 1 GB free HDD + space for your files

## Dependencies
- GO IPFS or IPFS JS
- Node 16.x
- Sqlite
- ffmpeg
- Cerbot(Letsencrypt)

## Local install and run
```
sudo chmod +x bash/*.sh && sudo bash/ubuntu-install-docker.sh
npm run docker
```
Open UI page by url: [http://localhost:2042](http://localhost:2042)

Api available by [http://localhost:2052](http://localhost:2052) endpoint.

## Links
- [Manifests example](./docs/manifests-example.md)
- API [documentation](https://geesome-node.galtproject.io:7722/ipns/QmQdr2fJ1qsYHnGN2FC1G9kitypiUQ271GhLa8qEtJnSN7/) and [endpoints code](./components/api/http-v1/index.ts)
- [Libs repo](https://github.com/galtproject/geesome-libs)

## Articles
- [How to make the internet great again](https://medium.com/geesome/how-to-make-the-internet-great-again-with-the-help-of-geesome-and-ipfs-ae516aa06f89)
- Signing and encrypt messages by IPNS keys (Soon...)
- How to add site to IPFS with GeeSome node (Soon...)
- Use GeeSome as IPFS file storage in your decentralized project (Soon...)
- IPNS updates problem and how we solved it (Soon...)
- Are we ready for true decentralized messages and content? (Soon...)
- We need backups for our Social Networks! (Soon...)

## Do you like the project? ✨
Put a star and fork it. Join Us On [Telegram](https://t.me/geesome). Thank you!
