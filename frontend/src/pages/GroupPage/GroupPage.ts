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

import PostItem from "../../directives/Posts/PostItem/PostItem";
import NewPostControl from "./NewPostControl/NewPostControl";
import Pagination from "@galtproject/frontend-core/directives/Pagination/Pagination";

const _ = require('lodash');

export default {
  template: require('./GroupPage.html'),
  components: {PostItem, NewPostControl, Pagination},
  props: ['group'],
  async created() {
    this.getPosts();
  },
  methods: {
    async getPosts() {
      this.posts = [];
      this.loading = true;
      await this.$coreApi.getGroupPostsAsync(this.groupId, {
        limit: this.perPage,
        offset: (this.currentPage - 1) * this.perPage
      }, (posts) => {
        this.posts = _.clone(posts);
      }, (posts) => {
        this.posts = _.clone(posts);
        this.loading = false;
      });
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
