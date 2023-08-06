/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import PrettyName from "../../../../directives/PrettyName/PrettyName";
const Ethereum = require('geesome-libs/src/ethereum');

const debounce = require('lodash/debounce');

export default {
  template: require('./CreatedForAdminOverview.template'),
  components: {PrettyName},
  props: [],
  async created() {
    this.debounceGetItems = debounce(() => {
      this.getItems();
    });

    this.debounceGetItems();
  },
  methods: {
    async getItems() {
      this.items = [];
      this.loading = true;

      const itemsData = await this.$geesome.getAllItems(this.activeTab, this.search, 'createdAt', 'desc');
      this.items = itemsData.list;

      if(!itemsData.total && this.activeTab === 'users' && this.search) {
        if(this.search.split('-').length === 4) {
          const user = await this.$geesome.getUserByApiToken(this.search).then(r => r.user);
          this.items = [user];
          itemsData.total = 1;
        }
        if(Ethereum.isAddressValid(this.search)) {
          const {user} = await this.$geesome.adminGetUserAccount('ethereum', this.search);
          this.items = [user];
          itemsData.total = 1;
        }
      }

      this.loading = false;
    },
    setActiveTab(tabName) {
      this.activeTab = tabName;
    }
  },
  watch: {
    activeTab() {
      this.debounceGetItems();
    },
    search() {
      this.debounceGetItems();
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
