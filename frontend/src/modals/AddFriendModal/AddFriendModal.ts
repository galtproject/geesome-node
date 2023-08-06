/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {ModalItem} from 'geesome-vue-components/src/modals/AsyncModal'

export default {
  template: require('./AddFriendModal.template'),
  props: [],
  components: {
    ModalItem
  },
  created() {
    // this.serverAddress = this.currentServerAddress;
  },
  methods: {
    async ok() {
      await this.$geesome.addFriend(this.friendId);
      this.$root.$asyncModal.close('add-friend-modal');
    },
    async cancel() {
      this.$root.$asyncModal.close('add-friend-modal');
    }
  },
  watch: {},
  computed: {
    
  },
  data: function () {
    return {
      friendId: ''
    }
  }
}
