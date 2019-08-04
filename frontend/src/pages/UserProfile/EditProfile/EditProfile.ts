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

import {EventBus, UPDATE_CURRENT_USER} from "../../../services/events";
import ContentManifestItem from "../../../directives/ContentManifestItem/ContentManifestItem";
import ProfileForm from "../ProfileForm/ProfileForm";

export default {
  template: require('./EditProfile.html'),
  components: {ContentManifestItem, ProfileForm},
  async created() {
    this.user = await this.$coreApi.getCurrentUser();
  },
  methods: {
    update() {
      this.$coreApi.updateCurrentUser(this.user).then((updatedUser) => {
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
