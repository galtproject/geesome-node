import CreatorSite from '../../creator/Site.js';
import ArchiveDownload from '../../components/ArchiveDownload/index.js';
export default {
    components: {
        ArchiveDownload,
        CreatorSite,
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
      <creator-site v-if="store.membership" />
      <template v-else>
      <div v-if="store.options.archive === true" class="archive-toolbar"><archive-download /></div>
      <div :class="['content-wrapper', view]">
        <div class="content-info">
          <div class="site-info">
            <div class="avatar-row">
              <div v-if="$site.avatarUrl" class="avatar"><img :src="$site.avatarUrl"></div>
              <div class="title">
                <div class="main-title">{{$site.title}}</div>
                <div class="sub-title">Posts: {{$site.postsCount}}</div>
              </div>
            </div>
            <div class="description-row">{{$site.description}}</div>
          </div>

          <div class="powered">Powered by <a href="https://github.com/galtproject/geesome-node" target="_blank">Geesome</a></div>
        </div>
        <main class="content-data" :data-site-entry="store.membership?.entryPath">
          <div class="tabs">
            <a :href="$site.base" target="_self">Latest posts</a>
          </div>
          <slot name="page"/>
        </main>
      </div>
      </template>
    `
}
