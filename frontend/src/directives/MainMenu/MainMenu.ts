/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {EventBus, UPDATE_ADMIN_GROUPS, UPDATE_MEMBER_GROUPS} from "../../services/events";

export default {
  name: 'main-menu',
  template: require('./MainMenu.template'),
  components: {},
  props: ['menuVisible', 'menuMinimized'],
  async created() {
    this.getData();
    EventBus.$on(UPDATE_MEMBER_GROUPS, this.getData.bind(this));
    EventBus.$on(UPDATE_ADMIN_GROUPS, this.getData.bind(this));
  },

  async mounted() {

  },

  methods: {
    async getData() {
      this.memberInGroups = await this.$geesome.getMemberInChannels();
      this.adminInGroups = await this.$geesome.getAdminInChannels();
    },
    getLocale(key, options?) {
      return this.$locale.get(this.localeKey + "." + key, options);
    },
    toggleMenu() {
      this.menuVisibleLocal = !this.menuVisibleLocal;
      if (!this.menuVisibleLocal) {
        setTimeout(() => {
          this.menuMinimizedLocal = true;
        }, 200)
      } else {
        this.menuMinimizedLocal = false;
      }
    }
  },

  watch: {
    menuVisibleLocal() {
      this.$emit('update:menu-visible', this.menuVisibleLocal);
    },
    menuMinimizedLocal() {
      this.$emit('update:menu-minimized', this.menuMinimizedLocal);
    },
    user() {
      this.getData();
    }
  },

  computed: {
    serverAddress() {
      return this.$store.state.serverAddress;
    },
    user() {
      return this.$store.state.user;
    },
    haveAdminReadPermission() {
      return this.$store.state.haveAdminReadPermission;
    }
  },
  data() {
    return {
      localeKey: 'app_container.main_menu',
      menuVisibleLocal: false,
      menuMinimizedLocal: true,
      memberInGroups: [],
      adminInGroups: []
    }
  },
}
