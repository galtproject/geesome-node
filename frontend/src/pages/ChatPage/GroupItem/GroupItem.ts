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

// const pIteration = require('p-iteration');
const _ = require('lodash');

export default {
  name: 'group-item',
  template: require('./GroupItem.html'),
  props: ['active', 'group', 'to'],
  // components: {TariffPayingControl},
  async mounted() {
    this.getLastMessage();
    this.getPersonalChatUser();
  },
  methods: {
    async getLastMessage() {
      this.lastMessage = null;
      if(!this.group) {
        return;
      }
      this.lastMessage = await this.$coreApi.getGroupPost(this.group.id, this.group.postsCount);
      this.lastMessageText = await this.$coreApi.getContentData(this.lastMessage.contents[0]);
    },
    async getPersonalChatUser() {
      if(!this.group || this.group.type !== 'personal_chat') {
        return;
      }
      if(this.usersInfoLoading[this.personalChatIpns]) {
        return;
      }
      this.$store.commit('usersInfoLoading', _.extend({}, this.usersInfoLoading, {[this.personalChatIpns]: true}));
      this.$store.commit('usersInfo', _.extend({}, this.usersInfo, {[this.personalChatIpns]: await this.$coreApi.getUser(this.personalChatIpns)}));
    }
  },
  watch: {
    group() {
      this.getLastMessage();
    },
    async personalChatIpns() {
      this.getPersonalChatUser();
    }
  },
  computed: {
    personalChatIpns() {
      if(!this.group || !this.user) {
        return '';
      }
      return _.find(this.group.members, (memberIpns) => {
        return memberIpns != this.user.ipns;
      });
    },
    usersInfo() {
      return this.$store.state.usersInfo;
    },
    usersInfoLoading() {
      return this.$store.state.usersInfoLoading;
    },
    user() {
      return this.$store.state.user;
    },
    title() {
      if(!this.group) {
        return '';
      }
      if(this.group.type === 'personal_chat') {
        return (this.usersInfo[this.personalChatIpns] || {}).title || (this.usersInfo[this.personalChatIpns] || {}).name;
      }
    },
    avatarImage() {
      if(!this.group) {
        return '';
      }
      if(this.group.type === 'personal_chat') {
        return (this.usersInfo[this.personalChatIpns] || {}).avatarImage;
      }
    }
  },
  data() {
    return {
      localeKey: 'chat_page.group_item',
      loading: true,
      lastMessage: null,
      lastMessageText: ''
    }
  }
}
