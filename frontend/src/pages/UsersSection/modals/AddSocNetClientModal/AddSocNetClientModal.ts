/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import QRCode from 'qrcode';
import {ModalItem} from 'geesome-vue-components/src/modals/AsyncModal';

const includes = require('lodash/includes');
const clone = require('lodash/clone');

export default {
  template: require('./AddSocNetClientModal.template'),
  props: ['account'],
  components: {
    ModalItem
  },
  async created() {
    if (this.account) {
      this.socNet = this.account.socNet;
      const account = clone(this.account);
      await this.$geesome.setKeysToSocNetAccountData(this.socNet, account);
      this.inputs = account;
      ['isEncrypted'].forEach(boolField => {
        this.$set(this.inputs, boolField, !!this.account[boolField]);
      })
    }
  },
  methods: {
    async login() {
      this.loading = true;
      console.log('loading', this.loading);
      try {
        console.log('this.inputs', this.inputs);
        const result = await this.$geesome.socNetLogin(this.socNet, this.inputs);
        if (result.error) {
          throw new Error(result.error);
        }
        console.log('result', result);
        if (result.response.phoneCodeHash) {
          this.inputs.phoneCodeHash = result.response.phoneCodeHash;
          this.phoneCodeRequired = true;
          this.$set(this.inputs, 'stage', 2);
        } else if (result.response.user || result.response.id) {
          this.close();
          this.$notify({
            type: 'success',
            title: "Success"
          });
        }
      } catch (e) {
        console.error('e', e);
        this.$notify({
          type: 'error',
          title: e.message
        });
        if (includes(e.message, 'SESSION_PASSWORD_NEEDED')) {
          this.passwordRequired = true;
          this.$set(this.inputs, 'stage', 3);
        }
      }
      this.loading = false;
    },
    async getQrCode() {
      this.loading = true;
      const result = await this.$geesome.socNetLogin(this.socNet, this.inputs);
      console.log('result', result);
      this.$refs.qrimage.src = await QRCode.toDataURL(result.response.url);
      this.$set(this.inputs, 'stage', 2);
      this.$set(this.inputs, 'id', result.account.id);
      this.loading = false;
    },
    async close() {
      this.$root.$asyncModal.close('add-soc-net-client-modal');
    }
  },
  watch: {
    'inputs.byQrCode'() {
      if (this.inputs.byQrCode) {
        this.$set(this.inputs, 'stage', 1);
        this.getQrCode();
      }
    },
    'socNet'() {
      if (this.socNet === 'telegram') {
        this.inputs.stage = 1;
      } else {
        this.inputs.stage = 0;
      }
    }
  },
  computed: {
    loginDisabled() {
      if (this.inputs.byQrCode) {
        return this.passwordRequired ? !this.inputs.password : false;
      }
      if (this.socNet === 'telegram') {
        return !this.inputs.phoneNumber || !this.inputs.apiId || !this.inputs.apiKey || (this.phoneCodeRequired && !this.inputs.phoneCode) || (this.passwordRequired && !this.inputs.password);
      }
      if (this.socNet === 'twitter') {
        return !this.inputs.apiId || !this.inputs.apiKey || !this.inputs.accessToken || !this.inputs.sessionKey;
      }
    }
  },
  data: function () {
    return {
      loading: false,
      socNet: 'telegram',
      inputs: {
        apiId: '',
        apiKey: '',
        accessToken: '',
        sessionKey: '',
        phoneNumber: '',
        phoneCodeHash: '',
        phoneCode: '',
        password: '',
        isEncrypted: true,
        stage: 1,
        forceSMS: false,
        byQrCode: false,
      },
      phoneCodeRequired: false,
      passwordRequired: false
    }
  }
}
