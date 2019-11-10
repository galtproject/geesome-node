/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
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
        
        // TODO: call directly from geesomeClient?
        [
          'getCurrentUser', 'setup', 'createGroup', 'updateGroup', 'joinGroup', 'leaveGroup', 'isMemberOfGroup', 
          'saveFile', 'saveObject', 'saveContentData', 'saveDataByUrl', 'createPost', 'getContentData', 'getDbContent', 
          'getMemberInGroups', 'getMemberInChannels', 'getMemberInChats', 'getAdminInGroups', 'getAdminInChannels', 'getAdminInChats', 'getDbGroup', 'getGroup', 'fetchIpldFields', 'getContentLink', 
          'getObject', 'getGroupPostsAsync', 'getGroupPost', 'getCanCreatePost', 'getCanEditGroup', 'resolveIpns', 
          'getFileCatalogItems', 'getFileCatalogBreadcrumbs', 'createFolder', 'addContentIdToFolderId', 
          'updateFileCatalogItem', 'getContentsIdsByFileCatalogIds', 'getUserApiKeys', 'getAllItems', 'adminCreateUser', 
          'adminSetUserLimit', 'adminIsHaveCorePermission', 'adminAddCorePermission', 'adminRemoveCorePermission',
          'adminAddUserApiKey', 'adminGetBootNodes', 'adminAddBootNode', 'adminRemoveBootNode', 'getNodeAddressList',
          'getGroupPeers', 'updateCurrentUser', 'userGetFriends', 'addFriend', 'removeFriend', 'getPersonalChatGroups',
          'getUser', 'getContentData', 'subscribeToGroupUpdates', 'subscribeToPersonalChatUpdates', 'getPost', 'ipfsService',
          'ipfsNode', 'exportPrivateKey', 'decryptText', 'regenerateUserPreviews', 'setUserAccount'
        ].forEach(methodName => {
          if(!geesomeClient[methodName]) {
            console.error('geesomeClient.' + methodName + ' method not found');
            return;
          }
          this[methodName] = geesomeClient[methodName].bind ? geesomeClient[methodName].bind(geesomeClient) : geesomeClient[methodName];
        });
        
        await geesomeClient.ipfsService.pubSubSubscribe('geesome-test', (data) => {
          console.log('geesome-test', data);
        })
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
