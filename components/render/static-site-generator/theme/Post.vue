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
<!--            <h1 class="post-title" itemprop="name headline">-->
<!--              {{ $frontmatter.title }}-->
<!--            </h1>-->
            <PostMeta
                :tags="$frontmatter.tags"
                :author="$frontmatter.author"
                :date="$frontmatter.date"
                :location="$frontmatter.location"
            />
          </header>
          <div class="post-page-content">
            <Content />

            <div v-if="$frontmatter.images && $frontmatter.images.length">
              <img v-for="img in $frontmatter.images" :src="img.url">
            </div>

            <div v-if="$frontmatter.videos && $frontmatter.videos.length">
              <video v-for="video in $frontmatter.videos" controls>
                <source :src="video.url + '.mp4'" type="video/mp4">
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
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
      return usePageFrontmatter()._value;
    },
  }
}
</script>