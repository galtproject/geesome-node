/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {EventBus, UPDATE_CURRENT_USER} from "../../../../services/events";
import ContentManifestItem from "../../../../directives/ContentManifestItem/ContentManifestItem";
import ProfileForm from "../ProfileForm/ProfileForm";

const _ = require('lodash');

export default {
  template: require('./EditProfile.template'),
  components: {ContentManifestItem, ProfileForm},
  async created() {
    this.user = await this.$geesome.getCurrentUser();
    const ethereumAccount = _.find(this.user.foreignAccounts, {provider: 'ethereum'});
    
    if(ethereumAccount) {
      this.user.foreignAccounts = {
        ethereum: ethereumAccount
      };
    } else {
      this.user.foreignAccounts = {
        ethereum: {
          provider: 'ethereum',
          address: ''
        }
      };
    }
  },
  methods: {
    update() {
      this.$geesome.updateCurrentUser(this.user).then(async (updatedUser) => {
        await this.$geesome.setUserAccount(this.user.foreignAccounts.ethereum);
        EventBus.$emit(UPDATE_CURRENT_USER);
        this.$router.push({name: 'current-user-profile'})
      }).catch(() => {
        this.error = 'failed';
      })
    }
  },
  computed: {},
  data() {
    return {
      localeKey: 'edit_profile',
      user: null,
      error: null,
      invalidInputs: true
    };
  }
}
