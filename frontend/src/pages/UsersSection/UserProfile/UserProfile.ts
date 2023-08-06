/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import SetLimitModal from "../modals/SetLimitModal/SetLimitModal";
import SocialNetworkClients from "./SocialNetworkClients/SocialNetworkClients";
import ApiKeys from "./ApiKeys/ApiKeys";
import ContentBots from "./ContentBots/ContentBots";

export default {
  template: require('./UserProfile.template'),
  components: {SocialNetworkClients, ApiKeys, ContentBots},
  props: ['user'],
  async created() {
    this.getUserPermissions();
  },
  methods: {
    async getUserPermissions() {
      this.permissions = await this.$geesome.adminGetCorePermissionList(this.user.id).catch(() => []);
      this.saveContentLimit = await this.$geesome.adminGetUserLimit(this.user.id, 'save_content:size').catch(() => null);

      this.currentUserCanSetLimits = await this.$geesome.adminIsHaveCorePermission('admin:set_user_limit');
    },
    setUserLimit() {
      this.$root.$asyncModal.open({
        id: 'set-limit-modal',
        component: SetLimitModal,
        props: {
          userId: this.user.id
        },
        onClose: () => {
          this.getUserPermissions();
        }
      });
    }
  },
  watch: {},
  computed: {
    currentUser() {
      return this.$store.state.user;
    },
  },
  data() {
    return {
      localeKey: 'user_profile',
      apiKeys: [],
      permissions: [],
      saveContentLimit: null,
      currentUserCanSetLimits: null
    };
  }
}
