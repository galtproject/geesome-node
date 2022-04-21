module.exports = `
<div id="profile-page" class="container-page">
  <h3>User profile</h3>
  
  <md-card v-if="user">
    <md-card-content>
      <div class="md-layout">
        <div class="md-layout-item md-size-20 md-small-size-100 profile-image">
          <div v-if="user.avatarImage">
            <content-manifest-item :manifest="user.avatarImage.manifestStorageId" :preview-mode="true"></content-manifest-item>
          </div>
          <img v-else src="../../../../assets/empty-profile.png">
        </div>
        <div class="md-layout-item md-size-80 md-small-size-100">
          
          <div class="properties">
            <div><label>Username:</label> <span>@{{user.name}}</span></div>
            <div><label>FullName:</label> <span>{{user.title}}</span></div>
            <div><label>Email:</label> <span>{{user.email}}</span></div>
            <div><label>IPNS:</label> <pretty-hex :hex="user.manifestStaticStorageId"></pretty-hex></div>
            <div><label>IPLD:</label> <pretty-hex :hex="user.manifestStorageId"></pretty-hex></div>
            <div v-for="account in user.accounts"><label>{{account.provider}}:</label> {{account.address}}</div>
            <div v-if="permissions.length">
              <div><label>Permissions:</label> <span v-for="(p, i) in permissions">{{i ? ', ' : ''}}{{p.name}}</span></div>
            </div>
            <div v-if="saveContentLimit">
              <div><label>Content saving limit:</label> {{saveContentLimit.remained | prettySize}}/{{saveContentLimit.value | prettySize}} for {{saveContentLimit.periodTimestamp | prettyPeriod}}</div>
            </div>
            <div v-if="currentUserCanSetLimits">
              <md-button @click="setUserLimit" class="md-primary">
                <md-icon class="fas fa-pen"></md-icon>
                Change user limits
              </md-button>
            </div>
          </div>
          
          <div v-if="currentUser.id === user.id">
            <md-button :to="{name: 'current-user-profile-edit'}" class="md-primary">
              <md-icon class="fas fa-pen"></md-icon>
              Edit profile
            </md-button>
            
            <md-button :to="{name: 'current-user-password-edit'}" class="md-primary">
              <md-icon class="fas fa-pen"></md-icon>
              Edit password
            </md-button>
            
            <div style="display: flex; justify-content: space-between;">
              <h3>Social networks clients</h3>

              <md-button class="md-primary" @click="addSocNetClient">Add client</md-button>
            </div>

            <md-table>
              <md-table-row>
				<md-table-head>Account</md-table-head>
                <md-table-head>Social Network</md-table-head>
				<md-table-head></md-table-head>
              </md-table-row>

              <md-table-row v-for="item in socNetAccounts">
				<md-table-cell><router-link :to="{name: 'soc-net-client', params: {socNet: 'telegram', accId: item.id}}">{{item.fullName}}</router-link></md-table-cell>
                <md-table-cell>Telegram</md-table-cell>
                <md-table-cell>
                <md-button class="md-accent md-icon-button" @click="editApiKey(item)"><md-icon>sync</md-icon></md-button>
                </md-table-cell>
              </md-table-row>
            </md-table>
            
            <div style="display: flex; justify-content: space-between;">
              <h3>Api keys</h3>

              <md-button class="md-primary" @click="addApiKey">Add api key</md-button>
            </div>

            <md-table>
              <md-table-row>
                <md-table-head>Title</md-table-head>
                <md-table-head>Type</md-table-head>
                <md-table-head>Permissions</md-table-head>
                <md-table-head>Created at</md-table-head>
                <md-table-head>Expired on</md-table-head>
                <md-table-head></md-table-head>
              </md-table-row>

              <md-table-row v-for="item in apiKeys">
                <md-table-cell>{{item.title}}</md-table-cell>
                <md-table-cell>{{item.type}}</md-table-cell>
                <md-table-cell>{{item.permissions}}</md-table-cell>
                <md-table-cell>{{item.createdAt}}</md-table-cell>
                <md-table-cell>{{item.expiredOn}}</md-table-cell>
                <md-table-cell><md-button class="md-accent md-icon-button" @click="editApiKey(item)"><md-icon>edit</md-icon></md-button></md-table-cell>
              </md-table-row>
            </md-table>
          </div>
        </div>
      </div>
    </md-card-content>
  </md-card>
</div>
`;