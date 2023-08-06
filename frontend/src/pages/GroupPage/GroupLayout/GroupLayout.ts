/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import PostItem from "../../../directives/Posts/PostItem/PostItem";
import GroupHeader from "../GroupHeader/GroupHeader";
import GroupInfo from "../GroupInfo/GroupInfo";
import {EventBus, UPDATE_GROUP} from "../../../services/events";

export default {
  template: require('./GroupLayout.template'),
  components: {GroupHeader, GroupInfo},
  async created() {
    this.getGroup();
    EventBus.$on(UPDATE_GROUP, (groupId) => {
      if (groupId === this.group.id) {
        this.getGroup();
      }
    })
  },
  methods: {
    async getGroup() {
      this.group = null;
      this.group = await this.$geesome.getGroup(this.groupId);
    }
  },
  watch: {
    groupId() {
      this.getGroup();
    }
  },
  computed: {
    groupId() {
      return this.$route.params.groupId;
    }
  },
  data() {
    return {
      localeKey: 'group_page',
      posts: [],
      group: null,
      loading: true
    };
  }
}
