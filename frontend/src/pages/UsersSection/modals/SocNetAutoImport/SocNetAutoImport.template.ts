module.exports = `
<modal-item>
  <template slot="header">
    <md-button class="md-icon-button close" @click="cancel">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title">Auto Import Channel Setting</div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
    <p>For auto import will used unencrypted social network session key and Geesome session token stored in database.</p>

	<period-input :locale-label="localeKey + '.period'" v-model="channel.autoImportPeriod"
				  :disabled="saving"></period-input>

    <md-field>
      <label>Geesome token</label>
      <md-input type="password" v-model="channel.autoImportToken"></md-input>
    </md-field>

    <md-checkbox v-model="isDisabled" @change="onDisabled">Disable</md-checkbox>
  </div>

  <template slot="footer">
    <md-button @click="cancel" class="md-raised"><span>Close</span></md-button>
    <md-button @click="ok" class="md-raised md-accent" :disabled="!apiKey.type" v-if="!resultApiKey">Ok</md-button>
  </template>
</modal-item>
`;