/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import AddSocNetClientModal from "../../modals/AddSocNetClientModal/AddSocNetClientModal";

export default {
  template: require('./SocialNetworkClients.template'),
  components: {},
  props: [],
  async created() {
    this.getSocNetsAccounts();
  },
  methods: {
    async getSocNetsAccounts() {
      this.socNetAccounts = await this.$geesome.socNetDbAccountList();
    },
    // async updateSocNetAccount(acc) {
    //   await this.$geesome.socNetUpdateUser('telegram', acc);
    //   this.getSocNetsAccounts();
    // },
    addSocNetClient() {
      this.$root.$asyncModal.open({
        id: 'add-soc-net-client-modal',
        component: AddSocNetClientModal,
        onClose: async (resultApiKey) => {
          this.getSocNetsAccounts();
        }
      });
    },
    editSocNet(account) {
      this.$root.$asyncModal.open({
        id: 'add-soc-net-client-modal',
        component: AddSocNetClientModal,
        props: { account },
        onClose: async () => {
          this.getSocNetsAccounts();
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
      socNetAccounts: [],
    };
  }
}
