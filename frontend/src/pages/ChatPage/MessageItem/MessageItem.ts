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

const _ = require('lodash');
const moment = require('moment');

export default {
  template: require('./MessageItem.html'),
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
      return this.user.manifestStaticStorageId == this.message.author;
    }
  },
  data() {
    return {
      content: ''
    }
  },
}