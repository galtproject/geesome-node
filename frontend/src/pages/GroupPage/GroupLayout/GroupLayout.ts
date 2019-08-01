/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company 
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster), 
 * [Valery Litvin](https://github.com/litvintech) by 
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 * ​
 * Copyright ©️ 2018 Galt•Core Blockchain Company 
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and 
 * Galt•Space Society Construction and Terraforming Company by 
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

import PostItem from "../../../directives/Posts/PostItem/PostItem";
import GroupHeader from "../GroupHeader/GroupHeader";
import GroupInfo from "../GroupInfo/GroupInfo";
import {EventBus, UPDATE_GROUP} from "../../../services/events";

export default {
  template: require('./GroupLayout.html'),
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
      this.group = await this.$coreApi.getGroup(this.groupId);
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
