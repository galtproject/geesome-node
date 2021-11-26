module.exports = `
<modal-item>
  <template slot="header">
    <md-button class="md-icon-button close" @click="close">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title">Login and add social network client</div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
    <p>Social network clients in Geesome allows you to backup your content for using in Geesome groups or static sites.</p>

    <p>Please, enter your social network data only if you trust this Geesome node, or if it's your personal secured node.</p>
    
    <p>Visit <a href="https://my.telegram.org/" target="_blank">Telegram Client cabinet</a> for register app and get </p>

	<md-field>
		<label>Type</label>
		<md-select v-model="socnet">
			<md-option value="telegram">Telegram</md-option>
		</md-select>
	</md-field>
  
    <md-field>
      <label>App id</label>
      <md-input v-model="apiId"></md-input>
    </md-field>
  
    <md-field>
      <label>App hash</label>
      <md-input v-model="apiHash" type="password"></md-input>
    </md-field>
  
    <md-field>
      <label>Phone</label>
      <md-input v-model="phoneNumber"></md-input>
    </md-field>
    
	<md-checkbox v-model="isEncrypted">Encrypt session key (will disable background jobs)</md-checkbox>

    <md-field v-if="phoneCodeRequired">
      <label>Phone code</label>
      <md-input v-model="phoneCode"></md-input>
    </md-field>
  
    <md-field v-if="passwordRequired">
      <label>Password</label>
      <md-input v-model="password" type="password"></md-input>
    </md-field>

    <div style="margin-top: 20px" class="md-warn" v-if="phoneCodeRequired || passwordRequired">
      {{passwordRequired ? 'Password' : 'Phone code'}} required! Please enter and try login again.
    </div>
  </div>

  <template slot="footer">
    <md-button @click="close" class="md-raised"><span>Close</span></md-button>
    <md-button @click="login" class="md-raised md-accent" :disabled="loginDisabled">Login</md-button>
  </template>
</modal-item>
`;