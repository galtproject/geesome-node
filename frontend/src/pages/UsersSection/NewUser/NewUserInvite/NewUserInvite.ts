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
const uniq = require('lodash/uniq');
import common from "../../../../libs/common";

export default {
  template: require('./NewUserInvite.template'),
  components: {PeriodInput},
  methods: {
    create() {
      this.creation = true;

      this.invite.permissions = [];

      if (this.isAdmin) {
        this.invite.permissions = this.invite.permissions.concat(['user:all', 'admin:all']);
      } else {
        if(this.isOnlySaveData) {
          this.invite.permissions = this.invite.permissions.concat(['user:save_data']);
        } else {
          this.invite.permissions = this.invite.permissions.concat(['user:all']);
        }
      }

      this.invite.permissions = JSON.stringify(uniq(this.invite.permissions));

      if (this.inviteLimit.isActive) {
        this.invite.limits = JSON.stringify([{
          value: parseFloat(this.inviteLimit.valueMb) * 1024 * 1024,
          ...pick(this.inviteLimit, ['name', 'isActive', 'periodTimestamp'])
        }]);
      }

      this.$geesome.adminCreateInvite(this.invite).then(async (invite) => {
        this.invite.id = invite.id;
        this.invite.code = invite.code;
        this.inviteUrl = common.getInvitePage(this.$router, invite.code);

        this.created = true;
        this.error = null;
      }).catch((e) => {
        this.error = e && e.message && Helper.humanizeKey(e.message);
        this.creation = false;
      })
    }
  },
  computed: {
    creationDisabled() {
      return !this.invite.maxCount;
    }
  },
  data() {
    return {
      localeKey: 'new_user',
      invite: {
        title: '',
        maxCount: 1,
        id: null,
        code: null,
        isActive: true
      },
      isAdmin: false,
      isOnlySaveData: false,
      passwordAuth: true,
      inviteLimit: {
        isActive: false,
        periodTimestamp: 60 * 60 * 24,
        valueMb: 100,
        name: 'save_content:size' //TODO: include and use inviteLimitName.SaveContentSize
      },
      inviteUrl: null,
      resultApiKey: null,
      error: null,
      creation: false,
      created: false
    };
  }
}
