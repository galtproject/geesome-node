/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {ModalItem} from 'geesome-vue-components/src/modals/AsyncModal'
import FileCatalog from "../../directives/FileCatalog/FileCatalog";

export default {
  template: require('./ChooseContentsIdsModal.template'),
  props: [],
  components: {
    ModalItem,
    FileCatalog
  },
  created() {

  },
  methods: {
    async ok() {
      this.contentsIds = await this.$geesome.getContentsIdsByFileCatalogIds(this.fileCatalogItemsIds);
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
