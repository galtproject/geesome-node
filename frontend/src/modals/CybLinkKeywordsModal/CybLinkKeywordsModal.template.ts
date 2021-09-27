module.exports = `
<modal-item>
  <template slot="header">
    <md-button class="md-icon-button close" @click="cancel">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title">Link Content by Keywords</div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
    <p class="grey-description">Enter the keywords separated by commas in the box below. A transaction will be generated
      for the linking of the post address and the entered keywords. After signing a transaction in the CYB extension, it
      will be sent to the CYBER blockchain and the post will appear in the search results.</p>

    <md-field>
      <label>Keywords separated by comma</label>
      <md-input v-model="keywordsStr"></md-input>
    </md-field>

    <p class="grey-description">E.g. hello, world, blockchain, cosmos</p>

    <div class="md-success" v-if="showCybPopupAttention">Please open Cyb extension for continue operation.</div>
  </div>

  <template slot="footer">
    <md-button @click="cancel" class="md-raised"><span>Close</span></md-button>
    <md-button @click="ok" class="md-raised md-accent" :disabled="showCybPopupAttention">Link</md-button>
  </template>
</modal-item>
`;