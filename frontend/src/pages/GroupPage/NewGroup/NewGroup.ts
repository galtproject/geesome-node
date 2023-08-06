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

export default {
  template: require('./NewGroup.template'),
  components: {ContentManifestItem, GroupForm},
  methods: {
    create() {
      this.sending = true;
      this.$geesome.createGroup(this.group).then(async (createdGroup) => {
        EventBus.$emit(UPDATE_ADMIN_GROUPS);
        await this.$geesome.updateGroup({
          id: createdGroup.id,
          homePage: common.getGroupHomePage(this.$router, createdGroup.manifestStaticStorageId)
        });
        this.sending = false;
        this.$router.push({name: 'group-page', params: {groupId: createdGroup.manifestStaticStorageId}});
      }).catch(() => {
        this.error = 'failed';
        this.sending = false;
      });
    }
  },
  computed: {},
  data() {
    return {
      localeKey: 'login_page',
      sending: false,
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
