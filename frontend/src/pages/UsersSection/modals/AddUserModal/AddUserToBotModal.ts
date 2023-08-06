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
  template: require('./AddUserBotModal.template'),
  props: ['botData'],
  components: {
    ModalItem
  },
  created() {
  },
  methods: {
    async add() {
      this.contentBot.contentBotId = this.botData.id;
      this.resultContentBot = await this.$geesome.addUserTg(this.contentBot);
      this.close(this.resultContentBot);
    },
    async close(data) {
      this.$root.$asyncModal.close('add-user-modal', data);
    }
  },
  watch: {},
  computed: {},
  data: function () {
    return {
      resultContentBot: null,
      contentBot: {
        userTgId: '',
        contentLimit: '100',
        isAdmin: false,
      }
    }
  }
}

