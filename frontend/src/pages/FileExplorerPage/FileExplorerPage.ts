/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import FileCatalog from "../../directives/FileCatalog/FileCatalog";

export default {
  template: require('./FileExplorerPage.template'),
  components: {FileCatalog},
  props: [],
  async created() {

  },
  methods: {
    regeneratePreviews() {
      this.$geesome.regenerateUserPreviews();
    }
  },
  watch: {},
  computed: {},
  data() {
    return {
      localeKey: 'file_explorer_page',
      showAdvanced: false
    };
  }
}
