<template>
  <layout>
    <template #page>
      <div id="base-list-layout">
        <div class="ui-posts" itemscope itemtype="http://schema.org/Blog">
          <article
              v-for="page in pagesList"
              :key="page.key"
              class="ui-post"
              itemprop="blogPost"
              itemscope
              itemtype="https://schema.org/BlogPosting"
          >
            <meta itemprop="mainEntityOfPage" :content="page.path" />

            <router-link :to="page.path" class="post-date">{{ resolvePostDate(page.date) }}</router-link>

            <p class="post-intro">{{ page.title }}</p>
<!--            <header class="ui-post-title" itemprop="name headline">-->
<!--              <nav-link :link="page.path">{{ page.title }}</nav-link>-->
<!--            </header>-->

            <div v-if="page.excerpt || page.images || page.videos">
              <!-- eslint-disable vue/no-v-html -->
              <div v-if="page.images && page.images.length">
                <img :src="page.images[0].url" class="post-image">
              </div>

              <div v-if="page.videos && page.videos.length">
                <video controls>
                  <source :src="page.videos[0].url + '.mp4'" type="video/mp4">
                  Your browser does not support the video tag.
                </video>
              </div>
              <!-- eslint-enable vue/no-v-html -->
            </div>



            <!--        <footer>-->
            <!--          <div-->
            <!--              v-if="page.frontmatter && page.frontmatter.author"-->
            <!--              class="ui-post-meta ui-post-author"-->
            <!--              itemprop="publisher author"-->
            <!--              itemtype="http://schema.org/Person"-->
            <!--              itemscope-->
            <!--          >-->
            <!--            <NavigationIcon />-->
            <!--            <span itemprop="name">{{ page.frontmatter.author }}</span>-->
            <!--            <span v-if="page.frontmatter.location" itemprop="address">-->
            <!--              &nbsp; in {{ page.frontmatter.location }}-->
            <!--            </span>-->
            <!--          </div>-->

            <!--          <div v-if="page.frontmatter && page.frontmatter.date" class="ui-post-meta ui-post-date">-->
            <!--            <ClockIcon />-->
            <!--            <time-->
            <!--                pubdate-->
            <!--                itemprop="datePublished"-->
            <!--                :datetime="page.frontmatter.date"-->
            <!--            >-->
            <!--              {{ resolvePostDate(page.frontmatter.date) }}-->
            <!--            </time>-->
            <!--          </div>-->

            <!--          <div-->
            <!--              v-if="page.frontmatter && page.frontmatter.tags"-->
            <!--              class="ui-post-meta ui-post-tag"-->
            <!--              itemprop="keywords"-->
            <!--          >-->
            <!--            <tag-icon />-->
            <!--            <router-link-->
            <!--                v-for="tag in resolvePostTags(page.frontmatter.tags)"-->
            <!--                :key="tag"-->
            <!--                :to="'/tag/' + tag"-->
            <!--            >-->
            <!--              {{ tag }}-->
            <!--            </router-link>-->
            <!--          </div>-->
            <!--        </footer>-->
          </article>
        </div>

        <pagination :pages-count="pages.length" :current-href="curPath" only-regular="true" :base-href="pages[0].baseHref"></pagination>
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
import Pagination from './components/Pagination';
import NavLink from "./components/NavLink";
import Layout from "./Layout";

dayjs.extend(dayjsPluginUTC);

const page = usePageData();

export default {
  components: { Pagination, NavLink, Layout },

  data() {
    return {
      paginationComponent: null,
    }
  },

  computed: {
    pagesList() {
      return page._value.$pagesList;
    },
    pages() {
      return page._value.$pagination.pages;
    },
    curPage() {
      return page;
    },
    curPath() {
      return this.curPage._value.path;
    },
    frontmatter() {
      return usePageFrontmatter();
    },

  },

  methods: {
    resolvePostDate(date) {
      return dayjs(date)
          .format(page._value.$themeConfig.dateFormat || 'ddd MMM DD YYYY')
    },

    resolvePostTags(tags) {
      if (!tags || Array.isArray(tags)) return tags
      return [tags]
    },
  },
}
</script>