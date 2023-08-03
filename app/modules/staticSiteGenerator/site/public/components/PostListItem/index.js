export default {
  name: 'post-list-item',
  props: ['post', 'store', 'type'],
  mixins: [],
  computed: {
    postDate() {
      return new Date(this.post.date).toISOString().slice(0, 19).replace('T', ' ');
    },
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

    <meta v-if="post.path" itemprop="mainEntityOfPage" :content="post.path" />
    <router-link v-if="post.path" :to="post.path" class="post-date">{{ postDate }}</router-link>
    <span v-else class="post-date">{{ postDate }}</span>

    <p v-if="post.itemTitle" class="post-intro title" v-html="post.itemTitle"></p>
    <p v-if="post.itemDescription" class="post-intro description" v-html="post.itemDescription"></p>

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
`
}