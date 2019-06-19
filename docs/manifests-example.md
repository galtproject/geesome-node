# Examples of GeeSome Manifests

## Content
Content using for describing of IPFS file: type, size, name, extension and in future: how to open file.
```
{
 "name": "avatar1.jpg",
 "content": "QmY8BULaKQeez58U9vE3CYGBzwahSfiMjfVP2QeMQhz13R",
 "size": 8097,
 "mimeType": "image/jpeg",
 "extension": "jpg",
 "preview": "QmcjynznjE9eGa9eVxbACY659phCpJExt2NY3jdAAsiKSw",
 "previewSize": 1097,
 "previewMimeType": "image/jpeg",
 "previewExtension": "jpeg",
 "storageType": "ipfs",
 "_version": "0.1",
 "_source": "geesome-core",
 "_protocol": "geesome-ipsp",
 "_type": "content-manifest"
}
```

## Post
Post using for agregate contents by list of IPLD hashes to content's manifests.
Also post have information about total size of contents, group's IPNS and published info.
```
{
 "status": "published",
 "publishedAt": "2019-06-19T12:28:03.000Z",
 "size": 16097,
 "group": "QmRDrCNvumKD1rE9fH3tCJRLa4d9KAwV9uQVpJeTGK37Bk",
 "contents": [{
   "/": "bafyreigwgatkuopm5a5mjn766mkvlf4ygs2f4ziwkwqhv4jeagcjwblp3m"
  }, {
   "/": "bafyreidnf3fsd7chi4f37feclhcilxnjuox4av3kuoozcbotse2hn3ypga"
 }],
 "_version": "0.1",
 "_source": "geesome-core",
 "_protocol": "geesome-ipsp",
 "_type": "post-manifest"
}
```

## Group
Group have name(aka @username), title, type(channel or chat), view, total size of posts, ipns, 
avatar and cover(IPLD of content's manifests).
```
{
 "name": "test",
 "title": "Test",
 "type": "channel",
 "view": "instagram-like",
 "description": null,
 "postsSize": 32194,
 "postsCount": 2,
 "ipns": "QmRDrCNvumKD1rE9fH3tCJRLa4d9KAwV9uQVpJeTGK37Bk",
 "avatarImage": {
  "/": "bafyreibn6eyfr7h43trpj4fbyxqh6apgfipcfprfklsnqfonqzkoise3oy"
 },
 "coverImage": {
  "/": "bafyreidnf3fsd7chi4f37feclhcilxnjuox4av3kuoozcbotse2hn3ypga"
 },
 "posts": {
  "1": {
   "/": "bafyreigni6leealrepmzrxfzr5fp7nijrs6be62keyuywugrmh2ydmhd2m"
  },
  "2": {
   "/": "bafyreidm7e6qp2k4kcyc54hdpzxbig243qbgvmsffbolpxasfaeqezswue"
  }
 },
 "_version": "0.1",
 "_source": "geesome-core",
 "_protocol": "geesome-ipsp",
 "_type": "group-manifest"
}
```
Posts have tree structure that used an [trie](https://en.wikipedia.org/wiki/Trie) conception. 

That structure used for:
- Pagination: keys of tree its serial numbers, so you can access to any of posts range by keys
- Scaling: you can store very large number of posts in that structure by making links for groups of tree nodes
- Fast access and data availability: instead of using blockchain-like structure, where previous post points to next post - this stucture allows to make requests asynchronically to any amount of posts and dont miss posts chain if some of posts not available

25 posts example structure:
```
{ '1': 'post-1',
  '2': 'post-2',
  '3': 'post-3',
  '4': 'post-4',
  '5': 'post-5',
  '6': 'post-6',
  '7': 'post-7',
  '8': 'post-8',
  '9': 'post-9',
  '1_':
   { '10': 'post-10',
     '11': 'post-11',
     '12': 'post-12',
     '13': 'post-13',
     '14': 'post-14',
     '15': 'post-15',
     '16': 'post-16',
     '17': 'post-17',
     '18': 'post-18',
     '19': 'post-19' 
   },
  '2_':
   { '20': 'post-20',
     '21': 'post-21',
     '22': 'post-22',
     '23': 'post-23',
     '24': 'post-24',
     '25': 'post-25' 
   } 
}
```
If posts will have more then 100 count node 1_ will expands to another groups of nodes:
```
{ '1': 'post-1',
  '2': 'post-2',
  '3': 'post-3',
  '4': 'post-4',
  '5': 'post-5',
  '6': 'post-6',
  '7': 'post-7',
  '8': 'post-8',
  '9': 'post-9',
  '1_':
   { '10': 'post-10',
     '11': 'post-11',
     '12': 'post-12',
     '13': 'post-13',
     '14': 'post-14',
     '15': 'post-15',
     '16': 'post-16',
     '17': 'post-17',
     '18': 'post-18',
     '19': 'post-19',
     ...
    '0_':
      { '100': 'post-100',
        '101': 'post-101',
        '102': 'post-102',
        '103': 'post-103',
        '104': 'post-104',
        '105': 'post-105',
        '106': 'post-106',
        '107': 'post-107',
        '108': 'post-108',
        '109': 'post-109' },
     '1_':
      { '110': 'post-110',
        '111': 'post-111',
        '112': 'post-112',
        '113': 'post-113',
        '114': 'post-114',
        '115': 'post-115',
        '116': 'post-116',
        '117': 'post-117',
        '118': 'post-118',
        '119': 'post-119' },
     '2_':
      { '120': 'post-120',
        '121': 'post-121',
        '122': 'post-122',
        '123': 'post-123',
        '124': 'post-124',
        '125': 'post-125' }
   }
   ...
}
```
