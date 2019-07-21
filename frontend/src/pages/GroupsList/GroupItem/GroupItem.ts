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

import {EventBus, UPDATE_MEMBER_GROUPS} from "../../../services/events";

export default {
  template: require('./GroupItem.html'),
  props: ['group'],
  async created() {
    try {
      this.isCanEditGroup = await this.$coreApi.getCanEditGroup(this.group.id);
    } catch (e) {
      // do nothing
    }
    if (!this.isCanEditGroup) {
      this.isJoined = await this.$coreApi.isMemberOfGroup(this.group.id);
    }

    this.resolvedIpld = await this.$coreApi.resolveIpns(this.group.ipns);
  },

  async mounted() {

  },

  methods: {
    async updateIsJoined() {
      this.isJoined = await this.$coreApi.isMemberOfGroup(this.group.id);
      this.$emit('change');
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
    value() {

    }
  },

  computed: {
    idForRoute() {
      //TODO: compare the date of actual ipld and ipld that resolved by ipns
      return this.resolvedIpld ? this.group.ipns : this.group.id;
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
