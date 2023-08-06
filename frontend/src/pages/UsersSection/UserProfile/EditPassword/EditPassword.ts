/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {EventBus, UPDATE_CURRENT_USER} from "../../../../services/events";

export default {
  template: require('./EditPassword.template'),
  components: {},
  async created() {

  },
  methods: {
    update() {
      this.sending = true;
      this.$geesome.updateCurrentUser(this.user).then(async () => {
        this.sending = false;
        EventBus.$emit(UPDATE_CURRENT_USER);
        this.$router.push({ name: 'current-user-profile' })
      }).catch((e) => {
        this.error = e.message;
      })
    }
  },
  computed: {
    passwordsMatch() {
      return this.user.password && this.user.password === this.user.passwordConfirm;
    },
  },
  data() {
    return {
      localeKey: 'edit_password',
      user: {
        password: "",
        passwordConfirm: "",
      },
      sending: false,
      error: null,
      invalidInputs: true
    };
  }
}
