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
  template: require('./CybLinkKeywordsModal.template'),
  props: ['contentHash'],
  components: {
    ModalItem
  },
  created() {
    document.addEventListener("cyb:popup-opened", (data) => {
      this.$root.$asyncModal.close('cyb-link-keywords-modal');
    });
  },
  methods: {
    async ok() {
      const event = new CustomEvent('cyb:link', {
        detail: {
          'contentHash': this.contentHash,
          'keywords': this.keywordsStr.toString().split(/[ ,]+/)
        }
      } as any);
      document.dispatchEvent(event);
      this.showCybPopupAttention = true;
    },
    async cancel() {
      this.$root.$asyncModal.close('cyb-link-keywords-modal');
    }
  },
  watch: {},
  computed: {},
  data: function () {
    return {
      keywordsStr: '',
      showCybPopupAttention: false
    }
  }
}
