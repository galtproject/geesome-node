module.exports = `
<modal-item class="large-modal">
  <template slot="header">
    <md-button class="md-icon-button close" @click="cancel">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title">Change Geesome node server</div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
    <p>
      You have connected to {{currentServerAddress}} Geesome node. To change node address - edit it and press ok.<br>
      Geesome node is used for get IPFS and IPLD content. Some Geesome nodes may give upload access without login, but
      another nodes - required login to upload content.
    </p>

    <md-field>
      <label>Geesome node</label>
      <md-input v-model="serverAddress"></md-input>
    </md-field>
  </div>

  <template slot="footer">
    <md-button @click="cancel" class="md-raised"><span>Cancel</span></md-button>
    <md-button @click="ok" class="md-raised md-accent" :disabled="!serverAddress">Ok</md-button>
  </template>
</modal-item>
`;