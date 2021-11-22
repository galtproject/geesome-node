/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {ModalItem} from 'geesome-vue-components/src/modals/AsyncModal'

const pick = require('lodash/pick');
const includes = require('lodash/includes');

export default {
  template: require('./AddSocNetClientModal.template'),
  props: [],
  components: {
    ModalItem
  },
  created() {

  },
  methods: {
    async login() {
      try {
        const result = await this.$coreApi.socNetLogin(this.socnet, pick(this, ['apiId', 'apiHash', 'phoneNumber', 'phoneCodeHash', 'phoneCode', 'password']));
        console.log('result', result);
        if (result.phoneCodeHash) {
          this.phoneCodeHash = result.phoneCodeHash;
          this.phoneCodeRequired = true;
        } else if (result.user) {
          this.close()
        }
      } catch (e) {
        console.error('e', e);
        if (includes(e.message, 'SESSION_PASSWORD_NEEDED')) {
          this.passwordRequired = true;
        }
      }
    },
    async close() {
      this.$root.$asyncModal.close('add-soc-net-client-modal');
    }
  },
  watch: {},
  computed: {
    loginDisabled() {
      return !this.phoneNumber || !this.apiId || !this.apiHash || (this.phoneCodeRequired && !this.phoneCode) || (this.passwordRequired && !this.password);
    }
  },
  data: function () {
    return {
      apiId: '',
      apiHash: '',
      phoneNumber: '',
      phoneCodeHash: '',
      phoneCode: '',
      password: '',
      phoneCodeRequired: false,
      passwordRequired: false,
      socnet: 'telegram'
    }
  }
}
