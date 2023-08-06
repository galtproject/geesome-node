/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

// const pIteration = require('p-iteration');
const _ = require('lodash');

export default {
  name: 'group-item',
  template: require('./GroupItem.template'),
  props: ['active', 'group', 'to'],
  // components: {TariffPayingControl},
  async mounted() {
    this.getLastMessage();
    this.getPersonalChatUser();
    setInterval(() => {
      // hack for solve reactivity problems
      this.now = new Date();
    }, 1000);
  },
  methods: {
    async getLastMessage() {
      if(!this.group) {
        return;
      }
      this.$identities.loading('lastPost', this.group.id);
      if(this.group.postsCount) {
        this.$identities.set('lastPost', this.group.id, await this.$geesome.getGroupPost(this.group.id, this.group.postsCount));
      }
      if(this.lastMessage) {
        this.$identities.set('lastPostText', this.group.id, await this.$geesome.getContentData(this.lastMessage.contents[0]));
      }
    },
    async getPersonalChatUser() {
      if(!this.group || this.group.type !== 'personal_chat' || !this.personalChatIpns) {
        return;
      }
      if(this.usersInfoLoading[this.personalChatIpns] || this.usersInfo[this.personalChatIpns]) {
        return;
      }
      this.$identities.loading('usersInfo', this.personalChatIpns);
      this.$identities.set('usersInfo', this.personalChatIpns, await this.$geesome.getUser(this.personalChatIpns));
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
        return memberIpns != this.user.manifestStaticStorageId;
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
      this.now;
      if(this.group.type === 'personal_chat') {
        return (this.usersInfo[this.personalChatIpns] || {}).avatarImage;
      }
    }
  },
  data() {
    return {
      localeKey: 'chat_page.group_item',
      loading: true,
      now: null
    }
  }
}
