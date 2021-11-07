<template>
  <layout>
    <template #page>
      <div id="vuepress-theme-blog__post-layout">
        <article
            class="wrapper vuepress-blog-theme-content"
            itemscope
            itemtype="https://schema.org/BlogPosting"
        >
          <header>
            <h1 class="post-title" itemprop="name headline">
              {{ $frontmatter.title }}
            </h1>
            <PostMeta
                :tags="$frontmatter.tags"
                :author="$frontmatter.author"
                :date="$frontmatter.date"
                :location="$frontmatter.location"
            />
          </header>
          <Content />
<!--          <footer>-->
<!--            <Newsletter v-if="$service.email.enabled" />-->
<!--            <hr />-->
<!--            <Comment />-->
<!--          </footer>-->
        </article>
<!--        <Toc />-->
      </div>
    </template>
  </layout>
</template>

<script>
// import Toc from '../Toc.vue'
import PostMeta from './components/PostMeta.vue'
// import { Comment } from '@vuepress/plugin-blog/lib/client/components'

import {usePageData, usePageFrontmatter} from "@vuepress/client";
import Layout from "./Layout";
const page = usePageData();

export default {
  components: {
    // Toc,
    PostMeta,
    // Comment,
    Layout,
    // Newsletter: () => import('@theme/components/Newsletter.vue'),
  },
  computed: {
    $page() {
      return page;
    },
    $frontmatter() {
      return usePageFrontmatter();
    },
  }
}
</script>