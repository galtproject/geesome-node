/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import Ethereum from "../../services/ethereum";

export default {
  template: require('./LoginPage.html'),
  created() {
    this.server = this.stateServerAddress;
  },
  methods: {
    login(method) {
      if(method === 'password') {
        this.handleLoginPromise(this.$coreApi.loginPassword(this.server, this.username, this.password))
      } else if(method === 'api-key') {
        this.handleLoginPromise(this.$coreApi.loginApiKey(this.server, this.apiKey));
      }
    },
    ethereumLogin() {
      Ethereum.onAccountAddressChange(async (address) => {
        const fieldName = 'key';
        Ethereum.onAccountAddressChangeCallbacks = [];

        const authMessage = await this.$coreApi.generateAuthMessage('ethereum', address);
        const signature = await Ethereum.signMessage(authMessage.message, address, fieldName);

        this.handleLoginPromise(this.$coreApi.loginAuthMessage(this.server, authMessage.id, address, signature, { fieldName }));
      });
      Ethereum.initClientWeb3();
    },
    handleLoginPromise(promise) {
      promise.then((data) => {
        this.$store.commit('user', data.user);
        this.$router.push({name: 'main-page'});
        this.error = null;
      }).catch(() => {
        this.error = 'failed';
      })
    }
  },
  watch: {
    stateServerAddress() {
      this.server = this.stateServerAddress;
    }
  },
  computed: {
    stateServerAddress(){
      return this.$store.state.serverAddress;
    }
  },
  data() {
    return {
      localeKey: 'login_page',
      server: null,
      apiKey: null,
      username: null,
      password: null,
      error: null
    };
  }
}
