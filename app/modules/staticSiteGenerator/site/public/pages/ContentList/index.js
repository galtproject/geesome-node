import EmptyLayout from "../EmptyLayout/index.js";
import {getRelativeRoot} from "../../helpers.js";

export default {
    components: {
        EmptyLayout,
    },
    inject: ['store'],
    created() {
      // console.log('post page', this.$route.params.postId);
    },
    computed: {
        contents() {
            return this.store.contents;
        },
        contentRoot() {
            return getRelativeRoot(this.$route.path) + 'content/';
        },
    },
    template: `
      <empty-layout>
      <template #page>
        <div class="content-list">
          <div v-for="c in contents" :class="['content-item', c.type]" :style='{"background-image": "url(" + contentRoot + c.storageId + ")"}'>
            <p v-if="c.type === 'text' && c.view === 'contents'" v-html="c.text"></p>
            <img v-if="c.type === 'image'" :src="contentRoot + c.storageId">
            <video v-if="c.type === 'video'" controls>
              <source :src="contentRoot + c.storageId + '.mp4'" type="video/mp4">
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </template>
      </empty-layout>
    `
}
