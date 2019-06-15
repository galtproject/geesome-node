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

import {ModalItem} from '@galtproject/frontend-core/modals/AsyncModal'

export default {
  template: require('./CybLinkKeywordsModal.html'),
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
