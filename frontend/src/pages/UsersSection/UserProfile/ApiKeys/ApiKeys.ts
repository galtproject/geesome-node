/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import ApiKeyFormModal from "../../modals/ApiKeyFormModal/ApiKeyFormModal";

export default {
  template: require('./ApiKeys.template'),
  components: {},
  props: [],
  async created() {
    this.getApiKeys();
  },
  async mounted() {
  },
  methods: {
    async getApiKeys() {
      const apiKeys = await this.$geesome.getUserApiKeys();
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

  },
  data() {
    return {
      apiKeys: []
    };
  }
}
