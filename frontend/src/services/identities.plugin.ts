/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const { GeesomeClient, BrowserLocalClientStorage } = require('geesome-libs/src/GeesomeClient');

export default {
  install(Vue, options: any = {}) {

    let appStore;
    
    const info = {
      
    };
    
    Vue.prototype.$identities = {
      async init($vueInstance) {
        appStore = $vueInstance.$store;
      },

      async loading(entity, id) {
        if(!info[entity + 'Loading']) {
          info[entity + 'Loading'] = {};
        }

        info[entity + 'Loading'][id] = true;
        appStore.commit(entity + 'Loading', info[entity + 'Loading']);
      },

      async set(entity, id, data) {
        if(!info[entity]) {
          info[entity] = {};
        }

        info[entity][id] = data;
        appStore.commit(entity, info[entity]);
        
        if(info[entity + 'Loading']) {
          info[entity + 'Loading'][id] = false;
          appStore.commit(entity + 'Loading', info[entity + 'Loading']);
        }
      }
    };
  }
}
