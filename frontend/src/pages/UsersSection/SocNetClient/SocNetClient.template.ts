module.exports = `
<div id="profile-page" class="container-page">
  <router-link :to="{name: 'current-user-profile'}" class="back">< Back</router-link>
  <h3>Social Network Account</h3>
  
  <md-card v-if="account">
    <md-card-content>
      <div class="md-layout">
        <div class="md-layout-item md-size-20 md-small-size-100">
          <div class="properties">
            <div><label>Username:</label> <span>@{{account.username}}</span></div>
            <div><label>FullName:</label> <span>{{account.fullName}}</span></div>
		    <div><label>Social network:</label> <span>{{socNet | prettyName}}</span></div>
		  </div>
        </div>
        <div class="md-layout-item md-size-80 md-small-size-100">
		  <div class="attention" v-if="incorrectSessionKey">
		  	<span>Looks like you lost keys to decrypt session. Please login again to continue working with this social network account.</span><br>
		  	<a href @click.prevent.stop="login()">Login to Social Network Account</a>
		  </div>
		  
			<div style="display: flex; justify-content: space-between;">
			  <h3>Channels list</h3>
			</div>
	
	    	<md-checkbox v-if="socNet === 'telegram'" v-model="onlyAdmined">Only admined</md-checkbox>

			<md-table>
			  <md-table-row>
				<md-table-head>Title</md-table-head>
				<md-table-head>Username</md-table-head>
				<md-table-head></md-table-head>
			  </md-table-row>
	
			  <md-table-row v-for="item in showChannels">
				<md-table-cell><router-link :to="{name: 'soc-net-channel', params: {channelId: item.id}}">{{item.title || item.name}}</router-link></md-table-cell>
				<md-table-cell>{{item.username}}</md-table-cell>
				<md-table-cell>
<!--				<md-button class="md-accent md-icon-button" @click="editApiKey(item)"><md-icon>sync</md-icon></md-button>-->
				</md-table-cell>
			  </md-table-row>
			</md-table>
        </div>
      </div>
    </md-card-content>
  </md-card>
</div>
`;