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

const pick = require('lodash/pick');

export default {
  template: require('./NewUserRegister.template'),
  components: {PeriodInput},
  methods: {
    create() {
      this.creation = true;
      if(this.user.ethereumAddress) {
        this.user.foreignAccounts = [{provider: 'ethereum', address: this.user.ethereumAddress}];
      }

      this.user.permissions = [];

      if (this.isAdmin) {
        this.user.permissions.push('admin:all');
      } else {
        if(this.isOnlySaveData) {
          this.user.permissions = this.user.permissions.concat(['user:save_data']);
        } else {
          this.user.permissions = this.user.permissions.concat(['user:all']);
        }
      }

      this.$geesome.adminCreateUser(this.user).then(async (createdUser) => {
        if (!this.passwordAuth) {
          this.resultApiKey = await this.$geesome.adminAddUserApiKey(createdUser.id, {type: 'admin_manual'});
        }
        this.user.id = createdUser.id;

        if (this.userLimit.isActive) {
          await this.$geesome.adminSetUserLimit({
            userId: createdUser.id,
            value: parseFloat(this.userLimit.valueMb) * 1024 * 1024,
            ...pick(this.userLimit, ['name', 'isActive', 'periodTimestamp'])
          });
        }
        this.created = true;
        this.error = null;
      }).catch((e) => {
        this.error = e && e.message && Helper.humanizeKey(e.message);
        this.creation = false;
      })
    }
  },
  computed: {
    creationDisabled() {// || !this.user.email
      return !this.user.name || !(this.passwordAuth ? this.user.password : true) || !(this.userLimit.isActive ? (this.userLimit.valueMb && this.userLimit.periodTimestamp) : true);
    }
  },
  data() {
    return {
      localeKey: 'new_user',
      user: {
        name: '',
        title: '',
        email: '',
        keyStoreMethod: 'node',
        ethereumAddress: ''
      },
      isAdmin: false,
      isOnlySaveData: false,
      passwordAuth: true,
      userLimit: {
        isActive: false,
        periodTimestamp: 60 * 60 * 24,
        valueMb: 100,
        name: 'save_content:size' //TODO: include and use UserLimitName.SaveContentSize
      },
      resultApiKey: null,
      error: null,
      creation: false,
      created: false
    };
  }
}
