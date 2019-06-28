/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company 
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster), 
 * [Valery Litvin](https://github.com/litvintech) by 
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 * ​
 * Copyright ©️ 2018 Galt•Core Blockchain Company 
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and 
 * Galt•Space Society Construction and Terraforming Company by 
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

export default {
  template: require('./SetupPage.html'),
  components: {},
  methods: {
    setup() {
      this.$coreApi.setup(this.setupData).then(() => {
        // EventBus.$emit(UPDATE_ADMIN_GROUPS);
        this.$coreApi.getCurrentUser().then((user) => {
          this.$store.commit('user', user);
          this.$router.push({name: 'main-page'});
        });
      }).catch(() => {
        this.error = 'failed';
      })
    }
  },
  computed: {
    invalidInputs() {
      return !this.setupData.name || !this.setupData.email || !this.setupData.password || this.setupData.password != this.setupData.repeatPassword;
    }
  },
  data() {
    return {
      localeKey: 'setup_page',
      setupData: {
        name: '',
        email: '',
        password: '',
        repeatPassword: ''
      },
      error: null
    };
  }
}
