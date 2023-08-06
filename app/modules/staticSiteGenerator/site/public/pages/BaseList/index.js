import Pagination from '../../components/Pagination/index.js';
import Layout from "../Layout/index.js";
import PostListItem from "../../components/PostListItem/index.js";

export default {
  components: { Pagination, Layout, PostListItem },
  inject: ['store'],
  data() {
    return {
      // paginationComponent: null,
    }
  },

  created() {
    // console.log('baseList page', this.$route.params.page);
  },

  computed: {
    curPage() {
      return parseInt(this.$route.params.page || this.pagesCount);
    },
    postsPerPage() {
      return this.store.postsPerPage;
    },
    postsList() {
      const curPageIndex = this.pagesCount - this.curPage;
      const startIndex = curPageIndex * this.postsPerPage;
      return this.store.posts.slice(startIndex, startIndex + this.postsPerPage);
    },
    pagesCount() {
      return this.store.pagesCount;
    },
    view() {
      return this.store.options.view;
    }
  },

  methods: {
    // resolvePostTags(tags) {
    //   if (!tags || Array.isArray(tags)) return tags
    //   return [tags]
    // },
  },
    template: `
      <layout>
        <template #page>
          <div id="base-list-layout">
            <div :class="['ui-posts']" itemscope itemtype="http://schema.org/Blog">
              <post-list-item v-for="post in postsList" :post="post"></post-list-item>
            </div>
            <div v-if="pagesCount">
              <pagination :pages-count="pagesCount" :cur-page="curPage" :display-pages="10" :reverse="1"></pagination>
            </div>
          </div>
        </template>
      </layout>
  `
}
