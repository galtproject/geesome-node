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

const { GeesomeClient, BrowserLocalClientStorage } = require('@galtproject/geesome-libs/src/GeesomeClient');

export default {
  install(Vue, options: any = {}) {
    let appStore;

    let geesomeClient;

    Vue.prototype.$coreApi = {
      async init(store) {
        appStore = store;

        let server = localStorage.getItem('geesome-server');
        let apiKey = localStorage.getItem('geesome-api-key');
        
        geesomeClient = new GeesomeClient({ 
          server,
          apiKey,
          clientStorage: new BrowserLocalClientStorage()
        });

        if(!server || server === 'null') {
          geesomeClient.setServerByDocumentLocation();
        }
        
        appStore.commit('serverAddress', geesomeClient.server);
        localStorage.setItem('geesome-server', geesomeClient.server);
        
        await geesomeClient.init();
        await geesomeClient.initBrowserIpfsNode();
        
        // TODO: call directly from geesomeClient
        [
          'getCurrentUser', 'setup', 'createGroup', 'updateGroup', 'joinGroup', 'leaveGroup', 'isMemberOfGroup', 
          'saveFile', 'saveObject', 'saveContentData', 'saveDataByUrl', 'createPost', 'getContentData', 'getDbContent', 
          'getMemberInGroups', 'getAdminInGroups', 'getDbGroup', 'getGroup', 'fetchIpldFields', 'getImageLink', 
          'getObject', 'getGroupPostsAsync', 'getGroupPost', 'getCanCreatePost', 'getCanEditGroup', 'resolveIpns', 
          'getFileCatalogItems', 'getFileCatalogBreadcrumbs', 'createFolder', 'addContentIdToFolderId', 
          'updateFileCatalogItem', 'getContentsIdsByFileCatalogIds', 'getAllItems', 'adminCreateUser', 
          'adminSetUserLimit', 'adminIsHaveCorePermission', 'adminAddCorePermission', 'adminRemoveCorePermission',
          'adminAddUserAPiKey', 'adminGetBootNodes', 'adminAddBootNode', 'adminRemoveBootNode', 'getNodeAddressList',
          'getGroupPeers'
        ].forEach(methodName => {
          this[methodName] = geesomeClient[methodName];
          this[methodName] = this[methodName].bind(geesomeClient);
        });
      },

      async login(server, username, password) {
        localStorage.setItem('geesome-server', server);
        appStore.commit('serverAddress', server);
        
        await geesomeClient.setServer(server);
        const data = await geesomeClient.loginUserPass(username, password);
        localStorage.setItem('geesome-api-key', data.apiKey);
        return data;
      },

      async logout() {
        await geesomeClient.logout();
        //TODO: send request to server for disable api key
        localStorage.setItem('geesome-api-key', null);
      }
    };
  }
}
