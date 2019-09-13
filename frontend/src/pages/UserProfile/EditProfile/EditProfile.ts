/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
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
