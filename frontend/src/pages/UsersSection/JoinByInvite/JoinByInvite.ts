/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import PeriodInput from "geesome-vue-components/src/directives/PeriodInput/PeriodInput";
import Helper from "geesome-vue-components/src/services/helper";
const Web3Manager = require('geesome-libs/src/web3Manager');
const geesomeMessages = require('geesome-libs/src/messages');

export default {
  template: require('./JoinByInvite.template'),
  components: {PeriodInput},
  methods: {
    register() {
      if (this.user.ethereumAddress && !this.user.ethereumSignature) {
        return this.$notify({
          title: 'Ethereum address signature is required.',
          type: 'error'
        });
      }

      if (this.user.ethereumAddress) {
        this.user.foreignAccounts = [
          { provider: 'ethereum', address: this.user.ethereumAddress, signature: this.user.ethereumSignature },
        ];
      } else {
        this.user.foreignAccounts = [];
      }
      this.creation = true;
      this.error = null;
      this.$geesome.joinByInvite(this.$route.params.code, this.user).then(async ({user, apiKey}) => {
        this.resultApiKey = apiKey;
        this.user.id = user.id;
        this.created = true;

        this.$geesome.loginApiKey(this.$store.state.serverAddress, apiKey).then(({user}) => {
          this.$store.commit('user', user);
          this.$router.push({name: 'main-page'});
        });
      }).catch((e) => {
        this.error = e && e.message && Helper.humanizeKey(e.message);
        this.creation = false;
      })
    },
    sign() {
      Web3Manager.onAccountAddressChange(async (address) => {
        Web3Manager.onAccountAddressChangeCallbacks = [];

        this.user.ethereumSignature = await Web3Manager.signMessage(
            geesomeMessages.acceptInvite(await this.$geesome.getSelfAccountId(), this.$route.params.code),
            address,
            'message'
        );
      });
      Web3Manager.initClientWeb3();
    },
  },
  watch: {
    passwordAuth() {
      if (!this.passwordAuth) {
        this.user.password = '';
        this.user.passwordConfirm = '';
      }
    }
  },
  computed: {
    joinDisabled() {
      return !this.user.name || !!(this.user.ethereumAddress && !this.user.ethereumSignature) || (this.user.password && this.user.password !== this.user.passwordConfirm);
    }
  },
  data() {
    return {
      localeKey: 'new_user',
      user: {
        name: '',
        email: '',
        password: '',
        passwordConfirm: '',
        keyStoreMethod: 'node',
        ethereumAddress: '',
        ethereumSignature: ''
      },
      resultApiKey: null,
      error: null,
      creation: false,
      created: false,
      passwordAuth: true,
    };
  }
}
