<template>
  <article
      :key="post.key"
      class="ui-post"
      itemprop="blogPost"
      itemscope
      itemtype="https://schema.org/BlogPosting"
  >
    <div v-if="type === 'repost'">
      Repost of @{{post.group.title}}
    </div>

    <meta v-if="post.path" itemprop="mainEntityOfPage" :content="post.path" />
    <router-link v-if="post.path" :to="post.path" class="post-date">{{ postDate }}</router-link>
    <span v-else class="post-date">{{ postDate }}</span>

    <p v-if="post.postTitle" class="post-intro title" v-html="post.postTitle"></p>
    <p v-if="post.postDescription" class="post-intro description" v-html="post.postDescription"></p>

    <div v-if="post.images || post.videos">
      <!-- eslint-disable vue/no-v-html -->
      <div v-if="post.images && post.images.length">
        <img :src="post.images[0].url" class="post-image">
      </div>

      <div v-if="post.videos && post.videos.length">
        <video controls>
          <source :src="post.videos[0].url + '.mp4'" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      </div>
      <!-- eslint-enable vue/no-v-html -->
    </div>

    <post-list-item class="repost-of" v-if="post.repostOf" :post="post.repostOf" type="repost"></post-list-item>
  </article>

</template>

<script>
import dayjs from "dayjs";
import {usePageData} from "@vuepress/client";
const page = usePageData();

export default {
  props: ['post', 'type'],
  computed: {
    curPage() {
      return page._value;
    },
    postDate() {
      return dayjs(this.post.date)
          .format(this.curPage.$themeConfig.dateFormat || 'ddd MMM DD YYYY')
    },
  }
}
</script>