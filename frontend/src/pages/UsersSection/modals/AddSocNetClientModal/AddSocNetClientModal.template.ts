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
    
    <p>Visit <a href="https://my.telegram.org/" target="_blank">Telegram Client cabinet</a> to register app and get app id and app hash.</p>

	<md-field>
		<label>Social Network</label>
		<md-select v-model="socNet">
			<md-option value="telegram">Telegram</md-option>
			<md-option value="twitter">Twitter</md-option>
		</md-select>
	</md-field>
  
    <md-field>
      <label>App id</label>
      <md-input v-model="inputs.apiId" name="api_id"></md-input>
    </md-field>
  
    <md-field>
      <label>App hash</label>
      <md-input v-model="inputs.apiKey" name="api_key" type="password"></md-input>
    </md-field>
  
   <md-switch v-model="inputs.byQrCode" class="md-primary">Login by QR code</md-switch>
   
	<div v-if="inputs.byQrCode">
		<div v-if="passwordRequired">
			<md-field >
			  <label>Password</label>
			  <md-input v-model="inputs.password" type="password"></md-input>
			</md-field>
			
			<div style="margin-top: 20px" class="md-warn">
			  Password required! Please enter and login.
			</div>
		</div>
		
		<div v-else>
<!--			<md-button class="md-raised" @click="getQrCode" :disabled="!inputs.apiId || !inputs.apiKey">Show QR code</md-button>-->
			<img ref="qrimage">
			<div>
				<md-field>
				  <label>Password</label>
				  <md-input v-model="inputs.password" type="password"></md-input>
				</md-field>
			</div>
<!--			<md-button class="md-raised" @click="login" :disabled="inputs.stage !== 2">Confirm scanned</md-button>-->
		</div>
	</div>
   	<div v-else>
		<md-field>
		  <label>Phone</label>
		  <md-input v-model="inputs.phoneNumber"></md-input>
		</md-field>
		
		<md-field v-if="phoneCodeRequired">
		  <label>Phone code</label>
		  <md-input v-model="inputs.phoneCode"></md-input>
		</md-field>
	  
		<md-field v-if="passwordRequired">
		  <label>Password</label>
		  <md-input v-model="inputs.password" type="password"></md-input>
		</md-field>
	
		<div style="margin-top: 20px" class="md-warn" v-if="phoneCodeRequired || passwordRequired">
		  {{passwordRequired ? 'Password' : 'Phone code'}} required! Please enter and try login again.
		</div>
		
		<md-checkbox v-model="inputs.forceSMS">Force SMS</md-checkbox>
	</div>
    
	<md-checkbox v-model="inputs.isEncrypted" class="md-primary">Encrypt session key with api token</md-checkbox>
  </div>

  <template slot="footer">
    <md-button @click="close" class="md-raised"><span>Close</span></md-button>
    <md-button @click="login" class="md-raised md-accent" :disabled="loginDisabled || loading">Login</md-button>
  </template>
</modal-item>
`;