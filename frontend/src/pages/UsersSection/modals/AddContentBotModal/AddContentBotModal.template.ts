module.exports = `
<modal-item>
  <template slot="header">
    <md-button class="md-icon-button close" @click="close()">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title">Add Content Bot</div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
	<md-field>
		<label>Social Network</label>
		<md-select v-model="contentBot.socNet">
		  <md-option value="telegram">Telegram</md-option>
		</md-select>
	</md-field>
	  
	<md-field>
	  <label>Telegram Bot Token</label>
	  <md-input v-model="contentBot.tgToken"></md-input>
	</md-field>
  </div>

  <template slot="footer">
    <md-button @click="close()" class="md-raised"><span>Close</span></md-button>
    <md-button @click="ok" class="md-raised md-accent" :disabled="!contentBot.tgToken">Create</md-button>
  </template>
</modal-item>
`;