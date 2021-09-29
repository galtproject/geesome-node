module.exports = `
<modal-item class="large-modal">
  <template slot="header">
    <md-button class="md-icon-button close" @click="cancel">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title">Add IPFS Boot Node</div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
    <!--<p></p>-->

    <md-field>
      <label>Boot Node Address</label>
      <md-input v-model="nodeAddress"></md-input>
    </md-field>
  </div>

  <template slot="footer">
    <md-button @click="cancel" class="md-raised"><span>Cancel</span></md-button>
    <md-button @click="ok" class="md-raised md-accent" :disabled="!nodeAddress">Ok</md-button>
  </template>
</modal-item>
`;