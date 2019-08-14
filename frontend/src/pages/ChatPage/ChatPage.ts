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

import GroupItem from "./GroupItem/GroupItem";
import AddFriendModal from "../../modals/AddFriendModal/AddFriendModal";
const _ = require('lodash');

export default {
  name: 'chat-page',
  template: require('./ChatPage.html'),
  components: {GroupItem},
  async created() {
    this.getGroups();
  },
  mounted() {

  },
  methods: {
    async getGroups() {
      this.groups = (await this.$coreApi.getMemberInChats()).map((group) => {
        group.lastMessage = {text: 'Sed ut perspiciatis unde...', date: '11:00'};
        return group;
      });
    },
    async selectGroup(group) {
      this.selectedGroupId = group.ipns;

      this.messagesLoading = true;
      this.messages = [];
      
      await this.$coreApi.getGroupPostsAsync(this.selectedGroupId, {
        limit: this.messagesPagination.perPage,
        offset: (this.messagesPagination.currentPage - 1) * this.messagesPagination.perPage
      }, (posts) => {
        this.appendMessages(posts);
      }, (posts) => {
        this.appendMessages(posts);
        this.messagesLoading = false;
      });
    },
    appendMessages(messages) {
      //TODO: more effective appendMessages
      this.messages = messages;
      
      this.messages.forEach(async message => {
        if(this.messagesAuthorsLoading[message.author]) {
          return;
        }
        this.messagesAuthorsLoading[message.author] = true;
        this.messagesAuthors[message.author] = await this.$coreApi.getUser(message.author);
      });
    },
    addFriend() {
      this.$root.$asyncModal.open({
        id: 'add-friend-modal',
        component: AddFriendModal,
        onClose: () => {
          this.getGroups();
        }
      });
    },
    getLocale(key, options?) {
      return this.$locale.get(this.localeKey + "." + key, options);
    }
  },
  computed: {
    currentGroup() {
      return _.find(this.groups, {ipns: this.selectedGroupId});
    },
    user() {
      return this.$store.state.user;
    },
  },
  data() {
    return {
      localeKey: 'chat_page',
      loading: true,
      selectedGroupId: null,
      groups: [],
      messages: [],
      messagesLoading: false,
      messagesPagination: {
        currentPage: 1,
        perPage: 10
      },
      messagesAuthors: {},
      messagesAuthorsLoading: {}
    };
  }
}
