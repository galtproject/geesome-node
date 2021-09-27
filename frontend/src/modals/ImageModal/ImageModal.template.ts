module.exports = `
<modal-item class="large-modal">
  <template slot="header">
    <md-button class="md-icon-button close" @click="close">
      <md-icon>clear</md-icon>
    </md-button>
  </template>

  <div class="modal-body" slot="body">
    <img v-for="image in images" :src="image">
  </div>
</modal-item>
`;