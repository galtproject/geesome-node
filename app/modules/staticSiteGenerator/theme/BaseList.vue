<template>
  <layout>
    <template #page>
      <div id="base-list-layout">
        <div class="ui-posts" itemscope itemtype="http://schema.org/Blog">
          <post-list-item v-for="page in pagesList" :post="page"></post-list-item>
        </div>
        <div v-if="pages.length">
          <pagination :pages-count="pages.length" :current-href="curPath" :display-pages="10" :base-href="pages[0].baseHref"></pagination>
        </div>
      </div>
    </template>
  </layout>
</template>

<script>
/* global THEME_BLOG_PAGINATION_COMPONENT */

import { usePageData, usePageFrontmatter } from '@vuepress/client'
import dayjs from 'dayjs';
import dayjsPluginUTC from 'dayjs/plugin/utc';
// import { NavigationIcon, ClockIcon, TagIcon } from 'vue-feather-icons';
import Pagination from './components/Pagination.vue';
import NavLink from "./components/NavLink.vue";
import Layout from "./Layout.vue";
import PostListItem from "./components/PostListItem.vue";

dayjs.extend(dayjsPluginUTC);

const page = usePageData();

export default {
  components: { Pagination, NavLink, Layout, PostListItem},

  data() {
    return {
      paginationComponent: null,
    }
  },

  computed: {
    curPage() {
      return page._value;
    },
    pagesList() {
      return this.curPage.$pagesList;
    },
    pages() {
      return this.curPage.$pagination.pages;
    },
    curPath() {
      return this.curPage.path;
    },
    frontmatter() {
      return this.curPage.frontmatter;
    },

  },

  methods: {
    resolvePostTags(tags) {
      if (!tags || Array.isArray(tags)) return tags
      return [tags]
    },
  },
}
</script>