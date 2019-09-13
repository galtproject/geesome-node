/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

// import ContentManifestInfoItem from "../../directives/ContentManifestInfoItem/ContentManifestInfoItem";

import GroupItem from "../GroupItem/GroupItem";

export default {
  template: require('./AdminedGroups.html'),
  components: {GroupItem},
  props: [],
  async created() {
    this.getGroups();
  },
  methods: {
    async getGroups() {
      this.adminInGroups = await this.$coreApi.getAdminInChannels();
    }
  },
  watch: {},
  computed: {},
  data() {
    return {
      localeKey: 'content_page',
      adminInGroups: []
    };
  }
}
