/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const _ = require('lodash');
const moment = require('moment');

export default {
  template: require('./MessageItem.template'),
  props: ['message', 'messagesAuthors'],
  async created() {

  },

  async mounted() {

  },

  methods: {
    
  },

  watch: {
    
  },

  computed: {
    contentsList() {
      return _.orderBy(this.message.contents, ['position'], ['asc']);
    },
    usersInfo() {
      return this.$store.state.usersInfo;
    },
    date() {
      return moment(this.message.publishedAt).format('DD.MM.YYYY h:mm:ss');
    },
    user() {
      return this.$store.state.user;
    },
    isCurrentUserMessage() {
      return this.user.manifestStaticStorageId == this.message.authorStaticId;
    }
  },
  data() {
    return {
      content: ''
    }
  },
}
