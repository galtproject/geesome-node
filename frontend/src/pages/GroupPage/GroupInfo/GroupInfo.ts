/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {EventBus, UPDATE_MEMBER_GROUPS} from "../../../services/events";

export default {
  template: require('./GroupInfo.template'),
  props: ['group'],
  async created() {
    this.fetchData();
    this.isCanEditGroup = await this.$geesome.getCanEditGroup(this.group.id || this.group.staticId);
    if (!this.isCanEditGroup) {
      this.isJoined = await this.$geesome.isMemberOfGroup(this.group.id || this.group.staticId);
    }
  },

  async mounted() {

  },

  methods: {
    async fetchData() {
      // this.avatarImageSrc = await this.$geesome.getContentLink(this.group.avatarImage);
      this.peers = await this.$geesome.getGroupPeers(this.group.staticId);
      this.dynamicId = await this.$geesome.resolveIpns(this.group.staticId);
    },
    async updateIsJoined() {
      this.isJoined = await this.$geesome.isMemberOfGroup(this.group.id);
      EventBus.$emit(UPDATE_MEMBER_GROUPS);
    },
    joinGroup() {
      this.$geesome.joinGroup(this.group.id).then(() => this.updateIsJoined())
    },
    leaveGroup() {
      this.$geesome.leaveGroup(this.group.id).then(() => this.updateIsJoined())
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
      peers: null,
      dynamicId: null
    }
  },
}
