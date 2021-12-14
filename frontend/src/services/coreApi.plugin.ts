/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const { GeesomeClient, BrowserLocalClientStorage } = require('geesome-libs/src/GeesomeClient');
const SimpleAccountStorage = require('geesome-libs/src/SimpleAccountStorage');

export default {
  install(Vue, options: any = {}) {
    let appStore;
    let notify;

    let geesomeClient;

    Vue.prototype.$coreApi = {
      async init($vueInstance) {
        const FluenceService = require('geesome-libs/src/fluenceService');
        const { krasnodar } = require('@fluencelabs/fluence-network-environment');
        const { FluencePeer } = require("@fluencelabs/fluence");

        appStore = $vueInstance.$store;
        notify = $vueInstance.$notify;

        let server = localStorage.getItem('geesome-server');
        let apiKey = localStorage.getItem('geesome-api-key');

        geesomeClient = new GeesomeClient({
          server,
          apiKey: apiKey === 'null' ? null : apiKey,
          clientStorage: new BrowserLocalClientStorage()
        });

        if(!server || server === 'null') {
          geesomeClient.setServerByDocumentLocation();
        }

        appStore.commit('serverAddress', geesomeClient.server);
        localStorage.setItem('geesome-server', geesomeClient.server);

        await geesomeClient.init();
        await geesomeClient.initBrowserIpfsNode();

        const storage = new SimpleAccountStorage();
        const peer = new FluencePeer();
        await peer.start({
          connectTo: krasnodar[1],
        });
        await geesomeClient.setCommunicator(new FluenceService(storage, peer));

        // TODO: solve extending class problem: https://stackoverflow.com/q/51860043
        [
          'getCurrentUser', 'createGroup', 'updateGroup', 'joinGroup', 'leaveGroup', 'isMemberOfGroup',
          'saveObject', 'createPost', 'getContentData', 'getDbContent',
          'getMemberInGroups', 'getMemberInChannels', 'getMemberInChats', 'getAdminInGroups', 'getAdminInChannels', 'getAdminInChats',
          'getDbGroup', 'getGroup', 'fetchIpldFields', 'getContentLink',
          'getObject', 'getGroupPostsAsync', 'getGroupPost', 'getCanCreatePost', 'getCanEditGroup', 'resolveIpns',
          'getFileCatalogItems', 'getFileCatalogBreadcrumbs', 'createFolder', 'addContentIdToFolderId',
          'updateFileCatalogItem', 'getContentsIdsByFileCatalogIds', 'getUserApiKeys', 'getAllItems', 'adminCreateUser',
          'adminSetUserLimit', 'adminIsHaveCorePermission', 'adminAddCorePermission', 'adminRemoveCorePermission',
          'adminAddUserApiKey', 'adminGetBootNodes', 'adminAddBootNode', 'adminRemoveBootNode', 'getNodeAddressList',
          'getGroupPeers', 'updateCurrentUser', 'userGetFriends', 'addFriend', 'removeFriend', 'getPersonalChatGroups',
          'getUser', 'getContentData', 'subscribeToGroupUpdates', 'subscribeToPersonalChatUpdates', 'getPost', 'ipfsService',
          'ipfsNode', 'exportPrivateKey', 'decryptText', 'regenerateUserPreviews', 'setUserAccount', 'generateAuthMessage',
          'addUserApiKey', 'updateUserApiKey', 'getPeers', 'getStaticIdPeers', 'getStorageIdStat', 'getStorageIdPins',
          'deleteFileCatalogItem', 'getDbContentByStorageId', 'getUserByApiKey', 'adminGetCorePermissionList', 'adminGetUserLimit',
          'socNetNamesList', 'socNetLogin', 'socNetDbAccountList', 'socNetUserInfo', 'socNetDbAccount', 'socNetUpdateAccount',
          'socNetGetChannels', 'isSocNetSessionKeyCorrect', 'socNetGetChannelInfo', 'socNetRunChannelImport', 'socNetDbChannel',
          'waitForAsyncOperation', 'findAsyncOperations', 'staticSiteGetDefaultOptions', 'staticSiteRunGenerate'
        ].forEach(methodName => {
          if(!geesomeClient[methodName]) {
            console.error('geesomeClient.' + methodName + ' method not found');
            return;
          }
          this[methodName] = geesomeClient[methodName].bind ? geesomeClient[methodName].bind(geesomeClient) : geesomeClient[methodName];
        });

        await geesomeClient.ipfsService.subscribeToEvent('geesome-test', (data) => {
          console.log('geesome-test', data);
        })
      },

      async setup(setupData) {
        const result = await geesomeClient.setup(setupData);
        localStorage.setItem('geesome-api-key', result.apiKey);
        console.log('geesomeClient.apiKey', geesomeClient.apiKey);
        return result;
      },

      async loginPassword(server, username, password) {
        localStorage.setItem('geesome-server', server);
        appStore.commit('serverAddress', server);

        await geesomeClient.setServer(server);
        const data = await geesomeClient.loginPassword(username, password);
        localStorage.setItem('geesome-api-key', data.apiKey);
        return data;
      },

      async loginAuthMessage(server, authMessageId, accountAddress, signature, params) {
        localStorage.setItem('geesome-server', server);
        appStore.commit('serverAddress', server);

        await geesomeClient.setServer(server);
        const data = await geesomeClient.loginAuthMessage(authMessageId, accountAddress, signature, params);
        localStorage.setItem('geesome-api-key', data.apiKey);
        return data;
      },

      async loginApiKey(server, apiKey) {
        localStorage.setItem('geesome-server', server);
        appStore.commit('serverAddress', server);

        await geesomeClient.setServer(server);
        geesomeClient.setApiKey(apiKey);
        localStorage.setItem('geesome-api-key', apiKey);
        return {user: await geesomeClient.getCurrentUser(), apiKey};
      },

      async logout() {
        await geesomeClient.logout();
        //TODO: send request to server for disable api key
        localStorage.setItem('geesome-api-key', null);
      },


      saveFile(file, params: any = {}) {
        params.onProcess = this.onProcess;
        return geesomeClient.saveFile(file, params).catch(this.onError);
      },

      saveContentData(content, params: any = {}) {
        params.onProcess = this.onProcess;
        return geesomeClient.saveContentData(content, params).catch(this.onError);
      },

      saveDataByUrl(url, params: any = {}) {
        params.onProcess = this.onProcess;
        return geesomeClient.saveDataByUrl(url, params).catch(this.onError);
      },

      onProcess(process) {
        if(!process.percent) {
          return;
        }
        // notify({
        //   group: 'loading',
        //   clean: true
        // });
        notify({
          type: 'success',
          title: `Process: ${Math.round(process.percent * 100) / 100}%`,
          group: 'loading'
        });
      },

      onError(err) {
        notify({
          type: 'error',
          title: `Error`,
          text: err.message
        });
        throw err;
      }
    };

    Vue.prototype.$geesome = Vue.prototype.$coreApi;
  }
}
