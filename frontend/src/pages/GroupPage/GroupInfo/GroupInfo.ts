/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {EventBus, UPDATE_MEMBER_GROUPS} from "../../../services/events";

export default {
  template: require('./GroupInfo.html'),
  props: ['group'],
  async created() {
    this.fetchData();
    this.isCanEditGroup = await this.$coreApi.getCanEditGroup(this.group.id);
    if (!this.isCanEditGroup) {
      this.isJoined = await this.$coreApi.isMemberOfGroup(this.group.id);
    }
  },

  async mounted() {

  },

  methods: {
    async fetchData() {
      // this.avatarImageSrc = await this.$coreApi.getContentLink(this.group.avatarImage);
      this.peers = await this.$coreApi.getGroupPeers(this.group.staticId);
    },
    async updateIsJoined() {
      this.isJoined = await this.$coreApi.isMemberOfGroup(this.group.id);
      EventBus.$emit(UPDATE_MEMBER_GROUPS);
    },
    joinGroup() {
      this.$coreApi.joinGroup(this.group.id).then(() => this.updateIsJoined())
    },
    leaveGroup() {
      this.$coreApi.leaveGroup(this.group.id).then(() => this.updateIsJoined())
    }
  },

  watch: {
    group() {
      this.fetchData();
    }
  },

  computed: {},
  data() {
    return {
      isCanEditGroup: false,
      isJoined: null,
      peers: null
    }
  },
}
