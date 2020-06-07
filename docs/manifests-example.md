# Examples of GeeSome Manifests

## Content
Content using for describing of IPFS file: type, size, name, extension and in future: how to open file.
```
{
 "name": "avatar1.jpg",
 "storageId": "QmY8BULaKQeez58U9vE3CYGBzwahSfiMjfVP2QeMQhz13R",
 "size": 8097,
 "storageType": "ipfs",
 "mimeType": "image/jpeg",
 "extension": "jpg",
 "preview": {
    "small": {
        "storageId": "QmcjynznjE9eGa9eVxbACY659phCpJExt2NY3jdAAsiKSw",
        "size": 809,
        "mimeType": "image/jpeg",
        "extension": "jpg"
    },
    "medium": {
        "storageId": "QmcjynznjE9eGa9eVxbACY659phCpJExt2NY3jdAAsiKSw",
        "size": 1600,
        "mimeType": "image/jpeg",
        "extension": "jpg"
    },
    "large": {
        "storageId": "QmcjynznjE9eGa9eVxbACY659phCpJExt2NY3jdAAsiKSw",
        "size": 4000,
        "mimeType": "image/jpeg",
        "extension": "jpg"
    }
 },
 "updatedAt": "2019-11-10T20:29:32.000Z",
 "createdAt": "2019-11-10T20:29:32.000Z",
 "storageType": "ipfs",
 "_version": "0.1",
  "_source": "geesome-node",
  "_protocol": "geesome-ipsp",
  "_type": "content-manifest"
}
```

## Post
Post using for agregate contents by list of IPLD hashes, that points to content's manifests.
Also post have information about total size of contents, group's IPNS and published info.
```
{
 "status": "published",
 "publishedAt": "2019-11-10T20:29:34.000Z",
 "view": null,
 "type": null,
 "size": 10,
 "groupId": "bafyreifzqhj4fsoeu73st4f5my4aizpd3p64xmu5deq7vdlfhihwv5v7kq",
 "groupStaticId": "QmWjfvrzec3zwxp8aeZZjATeh2KYk86EZQGC91oKHXAVJt",
 "authorId": "bafyreiffczjn6roztepqkn37zh35inr33oi7rorwvmd6qcryjyq6kqc7va",
 "authorStaticId": "QmWjfvrzec3zwxp8aeZZjATeh2KYk86EZQGC91oKHXAVJt",
 "contents": [
  {
   "storageId": "bafyreicaoc3rcohdpqyrsdw2rtacyo7og5mqasmvl6x43upd7wxrvtnxnm"
  }
 ],
 "_version": "0.1",
 "_source": "geesome-node",
 "_protocol": "geesome-ipsp",
 "_type": "post-manifest"
}
```

## User
Users are creating posts and managing groups.
```
{
 "name": "test_user",
 "title": "Test user",
 "email": "test@mail.com",
 "description": "4",
 "updatedAt": "2019-11-10T21:23:30.000Z",
 "createdAt": "2019-11-10T20:02:32.000Z",
 "staticId": "QmWjfvrzec3zwxp8aeZZjATeh2KYk86EZQGC91oKHXAVJt",
 "publicKey": "2TuPVgMCHJy5atawrsADEzjP7MCVbyyCA89UW6Wvjp9HrBSRc9DQw7Lz7ezy3SwK3iv3KKm3no9oyNWovZwUo5Ceo3e62tQgdpEidjobQevjhVpzNmr1pYZzTTX2ZUpwT44LAKWYREyh5wgAevZn1BLEiucdDb9XrtFJ9G2odd4WMb48K8zSSZyVjmSmS6tuCHPHDQeoWdeYNEkvCTGdyQzJ7GLLqvbASigMKcJ5VxdDtgZbbphAHnTj9o2QuF5cVY4TwVUqy81embzMw4XWQzoz7PsAqQVNGaYAm1Q9kcveFLQ1rtFMBcTxx1w5KXxnir2VEtv9i7cZHr1rwdNg5Qc5oFsNtijXCMSaw3NP1UnoCix2AWmJwBqkjuZQZYceEvQfM1Lc3PABG1dWTA",
 "accounts": [
    { "provider": "ethereum", "address": "0x37da4ec7463b52e910fb5a4e9217b26de06056e2", "signature": "<SIGNATURE>" }
 ],
 "avatarImage": {
  "/": "bafyreih3wgraxbf4ockadtz4czxmhwurwtil4yk4qgxrerwub5zak6qs4u"
 },
 "_version": "0.1",
 "_source": "geesome-node",
 "_protocol": "geesome-ipsp",
 "_type": "user-manifest"
}
```

## Group
Group have name(aka @username), title, type(channel or chat), view, total size of posts, ipns, 
avatar and cover(IPLD of content's manifests).
```
{
 "name": "Test group",
 "title": "test-group",
 "type": "channel",
 "view": "tumblr-like",
 "theme": null,
 "isPublic": true,
 "description": "Test group description",
 "size": 21321455,
 "createdAt": "2019-11-10T20:02:45.000Z",
 "updatedAt": "2019-11-10T20:22:13.000Z",
 "postsCount": 3,
 "staticId": "QmWjfvrzec3zwxp8aeZZjATeh2KYk86EZQGC91oKHXAVJt",
 "publicKey": "2TuPVgMCHJy5atawrsADEzjP7MCVbyyCA89UW6Wvjp9HrBSRc9DQw7Lz7ezy3SwK3iv3KKm3no9oyNWovZwUo5Ceo3e62tQgdpEidjobQevjhVpzNmr1pYZzTTX2ZUpwT44LAKWYREyh5wgAevZn1BLEiucdDb9XrtFJ9G2odd4WMb48K8zSSZyVjmSmS6tuCHPHDQeoWdeYNEkvCTGdyQzJ7GLLqvbASigMKcJ5VxdDtgZbbphAHnTj9o2QuF5cVY4TwVUqy81embzMw4XWQzoz7PsAqQVNGaYAm1Q9kcveFLQ1rtFMBcTxx1w5KXxnir2VEtv9i7cZHr1rwdNg5Qc5oFsNtijXCMSaw3NP1UnoCix2AWmJwBqkjuZQZYceEvQfM1Lc3PABG1dWTA",
 "avatarImage": {
  "/": "bafyreibyukpraz7pd4g45msbe4nlsia5hsfvdc6oqrueqbdfhz4ndjxmvq"
 },
 "coverImage": {
  "/": "bafyreidn42dm2cags7xh3cinquuuqp462skngpwzocnz3qpk5nabdjcpgu"
 },
 "posts": {
  "1": {
   "/": "bafyreihtrm5f3a3al53xbw6uwpovtll6xfu6d4qzysclhvjn4h5kwfgwgy"
  },
  "2": {
   "/": "bafyreidgo2epobgmibd4lq3xg52z7icxehp4ubsc6l5anthdyh2kzoujn4"
  },
  "3": {
   "/": "bafyreibhtxmyvgbqnxfdf23476aqpi6fqqwm72ugnom2h5f7vpxddstvfq"
  }
 },
 "_version": "0.1",
 "_source": "geesome-node",
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

But for optimization - GeeSome protocol used 36base ids for posts.
