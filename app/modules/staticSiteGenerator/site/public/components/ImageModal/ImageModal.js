import {ModalItem} from "../AsyncModal/index.js";

export default {
    template: `
      <modal-item class="large-modal">
        <template slot="header">
          <button class="md-icon-button close" @click="close">x</button>
        </template>

        <div class="modal-body" slot="body">
          <img :src="image"/>
        </div>
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
                if (this.imageList[this.localImageIndex + 1]) {
                    this.localImageIndex += 1;
                } else {
                    this.localImageIndex = 0;
                }
            } else if (event.key === 'ArrowLeft') {
                if (this.imageList[this.localImageIndex - 1]) {
                    this.localImageIndex -= 1;
                } else {
                    this.localImageIndex = this.imageList.length - 1;
                }
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
        close() {
            this.$root.$modal.close('image-modal');
        }
    },
    data: () => ({
        localImageIndex: null,
    }),
}