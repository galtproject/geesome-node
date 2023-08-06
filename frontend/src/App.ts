/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import Vue from 'vue';
import VueRouter from 'vue-router';
import * as Vuex from 'vuex';
import VueMaterial from 'vue-material'
import {Modal} from 'geesome-vue-components/src/modals/AsyncModal'
import Notifications from 'vue-notification';
import 'url-search-params-polyfill';

import httpPlugin from 'geesome-vue-components/src/services/http.plugin';
import storePlugin from 'geesome-vue-components/src/services/store.plugin';
import locale from '@galtproject/vue-locale';
import "geesome-vue-components/src/filters";
import PrettyHex from "geesome-vue-components/src/directives/PrettyHex/PrettyHex";
import PrettyDoc from "geesome-vue-components/src/directives/PrettyDoc/PrettyDoc";

import coreApiPlugin from './services/coreApi.plugin';
import identitiesPlugin from './services/identities.plugin';
import MainMenu from "./directives/MainMenu/MainMenu";
import ContentManifestItem from "./directives/ContentManifestItem/ContentManifestItem";
import PostsContainer from "./directives/Posts/PostsContainer/PostsContainer";

import {VueEditor} from 'vue2-editor'
import UploadContent from "./directives/UploadContent/UploadContent";
import MoveFileCatalogItemContainer
  from "./directives/FileCatalog/MoveFileCatalogItem/MoveFileCatalogItemContainer/MoveFileCatalogItemContainer";
import Helper from "geesome-vue-components/src/services/helper";
import {EventBus, UPDATE_CURRENT_USER} from "./services/events";

// console.log('require(\'browser-ipfs\')', require('browser-ipfs'));
const config = require('../config');

Vue.use(Notifications);

Vue.use(coreApiPlugin);
Vue.use(identitiesPlugin);
Vue.use(httpPlugin);
Vue.use(Vuex as any);
Vue.use(storePlugin, {
  user: null,
  locale: null,
  locale_loaded: null,
  serverAddress: null,
  haveAdminReadPermission: false,
  cybActive: false,
  is_mobile: false,
  usersInfo: {},
  usersInfoLoading: {},
  lastPost: {},
  lastPostText: {},
  lastPostLoading: {}
});
Vue.use(locale.plugin, {Vuex});
Vue.use(identitiesPlugin);

Vue.component('vue-editor', VueEditor);
Vue.component('modal', Modal);
Vue.component('pretty-hex', PrettyHex);
Vue.component('pretty-doc', PrettyDoc);
Vue.component('content-manifest-item', ContentManifestItem);
Vue.component('posts-container', PostsContainer);
Vue.component('upload-content', UploadContent);

// https://github.com/vuematerial/vue-material/issues/1977
Vue.use(VueRouter);

Vue.component('router-link', Vue['options'].components.RouterLink);
Vue.component('router-view', Vue['options'].components.RouterView);

Vue.use(VueMaterial);

export default {
  template: require('./App.template'),
  components: {MainMenu, MoveFileCatalogItemContainer},//,ConsoleLog
  async created() {
    this.$store.commit('is_mobile', Helper.isMobile());
    this.$locale.init({
      extend: {
        'en': require('../locale/en.json')
      },
      lang: 'en',
      cacheBuster: config.buildHash
    }).then(() => {
      this.language = this.$locale.lang;
    });
    if(this.$route.query.lang) {
      this.$locale.setLang(this.$route.query.lang);
    }

    this.$identities.init(this);
    await this.$geesome.init(this);
    
    this.getCurrentUser();
    
    EventBus.$on(UPDATE_CURRENT_USER, this.getCurrentUser.bind(this));

    document.addEventListener("cyb:init", (data) => {
      this.$store.commit('cybActive', true);
    });
  },

  async mounted() {
    this.$root.$asyncModal = this.$refs.modal;
    this.$root.$asyncSubModal = this.$refs.sub_modal;
  },

  methods: {
    async logout() {
      await this.$geesome.logout();
      this.$router.push({name: 'main-page'})
      location.reload();
    },
    getCurrentUser() {
      this.$geesome.getCurrentUser().then(async (user) => {
        this.$store.commit('user', user);
        this.getPermissions();
        this.loading = false;
      }).catch(() => {
        this.$store.commit('user', null);
        // this.$router.push({name: 'login'});
        this.loading = false;
      });
    },
    async getPermissions() {
      this.$store.commit('haveAdminReadPermission', await this.$geesome.adminIsHaveCorePermission('admin:read'));
    },
    getLocale(key, options?) {
      return this.$locale.get(this.localeKey + "." + key, options);
    }
  },

  watch: {
    '$route.name'() {
      this.menuVisible = false;
    }
  },

  computed: {
    serverAddress() {
      return this.$store.state.serverAddress;
    },
    user() {
      return this.$store.state.user;
    },
    is_mobile() {
      return this.$store.state.is_mobile;
    }
  },

  data() {
    return {
      localeKey: 'app_container',
      version: '0.3.0',
      menuVisible: false,
      menuMinimized: true,
      loading: true
    }
  },
}
