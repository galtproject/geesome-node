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
    
    <p v-if="socNet === 'telegram'">Visit <a href="https://my.telegram.org/" target="_blank">Telegram Client cabinet</a> to register app and get app id and app hash.</p>
    <p v-if="socNet === 'twitter'">Visit <a href="https://developer.twitter.com/en/apply-for-access" target="_blank">Twitter Api cabinet</a> to register as developer and get api token.</p>

	<md-field>
		<label>Social Network</label>
		<md-select v-model="socNet">
			<md-option value="telegram">Telegram</md-option>
			<md-option value="twitter">Twitter</md-option>
		</md-select>
	</md-field>
	
	<div v-if="socNet === 'twitter'">
		<md-field>
		  <label>App key</label>
		  <md-input v-model="inputs.apiId" name="api_id"></md-input>
		</md-field>
		
		<md-field>
		  <label>App secret</label>
		  <md-input v-model="inputs.apiKey" name="api_key"></md-input>
		</md-field>
		
		<md-field>
		  <label>Access token</label>
		  <md-input v-model="inputs.accessToken" name="access_token"></md-input>
		</md-field>
		
		<md-field>
		  <label>Access secret</label>
		  <md-input v-model="inputs.sessionKey" name="access_secret"></md-input>
		</md-field>
	</div>
  
  	<div v-if="socNet === 'telegram'">
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
	</div>
    
	<md-checkbox v-model="inputs.isEncrypted" class="md-primary">Encrypt session key with api token</md-checkbox>
  </div>

  <template slot="footer">
    <md-button @click="close" class="md-raised"><span>Close</span></md-button>
    <md-button @click="login" class="md-raised md-accent" :disabled="loginDisabled || loading">Login</md-button>
  </template>
</modal-item>
`;