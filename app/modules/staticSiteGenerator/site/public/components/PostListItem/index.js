import {getRelativeRoot} from '../../helpers.js';

export default {
  name: 'post-list-item',
  props: ['post', 'store', 'type'],
  mixins: [],
  created() {
  },
  computed: {
    postImages() {
      return this.post.contents.filter(c => c.type === 'image');
    },
    postVideos() {
      return this.post.contents.filter(c => c.type === 'video');
    },
    postDate() {
      return new Date(this.post.date).toISOString().slice(0, 19).replace('T', ' ');
    },
    postPath() {
      return getRelativeRoot(this.$route.path) + 'post/' + this.post.id + '/';
    }
  },
  template: `
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
  
      <a :href="postPath" class="post-date">{{ postDate }}</a>
      <p v-if="post.itemTitle" class="post-intro title" v-html="post.itemTitle"></p>
      <p v-if="post.itemDescription" class="post-intro description" v-html="post.itemDescription"></p>
  
      <div v-if="postImages.length || postVideos.length">
        <!-- eslint-disable vue/no-v-html -->
        <div v-if="postImages.length">
          <img :src="postImages[0].url" class="post-image">
        </div>
        <div v-else-if="postVideos.length">
          <video controls>
            <source :src="postVideos[0].url + '.mp4'" type="video/mp4">
            Your browser does not support the video tag.
          </video>
        </div>
        <!-- eslint-enable vue/no-v-html -->
      </div>
  
      <post-list-item class="repost-of" v-if="post.repostOf" :post="post.repostOf" type="repost"></post-list-item>
    </article>
`
}