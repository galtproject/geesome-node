/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {ModalItem} from 'geesome-vue-components/src/modals/AsyncModal'

const clone = require('lodash/clone');

export default {
  template: require('./SocNetAutoImport.template'),
  props: ['socNetName', 'dbChannel'],
  components: {
    ModalItem
  },
  created() {
    this.channel = clone(this.dbChannel);
    this.channel.autoImportToken = this.$coreApi.getApiKey();
    this.isDisabled = this.channel.autoImportPeriod === 0;
  },
  methods: {
    async ok() {
      await this.$coreApi.socNetUpdateDbChannel(this.socNetName, this.channel.id, this.channel);
      this.close();
    },
    close() {
      this.$root.$asyncModal.close('soc-net-auto-import');
    },
    onDisabled() {
      if (this.isDisabled) {
        this.channel.autoImportPeriod = 0;
      } else {
        this.channel.autoImportPeriod = 60;
      }
    }
  },
  watch: {},
  computed: {},
  data: function () {
    return {
      localeKey: 'soc_net_channel.auto_import',
      channel: null,
      isDisabled: false
    }
  }
}
