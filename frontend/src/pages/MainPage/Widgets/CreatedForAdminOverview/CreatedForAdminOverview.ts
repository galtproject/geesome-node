/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import PrettyName from "../../../../directives/PrettyName/PrettyName";

export default {
  template: require('./CreatedForAdminOverview.html'),
  components: {PrettyName},
  props: [],
  async created() {
    this.getItems();
  },
  methods: {
    async getItems() {
      this.items = [];
      this.loading = true;

      this.items = await this.$coreApi.getAllItems(this.activeTab, this.search, 'createdAt', 'desc');

      this.loading = false;
    },
    setActiveTab(tabName) {
      this.activeTab = tabName;
    }
  },
  watch: {
    activeTab() {
      this.getItems();
    }
  },
  computed: {},
  data() {
    return {
      localeKey: 'widgets.created_for_admin_overview',
      search: '',
      items: [],
      activeTab: 'content',
      loading: true
    };
  }
}
