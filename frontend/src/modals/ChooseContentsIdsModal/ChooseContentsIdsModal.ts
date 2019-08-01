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
import FileCatalog from "../../directives/FileCatalog/FileCatalog";

export default {
  template: require('./ChooseContentsIdsModal.html'),
  props: [],
  components: {
    ModalItem,
    FileCatalog
  },
  created() {

  },
  methods: {
    async ok() {
      this.contentsIds = await this.$coreApi.getContentsIdsByFileCatalogIds(this.fileCatalogItemsIds);
      this.$root.$asyncModal.close('choose-contents-ids-modal', this.contentsIds);
    },
    cancel() {
      this.$root.$asyncModal.close('choose-contents-ids-modal');
    }
  },
  watch: {},
  data: function () {
    return {
      localeKey: 'choose_contents_ids_modal',
      contentsIds: [],
      fileCatalogItemsIds: []
    }
  }
}
