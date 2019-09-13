/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {EventBus, UPDATE_ADMIN_GROUPS} from "../../../services/events";
import ContentManifestItem from "../../../directives/ContentManifestItem/ContentManifestItem";
import GroupForm from "../GroupForm/GroupForm";

export default {
  template: require('./NewGroup.html'),
  components: {ContentManifestItem, GroupForm},
  methods: {
    create() {
      this.$coreApi.createGroup(this.group).then((createdGroup) => {
        EventBus.$emit(UPDATE_ADMIN_GROUPS);
        this.$router.push({name: 'group-page', params: {groupId: createdGroup.manifestStaticStorageId}})
      }).catch(() => {
        this.error = 'failed';
      })
    }
  },
  computed: {},
  data() {
    return {
      localeKey: 'login_page',
      group: {
        name: '',
        title: '',
        type: 'channel',
        view: 'tumblr-like',
        isPublic: true,
        avatarImageId: null,
        coverImageId: null
      },
      error: null,
      invalidInputs: true
    };
  }
}
