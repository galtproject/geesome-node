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

    },
    computed: {
      image() {
          return this.imageList[this.imageIndex];
      }
    },
    methods: {
        close() {
            this.$root.$modal.close('text-modal');
        }
    }
}