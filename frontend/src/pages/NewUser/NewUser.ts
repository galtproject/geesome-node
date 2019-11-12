/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import PeriodInput from "@galtproject/frontend-core/directives/PeriodInput/PeriodInput";
import EthData from "@galtproject/frontend-core/libs/EthData";

const pIteration = require('p-iteration');

export default {
  template: require('./NewUser.html'),
  components: {PeriodInput},
  methods: {
    create() {
      this.creation = true;
      this.$coreApi.adminCreateUser(this.user).then(async (createdUser) => {
        if (!this.passwordAuth) {
          this.resultApiKey = await this.$coreApi.adminAddUserApiKey(createdUser.id, {type: 'admin_manual'});
        }
        if (this.userLimit.isActive) {
          await this.$coreApi.adminSetUserLimit(this.user);
        }
        if (this.isAdmin) {
          const permissions = ['admin:read', 'admin:add_user', 'admin:set_permissions', 'admin:set_user_limit', 'admin:add_user_api_key'];
          await pIteration.forEach(permissions, (permissionName) => {
            return this.$coreApi.adminAddCorePermission(createdUser.id, permissionName)
          });
        }
        this.created = true;
        this.error = null;
      }).catch((e) => {
        this.error = e && e.message && EthData.humanizeKey(e.message);
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
        keyStoreMethod: 'node'
      },
      isAdmin: false,
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
