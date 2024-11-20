import {ModalItem} from "../AsyncModal/index.js";

export default {
    template: `
      <modal-item class="large-modal image-modal">
        <template slot="header">
          <button class="md-icon-button close" @click="close">✖</button>
        </template>

        <template slot="body">
          <div class="arrow-left" @click.prevent.stop="left"><div>▲</div></div>
          <img :src="image"/>
          <div class="arrow-right" @click.prevent.stop="right"><div>▲</div></div>
        </template>
      </modal-item>`,
    props: ['imageList', 'imageIndex'],
    components: {
        ModalItem,
    },
    created() {
        this.localImageIndex = this.imageIndex;
    },
    mounted() {
        this.listener = (event) => {
            if (event.key === 'ArrowRight') {
                this.right();
            } else if (event.key === 'ArrowLeft') {
                this.left();
            }
        }
        document.addEventListener("keydown", this.listener);
    },
    beforeUnmount() {
        document.removeEventListener("keydown", this.listener);
    },
    computed: {
      image() {
          return this.imageList[this.localImageIndex];
      }
    },
    methods: {
        left() {
            if (this.imageList[this.localImageIndex - 1]) {
                this.localImageIndex -= 1;
            } else {
                this.localImageIndex = this.imageList.length - 1;
            }
        },
        right() {
            if (this.imageList[this.localImageIndex + 1]) {
                this.localImageIndex += 1;
            } else {
                this.localImageIndex = 0;
            }
        },
        close() {
            this.$root.$modal.close('image-modal');
        }
    },
    data: () => ({
        localImageIndex: null,
    }),
}