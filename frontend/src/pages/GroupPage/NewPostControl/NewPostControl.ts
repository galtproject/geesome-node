/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import ContentManifestInfoItem from "../../../directives/ContentManifestInfoItem/ContentManifestInfoItem";
import {EventBus, UPDATE_GROUP} from "../../../services/events";

export default {
  template: require('./NewPostControl.template'),
  props: ['group'],
  components: {ContentManifestInfoItem},
  async created() {
    this.fetchData();
  },

  async mounted() {

  },

  methods: {
    async fetchData() {
      if (!this.group) {
        this.canCreatePosts = false;
        return;
      }
      this.canCreatePosts = await this.$geesome.getCanCreatePost(this.group.staticId);
    },
    handleUpload(data) {
      this.postContentsDbIds.push(data.id);
    },
    deleteContent(index) {
      this.postContentsDbIds.splice(index, 1);
    },
    publishPost() {
      const postContentsDbIds = this.postContentsDbIds;
      this.postContentsDbIds = [];
      this.saving = true;
      this.$geesome.createPost({contents: postContentsDbIds.map(id => ({id})), groupId: this.group.staticId, status: 'published'}).then(() => {
        this.saving = false;
        this.$emit('new-post');
        EventBus.$emit(UPDATE_GROUP, this.group.id);
      })
    },
  },

  watch: {
    group() {
      this.fetchData();
    }
  },

  computed: {},
  data() {
    return {
      localeKey: 'group_page',
      canCreatePosts: false,
      saving: false,
      postContentsDbIds: []
    }
  },
}
