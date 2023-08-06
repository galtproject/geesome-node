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

const pick = require('lodash/pick');

export default {
  template: require('./SetLimitModal.template'),
  props: ['userId'],
  components: {
    ModalItem,
    PeriodInput
  },
  async created() {
    const userLimit = await this.$geesome.adminGetUserLimit(this.userId, 'save_content:size');
    if(userLimit) {
      userLimit.valueMb = userLimit.value / (1024 * 1024);
      this.userLimit = userLimit;
    }
  },
  methods: {
    async ok() {
      this.saving = true;
      try {
        await this.$geesome.adminSetUserLimit({
          userId: this.userId,
          value: parseFloat(this.userLimit.valueMb) * 1024 * 1024,
          ...pick(this.userLimit, ['name', 'isActive', 'periodTimestamp'])
        });
        this.$root.$asyncModal.close('set-limit-modal');
      } catch (e) {
        this.$notify({
          type: 'error',
          text: e.message
        })
      }
    },
    async cancel() {
      this.$root.$asyncModal.close('set-limit-modal');
    }
  },
  watch: {},
  computed: {},
  data: function () {
    return {
      localeKey: 'set_limit_modal',
      saving: false,
      userLimit: {
        isActive: false,
        periodTimestamp: 60 * 60 * 24,
        valueMb: 100,
        name: 'save_content:size' //TODO: include and use UserLimitName.SaveContentSize
      }
    }
  }
}
