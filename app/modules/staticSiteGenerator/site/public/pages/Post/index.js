import Layout from "../Layout/index.js";

export default {
    components: {
        // Toc,
        // Comment,
        Layout,
        // Newsletter: () => import('@theme/components/Newsletter.vue'),
    },
    inject: ['store'],
    created() {
      // console.log('post page', this.$route.params.postId);
    },
    computed: {
        post() {
            return this.store.posts[this.store.indexById[this.$route.params.postId]];
        }
    },
    template: `
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
<!--              <PostMeta-->
<!--                  :tags="$frontmatter.tags"-->
<!--                  :author="$frontmatter.author"-->
<!--                  :date="$frontmatter.date"-->
<!--                  :location="$frontmatter.location"-->
<!--              />-->
            </header>
            <div class="post-page-content">
              <div v-for="c in post.contents">
                <p v-if="c.type === 'text' && c.view === 'contents'" v-html="c.text"></p>
                <img v-if="c.type === 'image'" :src="c.url">
                <video v-if="c.type === 'video'" controls>
                  <source :src="c.url + '.mp4'" type="video/mp4">
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
          </article>
          <!--        <Toc />-->
        </div>
      </template>
      </layout>
    `
}
