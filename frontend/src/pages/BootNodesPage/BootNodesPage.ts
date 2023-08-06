/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import AddBootNodeModal from "../../modals/AddBootNodeModal/AddBootNodeModal";

export default {
  template: require('./BootNodesPage.template'),
  components: {},
  props: [],
  async created() {
    this.getBootNodes();
  },
  methods: {
    async getBootNodes() {
      this.bootNodes = await this.$geesome.adminGetBootNodes();
      this.currentNodeAddressList = await this.$geesome.getNodeAddressList();
    },
    addBootNode() {
      this.$root.$asyncModal.open({
        id: 'add-boot-node-modal',
        component: AddBootNodeModal,
        onClose: () => {
          this.getBootNodes();
        }
      });
    },
    async removeBootNode(address) {
      if (!confirm("Are you sure want to remove " + address + "  boot node?")) {
        return;
      }
      await this.$geesome.adminRemoveBootNode(address);
      this.getBootNodes();
    }
  },
  watch: {},
  computed: {},
  data() {
    return {
      localeKey: 'content_page',
      bootNodes: [],
      currentNodeAddressList: [],
      loading: false
    };
  }
}
