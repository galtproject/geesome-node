module.exports = `
<modal-item>
  <template slot="header">
    <md-button class="md-icon-button close" @click="close()">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title">Add User</div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
	<md-field>
	  <label>Telegram User Id</label>
	  <md-input v-model="contentBot.userTgId"></md-input>
	</md-field>
  </div>
  <div class="modal-body" slot="body">
	<md-field>
		  <label>Content Limits, (mb)</label>
		  <md-input v-model="contentBot.contentLimit" type="number"></md-input>
		</md-field>
  </div>
  <div class="modal-body" slot="body">
		<md-checkbox v-model="contentBot.isAdmin"">Admin user</md-checkbox>
	</div>
      

  

  <template slot="footer">
    <md-button @click="close()" class="md-raised"><span>Close</span></md-button>
    <md-button @click="add()" class="md-raised md-accent" :disabled="!contentBot.userTgId">Add</md-button>
  </template>
</modal-item>
`;