/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import PostItem from "../../directives/Posts/PostItem/PostItem";
import NewPostControl from "./NewPostControl/NewPostControl";
import Pagination from "geesome-vue-components/src/directives/Pagination/Pagination";

const _ = require('lodash');

export default {
  template: require('./GroupPage.template'),
  components: {PostItem, NewPostControl, Pagination},
  props: ['group'],
  async created() {
    this.getPosts();
  },
  methods: {
    async getPosts() {
      this.posts = [];
      this.loading = true;
      await this.$geesome.getGroupPostsAsync(this.groupId, {
        limit: this.perPage,
        offset: (this.currentPage - 1) * this.perPage
      }, (posts) => {
        this.posts = _.clone(posts);
      }, (posts) => {
        this.posts = _.clone(posts);
        this.loading = false;
      });

      this.$geesome.subscribeToGroupUpdates(this.groupId, (update) => {
        console.log('update', update);
      })
    }
  },
  watch: {
    groupId() {
      this.getPosts();
    },
    currentPage() {
      this.getPosts();
    }
  },
  computed: {
    groupId() {
      return this.$route.params.groupId;
    }
  },
  data() {
    return {
      localeKey: 'group_page',
      posts: [],
      loading: true,
      currentPage: 1,
      perPage: 10
    };
  }
}
