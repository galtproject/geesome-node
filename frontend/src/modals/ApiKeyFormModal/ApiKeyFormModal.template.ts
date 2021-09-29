module.exports = `
<modal-item>
  <template slot="header">
    <md-button class="md-icon-button close" @click="cancel">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title">{{apiKey.id ? "Edit" : "Add"}} Api Key</div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
    <p>Api key is used to give your storage access to anyone or anything who have that key. You can copy that key only one: after creation. Keys don't storing in database, only hashes of it.</p>

    <md-field>
      <label>Title</label>
      <md-input v-model="apiKey.title"></md-input>
    </md-field>

    <md-field>
      <label>Type</label>
      <md-input v-model="apiKey.type"></md-input>
    </md-field>

    <md-checkbox v-if="apiKey.id" v-model="apiKey.isDisabled">Disable</md-checkbox>

    <div style="margin-top: 20px" class="md-success" v-if="resultApiKey">
      Successful created! Please copy your key:
      <pretty-hex :hex="resultApiKey" :full="true"></pretty-hex>
    </div>
  </div>

  <template slot="footer">
    <md-button @click="cancel" class="md-raised"><span>Close</span></md-button>
    <md-button @click="ok" class="md-raised md-accent" :disabled="!apiKey.type" v-if="!resultApiKey">Ok</md-button>
  </template>
</modal-item>
`;