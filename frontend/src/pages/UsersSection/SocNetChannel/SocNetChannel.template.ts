module.exports = `
<div id="profile-page" class="container-page">
  <router-link :to="{name: 'current-user-profile'}" class="back">< Back</router-link>
  <h3>Social Network Channel</h3>
  
  <md-card v-if="info">
    <md-card-content>
      <div class="md-layout">
        <div class="md-layout-item md-size-20 md-small-size-100">
          <div class="properties">
            <div><label>Title:</label> <span>{{info.title}}</span></div>
            <div v-if="info.username"><label>Username:</label> <span>@{{info.username}}</span></div>
		    <div><label>Posts count:</label> <span>{{info.messagesCount}}</span></div>
		  	<div><label>Imported posts count:</label> <span>{{totalPostsCount}}</span></div>
		  </div>
        </div>
        <div class="md-layout-item md-size-80 md-small-size-100">
			<div style="display: flex; justify-content: space-between;">
			  <h3>Imported channel posts</h3>
			</div>
			
			<md-button @click="runImport" class="md-raised md-accent"><span v-locale="localeKey + '.run_import'"></span></md-button>

			<md-table>
			  <md-table-row>
				<md-table-head>Title</md-table-head>
				<md-table-head></md-table-head>
			  </md-table-row>
	
			  <md-table-row v-for="item in posts">
				<md-table-cell>{{item.title}}</md-table-cell>
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