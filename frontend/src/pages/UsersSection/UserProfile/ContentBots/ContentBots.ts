/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import AddContentBotModal from "../../modals/AddContentBotModal/AddContentBotModal";
import AddUserBotModal from "../../modals/AddUserModal/AddUserToBotModal";

export default {
  template: require('./ContentBots.template'),
  components: {},
  props: [],
  async created() {
    this.getContentBots();
  },
  methods: {
    async getContentBots() {
      this.contentBots = await this.$geesome.contentBotList();
    },
    addContentBot() {
      this.$root.$asyncModal.open({
        id: 'add-content-bot-modal',
        component: AddContentBotModal,
        onClose: async (resultApiKey) => {
          this.getContentBots();
        }
      });
    },
    addUser(bot) {
      this.$root.$asyncModal.open({
        id: 'add-user-modal',
        component: AddUserBotModal,
        props : {botData: bot},
        onClose: async (resultApiKey) => {
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
      contentBots: [],
    };
  }
}
