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
  template: require('./ImageModal.template'),
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
