import EmptyLayout from "../EmptyLayout/index.js";
import {getRelativeRoot} from "../../helpers.js";
import ImageModal from "../../components/ImageModal/ImageModal.js";

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
    methods: {
      openMedia(imageIndex) {
          console.log('openMedia', imageIndex);
          this.$root.$modal.open({
              id: 'image-modal',
              component: ImageModal,
              closeOnBackdrop: true,
              props: {
                  imageList: this.contents.map(c => this.contentRoot + c.storageId),
                  imageIndex,
              }
          });
      }
    },
    template: `
      <empty-layout>
      <template #page>
        <div class="content-list">
          <div 
              v-for="(c, index) in contents" 
              :class="['content-item', c.type]" 
              :style='{"background-image": "url(" + contentRoot + c.storageId + ")"}'
              @click="openMedia(index)"
          >
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
