module.exports = `
<modal-item>
  <template slot="header">
    <md-button class="md-icon-button close" @click="close">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title">Auto Import Channel Setting</div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
    <p>Auto import data will be encrypted by GeeSome node key and stored to GeeSome node database.</p>

	<period-input :locale-label="localeKey + '.period'" v-model="runPeriod" :disabled="saving"></period-input>

    <md-field>
      <label>GeeSome API token</label>
      <md-input type="password" v-model="apiToken"></md-input>
    </md-field>

    <md-checkbox v-model="isDisabled" @change="onDisabled">Disable</md-checkbox>
  </div>

  <template slot="footer">
    <md-button @click="close" class="md-raised"><span>Close</span></md-button>
    <md-button @click="ok" class="md-raised md-accent" :disabled="!apiToken || saving">Ok</md-button>
  </template>
</modal-item>
`;