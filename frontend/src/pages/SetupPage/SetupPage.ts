/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export default {
  template: require('./SetupPage.template'),
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
