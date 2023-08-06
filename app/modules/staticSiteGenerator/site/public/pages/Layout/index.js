export default {
    components: {
    },
    inject: ['store'],
    computed: {
        $site() {
            return this.store.options.site;
        },
        view() {
            return this.store.options.view;
        },
    },
    mounted() {
    },
    template: `
      <div :class="['content-wrapper', view]">
        <div class="content-info">
          <div class="site-info">
            <div class="avatar-row">
              <div class="avatar"><img :src="$site.avatarUrl"></div>
              <div class="title">
                <div class="main-title">{{$site.title}}</div>
                <div class="sub-title">Posts: {{$site.postsCount}}</div>
              </div>
            </div>
            <div class="description-row">{{$site.description}}</div>
          </div>

          <div class="powered">Powered by <a href="https://github.com/galtproject/geesome-node" target="_blank">Geesome</a></div>
        </div>
        <div class="content-data">
          <div class="tabs">
            <a :href="$site.base" target="_self">Latest posts</a>
          </div>
          <slot name="page"/>
        </div>
      </div>
      <!--    <Footer />-->
    `
}
