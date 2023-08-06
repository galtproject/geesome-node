/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

// import ContentManifestInfoItem from "../../directives/ContentManifestInfoItem/ContentManifestInfoItem";

import GroupItem from "../GroupItem/GroupItem";

export default {
  template: require('./JoinedGroups.template'),
  components: {GroupItem},
  props: [],
  async created() {
    this.getGroups();
  },
  methods: {
    async getGroups() {
      this.memberInGroups = await this.$geesome.getMemberInChannels();
    }
  },
  watch: {},
  computed: {},
  data() {
    return {
      localeKey: 'content_page',
      memberInGroups: []
    };
  }
}
