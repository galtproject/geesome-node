/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import ApiKeyFormModal from "../../modals/ApiKeyFormModal/ApiKeyFormModal";

export default {
  template: require('./UserProfile.html'),
  components: {},
  props: ['user'],
  async created() {
    this.getApiKeys();
  },
  methods: {
    async getApiKeys() {
      const apiKeys = await this.$coreApi.getUserApiKeys();
      this.apiKeys = apiKeys.list;
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
      apiKeys: []
    };
  }
}
