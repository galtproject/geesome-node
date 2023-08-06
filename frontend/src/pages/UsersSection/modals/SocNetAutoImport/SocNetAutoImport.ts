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
  props: ['dbChannel', 'staticSiteOptions', 'dbStaticSite'],
  components: {
    ModalItem,
    PeriodInput,
  },
  async created() {
    this.apiToken = this.$geesome.getApiToken();

    const existAutoActions = await this.$geesome.getAutoActions({
      moduleName: 'telegramClient',
      funcName: 'runChannelImportAndWaitForFinish'
    }).then(d => d.list);

    this.existAction = existAutoActions.filter(a => JSON.parse(a.funcArgs)[2] === this.dbChannel.channelId)[0];
    console.log('this.existAction', this.existAction);
    if (this.existAction) {
      this.runPeriod = this.existAction.executePeriod;
      this.isDisabled = this.runPeriod === 0;
    } else {
      this.runPeriod = 60;
    }
  },
  methods: {
    async ok() {
      this.saving = true;
      if (this.existAction) {
        await this.$geesome.updateAutoAction(this.existAction.id, this.$geesome.buildAutoActions([
            await this.runChannelImportData(),
        ], this.runPeriod)[0]);

        const generateSiteAction = await this.$geesome.getAutoActions({
          id: this.existAction.nextActions[0].id
        }).then(d => d.list[0]);

        await this.$geesome.updateAutoAction(generateSiteAction.id, this.$geesome.buildAutoActions([
          this.generateSiteData()
        ], 0)[0]);

        const bindStaticIdAction = generateSiteAction.nextActions[0];

        await this.$geesome.updateAutoAction(bindStaticIdAction.id, this.$geesome.buildAutoActions([
          this.bindStaticIdData()
        ], 0)[0]);
      } else {
        await this.$geesome.addSerialAutoActions(this.$geesome.buildAutoActions([
          await this.runChannelImportData(),
          this.generateSiteData(),
          this.bindStaticIdData()
        ], this.runPeriod));
      }

      this.close(true);
    },
    async runChannelImportData() {
      const apiKey = await this.$geesome.getCurrentUserApiKey();
      const socNetAccData: any = {id: this.dbChannel.accountId};
      socNetAccData.sessionKey = await this.$geesome.getSocNetSessionKey('telegram', socNetAccData);
      return {
        moduleName: 'telegramClient',
        funcName: 'runChannelImportAndWaitForFinish',
        funcArgs: [apiKey.id, socNetAccData, this.dbChannel.channelId],
        isEncrypted: true,
      };
    },
    generateSiteData() {
      return {
        moduleName: 'staticSiteGenerator',
        funcName: 'runRenderAndWaitForFinish',
        funcArgs: [this.apiToken, 'group', this.dbChannel.groupId, this.staticSiteOptions],
        isEncrypted: true
      };
    },
    bindStaticIdData() {
      return {
        moduleName: 'staticSiteGenerator',
        funcName: 'bindSiteToStaticId',
        funcArgs: [this.dbStaticSite.id],
        isEncrypted: true
      }
    },
    close(success = false) {
      this.$root.$asyncModal.close('soc-net-auto-import', success);
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
      runPeriod: null,
      apiToken: null,
    }
  }
}
