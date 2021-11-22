/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import ApiKeyFormModal from "../modals/ApiKeyFormModal/ApiKeyFormModal";
import SetLimitModal from "../modals/SetLimitModal/SetLimitModal";
import AddSocNetClientModal from "../modals/AddSocNetClientModal/AddSocNetClientModal";
const pIteration = require('p-iteration');

export default {
  template: require('./UserProfile.template'),
  components: {},
  props: ['user'],
  async created() {
    this.getApiKeys();
    this.getUserPermissions();
    this.getSocNetsAccounts();
  },
  methods: {
    async getApiKeys() {
      const apiKeys = await this.$coreApi.getUserApiKeys();
      this.apiKeys = apiKeys.list;
    },
    async getSocNetsAccounts() {
      this.socNetAccounts = await this.$coreApi.socNetAccountList('telegram');
    },
    async updateSocNetAccount(acc) {
      await this.$coreApi.socNetUpdateUser('telegram', acc);
      this.getSocNetsAccounts();
    },
    async getUserPermissions() {
      this.permissions = await this.$coreApi.adminGetCorePermissionList(this.user.id).catch(() => []);
      this.saveContentLimit = await this.$coreApi.adminGetUserLimit(this.user.id, 'save_content:size').catch(() => null);

      this.currentUserCanSetLimits = await this.$coreApi.adminIsHaveCorePermission('admin:set_user_limit');
    },
    addSocNetClient() {
      this.$root.$asyncModal.open({
        id: 'add-soc-net-client-modal',
        component: AddSocNetClientModal,
        onClose: async (resultApiKey) => {
          this.getSocNetsAccounts();
        }
      });
    },
    addApiKey() {
      this.$root.$asyncModal.open({
        id: 'api-key-form-modal',
        component: ApiKeyFormModal,
        props: {
          apiKeyInput: {
            title: '',
            type: 'user_manual'
          }
        },
        onClose: async (resultApiKey) => {
          this.getApiKeys();
        }
      });
    },
    editApiKey(apiKey) {
      this.$root.$asyncModal.open({
        id: 'api-key-form-modal',
        component: ApiKeyFormModal,
        props: {
          apiKeyInput: apiKey
        },
        onClose: async (resultApiKey) => {
          this.getApiKeys();
        }
      });
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
      socNetAccounts: [],
      permissions: [],
      saveContentLimit: null,
      currentUserCanSetLimits: null
    };
  }
}
