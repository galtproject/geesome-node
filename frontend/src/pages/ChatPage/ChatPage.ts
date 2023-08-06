/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import GroupItem from "./GroupItem/GroupItem";
import AddFriendModal from "../../modals/AddFriendModal/AddFriendModal";
import {EventBus, UPDATE_GROUP} from "../../services/events";
import MessageItem from "./MessageItem/MessageItem";
import ContentManifestInfoItem from "../../directives/ContentManifestInfoItem/ContentManifestInfoItem";
import ChooseFileContentsIdsModal from "../../modals/ChooseFileContentsIdsModal/ChooseFileContentsIdsModal";
const _ = require('lodash');

export default {
  name: 'chat-page',
  template: require('./ChatPage.template'),
  components: {GroupItem, MessageItem, ContentManifestInfoItem},
  async created() {
    
  },
  async mounted() {
    this.getGroups();
    if(this.selectedGroupId) {
      await this.$geesome.exportPrivateKey();
      this.getGroupPosts(0);
    }
  },
  methods: {
    async getGroups() {
      this.groups = await this.$geesome.getMemberInChats();

      this.groups.forEach((group) => {
        if (group.type === 'personal_chat') {
          this.$geesome.subscribeToPersonalChatUpdates(group.members, 'default', (event) => this.fetchGroupUpdate(group, event));
        } else {
          this.$geesome.subscribeToGroupUpdates(group.staticId, 'default', (event) => this.fetchGroupUpdate(group, event));
        }
      });
    },
    async fetchGroupUpdate(group, event) {
      console.log('fetchGroupUpdate', group, event);
      const post = await this.$geesome.getGroupPost(group.id, event.dataJson.postId);
      if(group.staticId === this.selectedGroupId) {
        this.messages.unshift(post);
      }
      
      this.$identities.loading('lastPost', group.id);
      this.$identities.set('lastPost', group.id, post);
      this.$identities.set('lastPostText', group.id, await this.$geesome.getContentData(post.contents[0]));
    },
    getGroupPosts(offset) {
      this.messagesLoading = true;
      
      if(offset === 0) {
        this.messages = [];
      }
      return this.$geesome.getGroupPostsAsync(this.selectedGroupId, {
        limit: this.messagesPagination.perPage,
        offset
        // offset: (this.messagesPagination.currentPage - 1) * this.messagesPagination.perPage
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
        if(this.usersInfoLoading[message.authorStaticId] || this.usersInfo[message.authorStaticId]) {
          return;
        }
        this.$identities.loading('usersInfo', message.authorStaticId);
        this.$identities.set('usersInfo', message.authorStaticId, await this.$geesome.getUser(message.authorStaticId));
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
    onEnter(event) {
      if(event.shiftKey) {
        return;
      }
      this.newMessage.text = _.trimEnd(this.newMessage.text, "\n");
      this.sendMessage();
    },
    async sendMessage() {
      let contentsIds = [];
      
      const text = this.newMessage.text;
      
      this.newMessage.text = '';
      
      const textContent = await this.$geesome.saveContentData(text, {
        groupId: this.selectedGroupId,
        mimeType: 'text/markdown'
      });

      contentsIds.push(textContent.id);

      contentsIds = contentsIds.concat(this.newMessage.contentsDbIds);

      this.newMessage.contentsDbIds = [];
      
      await this.$geesome.createPost({contents: contentsIds.map(id => ({id})), groupId: this.selectedGroupId, status: 'published'}).then(() => {
        this.saving = false;
        this.$emit('new-post');
        EventBus.$emit(UPDATE_GROUP, this.selectedGroupId);
      });

      // await this.getGroupPosts(0);
    },
    chooseAttachments() {
      this.$root.$asyncModal.open({
        id: 'choose-file-contents-ids-modal',
        component: ChooseFileContentsIdsModal,
        onClose: (selected) => {
          this.newMessage.contentsDbIds = selected;
        }
      });
    },
    getLocale(key, options?) {
      return this.$locale.get(this.localeKey + "." + key, options);
    }
  },
  watch: {
    selectedGroupId() {
       this.getGroupPosts(0);
    }
  },
  computed: {
    selectedGroupId() {
      return this.$route.params.groupId;
    },
    currentGroup() {
      return _.find(this.groups, {ipns: this.selectedGroupId});
    },
    user() {
      return this.$store.state.user;
    },
    usersInfo() {
      return this.$store.state.usersInfo;
    },
    usersInfoLoading() {
      return this.$store.state.usersInfoLoading;
    },
  },
  data() {
    return {
      localeKey: 'chat_page',
      loading: true,
      groups: [],
      messages: [],
      messagesLoading: false,
      messagesPagination: {
        currentPage: 1,
        perPage: 20
      },
      newMessage: {
        text: '',
        contentsDbIds: []
      }
    };
  }
}
