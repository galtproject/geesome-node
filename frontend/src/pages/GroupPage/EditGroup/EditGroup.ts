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
  template: require('./EditGroup.html'),
  components: {ContentManifestItem, GroupForm},
  async created() {
    this.group = await this.$coreApi.getDbGroup(this.$route.params.groupId);
  },
  methods: {
    update() {
      this.$coreApi.updateGroup(this.group).then((updatedGroup) => {
        EventBus.$emit(UPDATE_ADMIN_GROUPS);
        this.$router.push({name: 'group-page', params: {groupId: updatedGroup.manifestStaticStorageId}})
      }).catch(() => {
        this.error = 'failed';
      })
    }
  },
  computed: {},
  data() {
    return {
      localeKey: 'edit_group',
      group: null,
      error: null,
      invalidInputs: true
    };
  }
}
