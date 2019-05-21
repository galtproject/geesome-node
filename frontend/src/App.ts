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

import Vue from 'vue';
import VueRouter from 'vue-router';
import * as Vuex from 'vuex';
import VueMaterial from 'vue-material'
import {Modal} from "@galtproject/frontend-core/modals/AsyncModal";
import Notifications from 'vue-notification';
import 'url-search-params-polyfill';

import httpPlugin from '@galtproject/frontend-core/services/http.plugin';
import localePlugin from '@galtproject/frontend-core/services/locale.plugin';
import storePlugin from '@galtproject/frontend-core/services/store.plugin';
import "@galtproject/frontend-core/filters";
import PrettyHex from "@galtproject/frontend-core/directives/PrettyHex/PrettyHex";
import PrettyDoc from "@galtproject/frontend-core/directives/PrettyDoc/PrettyDoc";

import coreApiPlugin from './services/coreApi.plugin';
import MainMenu from "./directives/MainMenu/MainMenu";
import ContentManifestItem from "./directives/ContentManifestItem/ContentManifestItem";
import PostsContainer from "./directives/Posts/PostsContainer/PostsContainer";

import { VueEditor, Quill } from 'vue2-editor'

const config = require('../config');

Vue.use(Notifications);

Vue.use(coreApiPlugin);
Vue.use(httpPlugin);
Vue.use(Vuex as any);
Vue.use(storePlugin, {
    user: null,
    locale: null,
    locale_loaded: null,
    serverAddress: null
});
Vue.use(localePlugin);

Vue.component('vue-editor', VueEditor);
Vue.component('modal', Modal);
Vue.component('pretty-hex', PrettyHex);
Vue.component('pretty-doc', PrettyDoc);
Vue.component('content-manifest-item', ContentManifestItem);
Vue.component('posts-container', PostsContainer);

// https://github.com/vuematerial/vue-material/issues/1977
Vue.use(VueRouter);

Vue.component('router-link', Vue['options'].components.RouterLink);
Vue.component('router-view', Vue['options'].components.RouterView);

Vue.use(VueMaterial);

export default {
    template: require('./App.html'),
    components: { MainMenu },//,ConsoleLog
    async created() {
        this.$locale.init(this.$store, '/locale/').then(() => {
            this.$store.commit('locale_loaded', true);
            this.language = this.$locale.lang;
        });
        this.$locale.onLoad(() => {
            this.$store.commit('locale_loaded', true);
            this.language = this.$locale.lang;
        });

        let port = 7722;
        if(document.location.hostname === 'localhost' || document.location.hostname === '127.0.0.1') {
            port = 7711;
        }
        this.$store.commit('serverAddress', document.location.protocol + "//" + document.location.hostname + ":" + port);
        
        this.$coreApi.init(this.$store);
        
        this.$coreApi.getCurrentUser().then((user) => {
            this.$store.commit('user', user);
            this.loading = false;
        }).catch(() => {
            this.$router.push({name: 'login'});
            this.loading = false;
        });
    },

    async mounted() {
        this.$root.$asyncModal = this.$refs.modal;
        this.$root.$asyncSubModal = this.$refs.sub_modal;
    },

    methods: {
        getLocale(key, options?) {
            return this.$locale.get(this.localeKey + "." + key, options);
        }
    },
    
    watch: {
        user() {
            return this.$store.state.user;
        }
    },
    
    computed: {
        serverAddress() {
            return this.$store.state.serverAddress;
        }
    },
    
    data() {
        return {
            localeKey: 'app_container',
            version: '0.01',
            menuVisible: false,
            menuMinimized: true,
            loading: true
        }
    },
}
