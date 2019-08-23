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
      if(!this.group) {
        return;
      }
      this.$identities.loading('lastPost', this.group.id);
      this.$identities.set('lastPost', this.group.id, await this.$coreApi.getGroupPost(this.group.id, this.group.postsCount));
      this.$identities.set('lastPostText', this.group.id, await this.$coreApi.getContentData(this.lastMessage.contents[0]));
    },
    async getPersonalChatUser() {
      if(!this.group || this.group.type !== 'personal_chat') {
        return;
      }
      if(this.usersInfoLoading[this.personalChatIpns] || this.usersInfo[this.personalChatIpns]) {
        return;
      }
      this.$identities.loading('usersInfo', this.personalChatIpns);
      this.$identities.set('usersInfo', this.personalChatIpns, await this.$coreApi.getUser(this.personalChatIpns));
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
    lastMessage() {
      return this.group ? this.$store.state.lastPost[this.group.id] : null;
    },
    lastMessageText() {
      return this.group ? this.$store.state.lastPostText[this.group.id] : null;
    },
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
      loading: true
    }
  }
}
