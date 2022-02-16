<template>
  <div class="post-meta">
    <div
        v-if="author"
        class="post-meta-author"
        itemprop="publisher author"
        itemtype="http://schema.org/Person"
        itemscope
    >
      <span itemprop="name">{{ author }}</span>
      <span v-if="location" itemprop="address"> &nbsp; in {{ location }}</span>
    </div>
    <div v-if="date" class="post-meta-date">
      <router-link :to="page.path" class="post-date">{{ resolvedDate }}</router-link>
    </div>
    <ul v-if="tags" class="post-meta-tags" itemprop="keywords">
      <PostTag v-for="tag in resolvedTags" :key="tag" :tag="tag" />
    </ul>
  </div>
</template>

<script>
import {usePageData} from "@vuepress/client";
const page = usePageData();

import dayjs from 'dayjs'
import dayjsPluginUTC from 'dayjs/plugin/utc'
// import { NavigationIcon, ClockIcon } from 'vue-feather-icons'
import PostTag from './PostTag.vue'

dayjs.extend(dayjsPluginUTC)

export default {
  name: 'PostMeta',
  components: { PostTag },
  props: {
    tags: {
      type: [Array, String],
    },
    author: {
      type: String,
    },
    date: {
      type: [Number, String],
    },
    location: {
      type: String,
    },
  },
  computed: {
    resolvedDate() {
      return dayjs(this.page.frontmatter.date)
          .format(this.$themeConfig.dateFormat || 'ddd MMM DD YYYY')
    },
    resolvedTags() {
      if (!this.tags || Array.isArray(this.tags)) return this.tags
      return [this.tags]
    },
    $themeConfig() {
      return page._value.$themeConfig;
    },
    page() {
      return page._value;
    }
  },
}
</script>