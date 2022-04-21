module.exports = `
<posts-container :mode="'wide'">
  <div class="md-layout">
    <div class="md-layout-item md-size-50 md-xsmall-size-100">
      <md-card>
        <md-card-header>
          <div class="md-title">Accept invite</div>
        </md-card-header>
        
        <md-card-content>
		  <div>
			<div class="md-subhead">Your personal data</div>
			<md-field>
				<label>Username</label>
				<md-input v-model="user.name" :disabled="creation"></md-input>
			</md-field>
			
			<md-field>
				<label>Email(optional)</label>
				<md-input v-model="user.email" :disabled="creation"></md-input>
			</md-field>
			
			<md-field>
				<label>Key store method</label>
				<md-select v-model="user.keyStoreMethod" :disabled="true">
				  <md-option value="local">Local (in extension)</md-option>
				  <md-option value="node">In node</md-option>
				</md-select>
			</md-field>
			
			<md-switch v-model="passwordAuth">
				<span v-if="passwordAuth">Password auth</span>
				<span v-else>Auth by api key</span>
			</md-switch>
			
			<div v-if="passwordAuth">
				<md-field>
					<label>Password</label>
					<md-input v-model="user.password" type="password" :disabled="creation"></md-input>
				</md-field>
				
				<md-field>
					<label>Password confirm</label>
					<md-input v-model="user.passwordConfirm" type="password" :disabled="creation"></md-input>
				</md-field>
			</div>
			
			<div class="md-warn" style="margin-bottom: 10px;" v-else>
				You can share api key for simple authorization to node. You will receive api key after user creation.
			</div>
			
			<div class="md-layout">
			  <div class="md-layout-item md-size-70">
				<md-field>
					<label>Ethereum address for auth(optional)</label>
					<md-input v-model="user.ethereumAddress" :disabled="creation"></md-input>
				</md-field>
			  </div>
			  <div class="md-layout-item md-size-5"></div>
			  <div class="md-layout-item md-size-20">
				<md-button class="md-raised" @click="sign()" v-if="!user.ethereumSignature">
					Sign
				</md-button>
			  </div>
			</div>
		  </div>
		
		  <md-button class="md-raised md-accent" @click="register()" :disabled="creation || joinDisabled">
		    Register
		  </md-button>
		
		  <div style="margin-top: 20px" class="md-success" v-if="created">User successfully created!</div>
		  <div style="margin-top: 20px" class="md-success" v-if="resultApiKey">User api key:
			<pretty-hex :hex="resultApiKey" :full="true"></pretty-hex>
		  </div>
		
		  <div style="margin-top: 20px" class="md-error" v-if="error">Creation failed: {{error}}</div>
        </md-card-content>
      </md-card>
    </div>

    <div class="md-layout-item md-size-50 md-xsmall-size-100 faq-block">
      <p>You can join Geesome node for:</p>
      <ul class="new-group-features-list">
        <li>
          <md-icon class="fas fa-user-plus"></md-icon>
          <span>Create your own groups, make posts, upload and sharing content, etc.</span>
        </li>
        <li>
          <md-icon class="fas fa-robot"></md-icon>
          <span>Make bots for interaction via API: create groups, make posts, uploading and sharing content, etc.</span>
        </li>
        <li>
          <md-icon class="fas fa-hdd"></md-icon>
          <span>Backup posts with content from social networks channels and generate static blogs</span>
        </li>
      </ul>
    </div>
  </div>
</posts-container>
`;