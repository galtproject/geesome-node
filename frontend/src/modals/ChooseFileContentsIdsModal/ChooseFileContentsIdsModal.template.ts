module.exports = `
<modal-item class="large-modal">
  <template slot="header">
    <md-button class="md-icon-button close" @click="cancel">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title" v-locale="localeKey + '.title'"></div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
    <md-tabs @md-changed="tabChanged">
      <md-tab id="upload" md-label="Upload">
        <upload-content @uploaded="fileUploaded" :hide-methods="['enter_text', 'choose_uploaded']"></upload-content>
      </md-tab>
      <md-tab id="file-catalog" md-label="Choose uploaded">
        <file-catalog :select-mode="true" :selected-ids.sync="fileCatalogItemsIds"
                      :hide-methods="['enter_text', 'choose_uploaded']"></file-catalog>
      </md-tab>
    </md-tabs>
  </div>

  <template slot="footer">
    <md-button @click="cancel" class="md-raised"><span v-locale="localeKey + '.cancel'"></span></md-button>
    <md-button @click="ok" class="md-raised md-accent" :disabled="!fileCatalogItemsIds.length"><span
        v-locale="localeKey + '.ok'"></span></md-button>
  </template>
</modal-item>
`;