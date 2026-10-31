import EmptyLayout from "../EmptyLayout/index.js";
import {getRelativeRoot} from "../../helpers.js";
import ImageModal from "../../components/ImageModal/ImageModal.js";
import { markRaw } from "vue";
import {createGalleryImageLoader} from "./imageLoader.js";

export default {
    components: {
        EmptyLayout,
    },
    inject: ['store'],
    data: () => ({previewSources: {}, previewErrors: {}}),
    mounted() {
        const items = this.contents.map((content, index) => ({
            preview: content.previewStorageId ?
                this.previewRoot + (index + 1) + '_' + content.previewStorageId + '.' + (content.previewExtension || content.extension) :
                (content.type === 'image' ? this.originalUrl(content, index) : null),
            original: content.type === 'image' ? this.originalUrl(content, index) : null,
        }));
        const loader = createGalleryImageLoader(items, (index, url) => {
            this.previewSources[index] = url;
            delete this.previewErrors[index];
        }, index => {
            this.previewErrors[index] = true;
        });
        this.retryPreview = index => {
            delete this.previewErrors[index];
            loader.retry(index);
        };
        const cards = [...this.$refs.gallery.querySelectorAll('[data-gallery-index]')]
            .filter(card => items[Number(card.dataset.galleryIndex)].preview);
        if ('IntersectionObserver' in window) {
            const visible = new Set();
            const observer = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    const index = Number(entry.target.dataset.galleryIndex);
                    if (entry.isIntersecting) {
                        visible.add(index);
                    } else {
                        visible.delete(index);
                    }
                }
                loader.setVisible(visible);
            });
            cards.forEach(card => observer.observe(card));
            this.stopLoading = () => {
                observer.disconnect();
                loader.dispose();
            };
        } else {
            const update = () => loader.setVisible(cards.filter(card => {
                const bounds = card.getBoundingClientRect();
                return bounds.bottom > 0 && bounds.top < window.innerHeight &&
                    bounds.right > 0 && bounds.left < window.innerWidth;
            }).map(card => Number(card.dataset.galleryIndex)));
            window.addEventListener('scroll', update, true);
            window.addEventListener('resize', update);
            update();
            this.stopLoading = () => {
                window.removeEventListener('scroll', update, true);
                window.removeEventListener('resize', update);
                loader.dispose();
            };
        }
    },
    beforeUnmount() {
        this.stopLoading?.();
    },
    computed: {
        contents() {
            return this.store.contents;
        },
        contentRoot() {
            return getRelativeRoot(this.$route.path) + 'content/';
        },
        previewRoot() {
            return getRelativeRoot(this.$route.path) + 'preview/';
        },
    },
    methods: {
      originalUrl(content, index) {
          return this.contentRoot + (index + 1) + '_' + content.storageId + '.' + content.extension;
      },
      openMedia(imageIndex) {
          this.$root.$modal.open({
              id: 'image-modal',
              component: markRaw(ImageModal),
              closeOnBackdrop: true,
              props: {
                  imageList: this.contents.map((content, index) => this.originalUrl(content, index)),
                  imageIndex,
              }
          });
      }
    },
    template: `
      <empty-layout>
      <template #page>
        <div class="content-list" ref="gallery">
          <div 
              v-for="(c, index) in contents" 
              :class="['content-item', c.type]"
              :key="index"
              :data-gallery-index="index"
              data-testid="gallery-card"
              :style="previewSources[index] ? {'background-image': 'url(' + previewSources[index] + ')'} : {}"
              @click="openMedia(index)"
          >
            <p v-if="c.type === 'text' && c.view === 'contents'" v-html="c.text"></p>
            <img :alt="c.name" v-if="c.type === 'image'" :src="previewSources[index]"/>
            <div v-if="previewErrors[index]" class="gallery-image-error" role="status" @click.stop>
              <span>Image could not load.</span>
              <button type="button" data-testid="gallery-retry-image" @click.stop="retryPreview(index)">Retry image</button>
            </div>
            <video v-if="c.type === 'video'" controls preload="none">
              <source :src="contentRoot + (index + 1).toString() + '_' + c.storageId + '.' + c.extension" type="video/mp4"/>
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </template>
      </empty-layout>
    `
}
