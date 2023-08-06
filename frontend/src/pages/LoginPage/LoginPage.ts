/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const Web3Manager = require('geesome-libs/src/web3Manager');

export default {
  template: require('./LoginPage.template'),
  created() {
    this.server = this.stateServerAddress;
  },
  methods: {
    login(method) {
      if(method === 'password') {
        this.handleLoginPromise(this.$geesome.loginPassword(this.server, this.username, this.password))
      } else if(method === 'api-key') {
        this.handleLoginPromise(this.$geesome.loginApiKey(this.server, this.apiKey));
      }
    },
    ethereumLogin() {
      Web3Manager.onAccountAddressChange(async (address) => {
        const fieldName = 'message';
        Web3Manager.onAccountAddressChangeCallbacks = [];

        const authMessage = await this.$geesome.generateAuthMessage('ethereum', address);
        const signature = await Web3Manager.signMessage(authMessage.message, address, fieldName);

        this.handleLoginPromise(this.$geesome.loginAuthMessage(this.server, authMessage.id, address, signature, { fieldName }));
      });
      Web3Manager.initClientWeb3();
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
