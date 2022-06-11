/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {ModalItem} from 'geesome-vue-components/src/modals/AsyncModal'
import PeriodInput from "geesome-vue-components/src/directives/PeriodInput/PeriodInput";

export default {
  template: require('./SocNetAutoImport.template'),
  props: ['dbChannel', 'staticSiteOptions'],
  components: {
    ModalItem,
    PeriodInput,
  },
  async created() {
    this.apiToken = this.$coreApi.getApiToken();

    const existAutoActions = await this.$coreApi.getAutoActions({
      moduleName: 'telegramClient',
      funcName: 'runChannelImportAndWaitForFinish'
    }).then(d => d.list);

    this.existAction = existAutoActions.filter(a => JSON.parse(a.funcArgs)[2] === this.dbChannel.channelId)[0];
    console.log('this.existAction', this.existAction);
  },
  methods: {
    async ok() {
      const apiKey = await this.$coreApi.getCurrentUserApiKey();

      await this.$coreApi.addSerialAutoActions(this.$coreApi.buildAutoActions([{
        moduleName: 'telegramClient',
        funcName: 'runChannelImportAndWaitForFinish',
        funcArgs: [apiKey.id, {id: this.dbChannel.accountId}, this.dbChannel.channelId],
        isEncrypted: false,
      }, {
        moduleName: 'staticSiteGenerator',
        funcName: 'addRenderAndWaitForFinish',
        funcArgs: [this.apiToken, 'group', this.dbChannel.groupId, this.staticSiteOptions],
        isEncrypted: true
      }, {
        moduleName: 'staticSiteGenerator',
        funcName: 'bindSiteToStaticId',
        funcArgs: ['group', this.dbChannel.groupId, this.staticSiteOptions.site.name],
        isEncrypted: true
      }], this.runPeriod));

      this.close();
    },
    close() {
      this.$root.$asyncModal.close('soc-net-auto-import');
    },
    onDisabled() {
      if (this.isDisabled) {
        this.runPeriod = 0;
      } else {
        this.runPeriod = 60;
      }
    }
  },
  watch: {},
  computed: {},
  data: function () {
    return {
      localeKey: 'soc_net_channel.auto_import',
      saving: false,
      existAction: null,
      isDisabled: false,
      runPeriod: 60,
      apiToken: null,
    }
  }
}
