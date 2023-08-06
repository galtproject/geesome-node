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
  template: require('./GroupItem.template'),
  props: ['group'],
  async created() {
    try {
      this.isCanEditGroup = await this.$geesome.getCanEditGroup(this.group.id);
    } catch (e) {
      // do nothing
    }
    if (!this.isCanEditGroup) {
      this.isJoined = await this.$geesome.isMemberOfGroup(this.group.id);
    }

    this.resolvedIpld = await this.$geesome.resolveIpns(this.group.staticId);
  },

  async mounted() {

  },

  methods: {
    async updateIsJoined() {
      this.isJoined = await this.$geesome.isMemberOfGroup(this.group.id);
      this.$emit('change');
      EventBus.$emit(UPDATE_MEMBER_GROUPS);
    },
    joinGroup() {
      this.$geesome.joinGroup(this.group.id).then(() => this.updateIsJoined())
    },
    leaveGroup() {
      this.$geesome.leaveGroup(this.group.id).then(() => this.updateIsJoined())
    },
    openGroup() {
      this.$router.push({name: 'group-page', params: {groupId: this.idForRoute}})
    }
  },

  watch: {
    value() {

    }
  },

  computed: {
    idForRoute() {
      //TODO: compare the date of actual ipld and ipld that resolved by ipns
      return this.resolvedIpld ? this.group.staticId : this.group.id;
    }
  },
  data() {
    return {
      isCanEditGroup: null,
      isJoined: null,
      resolvedIpld: null
    }
  },
}
