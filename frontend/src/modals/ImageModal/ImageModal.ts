/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {ModalItem} from '@galtproject/frontend-core/modals/AsyncModal'

export default {
  template: require('./ImageModal.html'),
  props: ['images'],
  components: {
    ModalItem
  },
  created() {

  },
  methods: {
    async close() {
      this.$root.$asyncModal.close('image-modal');
    }
  },
  watch: {},
  data: function () {
    return {}
  }
}
