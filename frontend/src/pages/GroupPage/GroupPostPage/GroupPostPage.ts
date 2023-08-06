/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import PostItem from "../../../directives/Posts/PostItem/PostItem";

export default {
  template: require('./GroupPostPage.template'),
  components: {PostItem},
  props: ['group'],
  async created() {
    this.getPost();
  },
  methods: {
    async getPost() {
      this.loading = true;
      this.post = await this.$geesome.getGroupPost(this.groupId, this.postId);
      this.loading = false;
    }
  },
  watch: {
    groupId() {
      this.getPost();
    },
    postId() {
      this.getPost();
    }
  },
  computed: {
    groupId() {
      return this.$route.params.groupId;
    },
    postId() {
      return this.$route.params.postId;
    }
  },
  data() {
    return {
      localeKey: 'group_post_page',
      post: null,
      loading: true
    };
  }
}
