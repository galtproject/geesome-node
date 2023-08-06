/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {EventBus, UPDATE_ADMIN_GROUPS} from "../../../services/events";
import ContentManifestItem from "../../../directives/ContentManifestItem/ContentManifestItem";
import GroupForm from "../GroupForm/GroupForm";
import common from "../../../libs/common";
const commonHelpers = require("geesome-libs/src/common");

export default {
  template: require('./EditGroup.template'),
  components: {ContentManifestItem, GroupForm},
  async created() {
    this.group = await this.$geesome.getDbGroup(this.$route.params.groupId);
  },
  methods: {
    update() {
      console.log('common.getGroupHomePage(this.$router, this.group.manifestStaticStorageId)', common.getGroupHomePage(this.$router, this.group.manifestStaticStorageId));
      this.$geesome.updateGroup({
        ...this.group,
        homePage: common.getGroupHomePage(this.$router, this.group.manifestStaticStorageId)
      }).then((updatedGroup) => {
        EventBus.$emit(UPDATE_ADMIN_GROUPS);
        this.$router.push({name: 'group-page', params: {groupId: updatedGroup.manifestStaticStorageId}})
      }).catch((e) => {
        this.$notify({
          type: 'error',
          title: 'Failed',
          text: e.message
        });
      })
    },
    deleteGroup() {
      if (!confirm("Are you sure want to delete this group?")) {
        return;
      }
      this.$geesome.updateGroup({
        ...this.group,
        name: this.group.name + '_deleted_' + commonHelpers.makeCode(16),
        isDeleted: true
      }).then((updatedGroup) => {
        EventBus.$emit(UPDATE_ADMIN_GROUPS);
        this.$router.push({name: 'group-page', params: {groupId: updatedGroup.manifestStaticStorageId}})
      }).catch((e) => {
        this.$notify({
          type: 'error',
          title: 'Failed',
          text: e.message
        });
      })
    },
    makeid(length) {
      var result           = '';
      var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      var charactersLength = characters.length;
      for ( var i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
      }
      return result;
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
