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
  template: require('./AddContentBotModal.template'),
  props: [],
  components: {
    ModalItem
  },
  created() {
  },
  methods: {
    async ok() {
      this.resultContentBot = await this.$geesome.contentBotAdd(this.contentBot);
      this.close(this.resultContentBot);
    },
    async close(data) {
      this.$root.$asyncModal.close('add-content-bot-modal', data);
    }
  },
  watch: {},
  computed: {},
  data: function () {
    return {
      resultContentBot: null,
      contentBot: {
        socNet: 'telegram',
        tgToken: ''
      }
    }
  }
}
