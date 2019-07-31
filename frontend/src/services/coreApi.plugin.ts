/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company 
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster), 
 * [Valery Litvin](https://github.com/litvintech) by 
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 * ​
 * Copyright ©️ 2018 Galt•Core Blockchain Company 
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and 
 * Galt•Space Society Construction and Terraforming Company by 
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

import axios from 'axios';
import {ClientStorage} from "./clientStorage";
const _ = require('lodash');
const pIteration = require('p-iteration');
const ipfsHelper = require('@galtproject/geesome-libs/src/ipfsHelper');
const trie = require('@galtproject/geesome-libs/src/base36Trie');
const JsIpfsService = require('@galtproject/geesome-libs/src/JsIpfsService');


export default {
  install(Vue, options: any = {}) {
    let $http = axios.create({});

    getApiKey();

    function wrap(httPromise) {
      return httPromise.then(response => response.data).catch(data => {
        throw (data.response.data);
      });
    }

    function setApiKey(apiKey) {
      localStorage.setItem('geesome-api-key', apiKey);
      $http.defaults.headers.post['Authorization'] = 'Bearer ' + apiKey;
      $http.defaults.headers.get['Authorization'] = 'Bearer ' + apiKey;
    }

    function getApiKey() {
      const apiKey = localStorage.getItem('geesome-api-key');
      $http.defaults.headers.post['Authorization'] = 'Bearer ' + apiKey;
      $http.defaults.headers.get['Authorization'] = 'Bearer ' + apiKey;
    }
    
    let serverIpfsAddresses;

    function changeServer(server) {
      localStorage.setItem('geesome-server', server);
      appStore.commit('serverAddress', server);

      $http.defaults.baseURL = appStore.state.serverAddress;
    }

    function initBrowserIpfsNode (options) {
      return new Promise((resolve, reject) => {
        const ipfs = window['Ipfs'].createNode(_.merge({
          EXPERIMENTAL: {
            pubsub: true,
            ipnsPubsub: true
          }
        }, options));
        ipfs.once('ready', () => resolve(ipfs))
        ipfs.once('error', err => reject(err))
      })
    }

    let appStore;

    let serverLessMode = false;

    let node;
    let ipfsService;

    Vue.prototype.$coreApi = {
      async init(store) {
        appStore = store;

        let server = localStorage.getItem('geesome-server');
        let isLocalServer;
        if (!server) {
          let port = 7722;
          if (document.location.hostname === 'localhost' || document.location.hostname === '127.0.0.1' || _.startsWith(document.location.pathname, '/node')) {
            port = 7711;
            isLocalServer = true;
          }
          server = document.location.protocol + "//" + document.location.hostname + ":" + port;
        } else {
          isLocalServer = _.includes(server, ':7711');
        }

        changeServer(server);
        serverIpfsAddresses = await this.getNodeAddressList();
        
        serverIpfsAddresses.forEach(address => {
          if(_.includes(address, '192.168')) {
            serverIpfsAddresses.push(address.replace(/\b(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/, '127.0.0.1'));
          }
        });
        
        let preloadAddresses;
        
        if(isLocalServer) {
          preloadAddresses = serverIpfsAddresses.filter((address) => {
            return _.includes(address, '127.0.0.1');
          })
        } else {
          preloadAddresses = serverIpfsAddresses.filter((address) => {
            return !_.includes(address, '127.0.0.1') && !_.includes(address, '192.') && address.length > 64;
          })
        }

        preloadAddresses = preloadAddresses.map(address => {
          return address.replace('/p2p-circuit', '').replace('4002', '5002').replace(/\/ipfs\/.+/, '/');
        });

        // preloadAddresses = ['/ip4/127.0.0.1/tcp/5002/http'];
        
        console.log('preloadAddresses', preloadAddresses);

        preloadAddresses = preloadAddresses.concat([
          //TODO: get from some dynamic place
          '/dns4/node0.preload.ipfs.io/tcp/443/wss/ipfs/QmZMxNdpMkewiVZLMRxaNxUeZpDUb34pWjZ1kZvsd16Zic',
          '/dns4/node1.preload.ipfs.io/tcp/443/wss/ipfs/Qmbut9Ywz9YEDrz8ySBSgWyJk41Uvm2QJPhwDJzJyGFsD6'
        ]);
        
        node = await initBrowserIpfsNode({
          preload: {
            enabled: true,
            addresses: preloadAddresses
          }
        });
        
        ipfsService = new JsIpfsService(node);

        await pIteration.forEach(serverIpfsAddresses, async (address) => {
          return ipfsService.addBootNode(address).then(() => console.log('successful connect to ', address)).catch((e) =>  console.warn('failed connect to ', address, e));
        })
      },
      getCurrentUser() {
        return wrap($http.get('/v1/user')).then(user => {
          serverLessMode = false;
          return user;
        }).catch((err) => {
          serverLessMode = true;
          throw (err);
        });
      },
      changeServer: changeServer,
      login(server, username, password) {
        changeServer(server);
        return wrap($http.post('/v1/login', {username, password})).then(data => {
          setApiKey(data.apiKey);
          return data;
        });
      },
      async logout() {
        //TODO: send request to server for disable api key
        localStorage.setItem('geesome-api-key', null);
      },
      setup(setupData) {
        return wrap($http.post(`/v1/setup`, setupData)).then(data => {
          setApiKey(data.apiKey);
          return data;
        });
      },
      createGroup(groupData) {
        return wrap($http.post(`/v1/user/create-group`, groupData));
      },
      updateGroup(groupData) {
        return wrap($http.post(`/v1/user/group/${groupData.id}/update`, groupData));
      },
      async joinGroup(groupId) {
        if (serverLessMode) {
          return ClientStorage.joinToGroup(groupId);
        }
        return wrap($http.post(`/v1/user/group/${groupId}/join`));
      },
      async leaveGroup(groupId) {
        if (serverLessMode) {
          return ClientStorage.leaveGroup(groupId);
        }
        return wrap($http.post(`/v1/user/group/${groupId}/leave`));
      },
      async isMemberOfGroup(groupId) {
        if (serverLessMode) {
          return ClientStorage.isMemberOfGroup(groupId);
        }
        return wrap($http.post(`/v1/user/group/${groupId}/is-member`)).then(data => data.result);
      },
      saveFile(file, params = {}) {
        const formData = new FormData();

        _.forEach(params, (value, key) => {
          formData.append(key, value);
        });

        formData.append("file", file);
        return wrap($http.post('/v1/user/save-file', formData, {headers: {'Content-Type': 'multipart/form-data'}}));
      },
      saveObject(object) {
        return wrap($http.post('/save-object', object, {headers: {'Content-Type': 'multipart/form-data'}}));
      },
      saveContentData(content, params = {}) {
        return wrap($http.post('/v1/user/save-data', _.extend({content}, params)));
      },
      saveDataByUrl(url, params = {}) {
        return wrap($http.post('/v1/user/save-data-by-url', _.extend({url}, params)));
      },
      createPost(contentsIds, params: any = {}) {
        return wrap($http.post(`/v1/user/group/${params.groupId}/create-post`, _.extend({contentsIds}, params)));
      },
      getContentData(storageId) {
        return wrap($http.get('/v1/content-data/' + storageId));
      },
      getDbContent(dbId) {
        return wrap($http.get('/v1/content/' + dbId));
      },
      async getMemberInGroups() {
        let groupsIds;
        if (serverLessMode) {
          groupsIds = ClientStorage.joinedGroups();
        } else {
          //TODO: get groups list directly from ipld
          groupsIds = await wrap($http.get('/v1/user/member-in-groups')).then(groups => groups.map(g => g.manifestStorageId));
        }
        return pIteration.map(groupsIds, (groupId) => this.getGroup(groupId));
      },
      getAdminInGroups() {
        //TODO: get groups list directly from ipld
        return wrap($http.get('/v1/user/admin-in-groups')).then(groups => {
          return pIteration.map(groups, (group) => this.getGroup(group.manifestStorageId))
        });
      },
      async getDbGroup(groupId) {
        return wrap($http.get(`/v1/group/${groupId}`));
      },
      async getGroup(groupId) {
        if (ipfsHelper.isIpfsHash(groupId)) {
          groupId = await this.resolveIpns(groupId);
        }

        const groupObj = await this.getIpld(groupId);

        await this.fetchIpldFields(groupObj, ['avatarImage', 'coverImage']);

        return groupObj;
        // return $http.get(`/v1/group/${groupId}`).then(response => response.data);
      },
      async fetchIpldFields(obj, fieldsNamesArr) {
        await pIteration.forEach(fieldsNamesArr, async (fieldName) => {
          if (!_.get(obj, fieldName)) {
            return;
          }
          _.set(obj, fieldName, await this.getIpld(_.get(obj, fieldName)));
        })
      },
      async getImageLink(image) {
        if (!image) {
          return null;
        }
        let storageId;
        if (image.content) {
          storageId = image.content;
        }
        if (ipfsHelper.isIpldHash(storageId)) {
          storageId = (await this.getIpld(storageId)).content;
        }
        if (!storageId) {
          storageId = image;
        }
        return $http.defaults.baseURL + '/v1/content-data/' + storageId;
      },
      async getIpld(ipldHash) {
        if (ipldHash.multihash || ipldHash.hash) {
          ipldHash = ipfsHelper.cidToHash(ipldHash);
        }
        if (ipldHash['/']) {
          ipldHash = ipldHash['/'];
        }
        //wrap($http.get(`/ipld/${ipldHash}`))
        return ipfsService.getObject(ipldHash).then(ipldData => {
          if(!ipldData) {
            return null;
          }
          ipldData.id = ipldHash;
          return ipldData;
        });
      },
      async getGroupPostsAsync(groupId, options: any = {}, onItemCallback?, onFinishCallback?) {
        const group = await this.getGroup(groupId);
        
        const defaultOptions = {
          limit: 10,
          offset: 0,
          orderDir: 'desc'
        };
        
        _.forEach(defaultOptions, (optionValue, optionName) => {
          if(_.isUndefined(options[optionName])) {
            options[optionName] = optionValue;
          }
        });
        
        const postsCount = parseInt(group.postsCount);
        if (options.offset + options.limit > postsCount) {
          options.limit = postsCount - options.offset;
        }

        const postsPath = group.id + '/posts/';
        const posts = [];
        pIteration.forEach(_.range(postsCount - options.offset, postsCount - options.offset - options.limit), async (postNumber, index) => {
          const postNumberPath = trie.getTreePath(postNumber).join('/');
          const post = await this.getIpld(postsPath + postNumberPath);
          post.id = postNumber;
          post.manifestId = ipfsHelper.cidToHash(trie.getNode(group.posts, postNumber));
          post.groupId = groupId;
          if (post) {
            post.group = group;
          }
          posts[index] = post;

          if(onItemCallback) {
            onItemCallback(posts);
          }
        }).then(() => {
          if(onFinishCallback) {
            onFinishCallback(posts);
          }
        });
        return posts;
        // return $http.get(`/v1/group/${groupId}/posts`, { params: { limit, offset } }).then(response => response.data);
      },
      async getGroupPost(groupId, postId) {
        const group = await this.getGroup(groupId);
        let post;
        if(ipfsHelper.isIpldHash(postId)) {
          post = await this.getIpld(postId);
          post.manifestId = postId;
        } else {
          const postsPath = group.id + '/posts/';
          const postNumberPath = trie.getTreePath(postId).join('/');
          post = await this.getIpld(postsPath + postNumberPath);
          post.manifestId = ipfsHelper.cidToHash(trie.getNode(group.posts, postId));
        }
        
        post.id = postId;
        // post.sourceIpld = _.clone(post);
        post.groupId = groupId;
        post.group = group;
        return post;
      },
      getCanCreatePost(groupId) {
        return wrap($http.get(`/v1/user/group/${groupId}/can-create-post`)).then(data => data.valid);
      },
      getCanEditGroup(groupId) {
        return wrap($http.get(`/v1/user/group/${groupId}/can-edit`)).then(data => data.valid);
      },
      resolveIpns(ipns) {
        return wrap($http.get(`/resolve/${ipns}`)).catch(() => null);
      },
      getFileCatalogItems(parentItemId, type?, params?) {
        let {sortBy, sortDir, limit, offset} = params;
        
        if (!sortBy) {
          sortBy = 'updatedAt';
        }
        if (!sortDir) {
          sortDir = 'desc';
        }
        return wrap($http.get(`/v1/user/file-catalog/`, {
          params: {
            parentItemId,
            type,
            sortField: sortBy,
            sortDir,
            limit,
            offset
          }
        }));
      },
      getFileCatalogBreadcrumbs(itemId) {
        return wrap($http.get(`/v1/user/file-catalog/breadcrumbs/${itemId}`));
      },
      createFolder(parentItemId, name) {
        return wrap($http.post(`/v1/user/file-catalog/create-folder`, {parentItemId, name}));
      },
      addContentIdToFolderId(contentId, folderId) {
        return wrap($http.post(`/v1/user/file-catalog/add-content-to-folder`, {contentId, folderId}));
      },
      getContentsIdsByFileCatalogIds(fileCatalogIds) {
        return wrap($http.post(`/v1/file-catalog/get-contents-ids`, fileCatalogIds));
      },
      getAllItems(itemsName, search?, params?) {
        let {sortBy, sortDir, limit, offset} = params;
        return wrap($http.get(`/v1/admin/all-` + itemsName, {params: {search, sortBy, sortDir, limit, offset}}));
      },
      adminCreateUser(userData) {
        return wrap($http.post(`/v1/admin/add-user`, userData));
      },
      adminSetUserLimit(limitData) {
        return wrap($http.post(`/v1/admin/set-user-limit`, limitData));
      },
      adminIsHaveCorePermission(permissionName) {
        return wrap($http.get(`v1/user/permissions/core/is-have/${permissionName}`)).then(data => data.result);
      },
      adminAddCorePermission(userId, permissionName) {
        return wrap($http.post(`/v1/admin/permissions/core/add_permission`, {userId, permissionName}));
      },
      adminRemoveCorePermission(userId, permissionName) {
        return wrap($http.post(`/v1/admin/permissions/core/remove_permission`, {userId, permissionName}));
      },
      adminAddUserAPiKey(userId) {
        return wrap($http.post(`/v1/admin/add-user-api-key`, {userId}));
      },
      adminGetBootNodes() {
        return wrap($http.get(`/v1/admin/boot-nodes`));
      },
      adminAddBootNode(address) {
        return wrap($http.post(`/v1/admin/boot-nodes/add`, {address}));
      },
      adminRemoveBootNode(address) {
        return wrap($http.post(`/v1/admin/boot-nodes/remove`, {address}));
      },
      getNodeAddressList() {
        return wrap($http.get(`/v1/node-address-list`)).then(data => data.result);
      },
      getGroupPeers(ipnsId) {
        return wrap($http.get(`/v1/group/${ipnsId}/peers`));
      }
    };
  }
}
