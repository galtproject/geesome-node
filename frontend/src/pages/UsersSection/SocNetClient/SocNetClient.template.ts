module.exports = `
<div id="profile-page" class="container-page">
  <h3>Social Network Account</h3>
  
  <md-card v-if="account">
    <md-card-content>
      <div class="md-layout">
        <div class="md-layout-item md-size-20 md-small-size-100">
          <div class="properties">
            <div><label>Username:</label> <span>@{{account.username}}</span></div>
            <div><label>FullName:</label> <span>{{account.fullName}}</span></div>
		  </div>
		  
		  <div class="attention" v-if="incorrectSessionKey">
		  	<span>Looks like you lost keys to decrypt session. Please login again to continue working with this social network account.</span>
		  	<a href @click.prevent.stop="login()">Login to Social Network Account</a>
		  </div>
        </div>
        <div class="md-layout-item md-size-80 md-small-size-100">
			<div style="display: flex; justify-content: space-between;">
			  <h3>My channels</h3>
			</div>
	
	    	<md-checkbox v-model="onlyAdmined">Only admined</md-checkbox>

			<md-table>
			  <md-table-row>
				<md-table-head>Title</md-table-head>
				<md-table-head>Username</md-table-head>
				<md-table-head></md-table-head>
			  </md-table-row>
	
			  <md-table-row v-for="item in showChannels">
				<md-table-cell>{{item.title}}</md-table-cell>
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