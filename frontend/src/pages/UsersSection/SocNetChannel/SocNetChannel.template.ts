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
		    <div><label>Channel messages count:</label> <span>{{info.messagesCount}}</span></div>
		  	<div v-if="dbGroup"><label>Result posts count:</label> <span>{{dbGroup.publishedPostsCount}}</span></div>
		  	<div v-if="dbGroup"><router-link :to="{name: 'group-page', params: {groupId: dbGroup.staticStorageId}}">Group page</router-link></div>
		  </div>
        </div>
        <div class="md-layout-item md-size-80 md-small-size-100">
			<div style="display: flex; justify-content: space-between;">
			  <h3>Import channel to IPFS</h3>
			</div>
			
			<div style="position: relative;">
				<md-button :disabled="loading || !!curOperation" @click="runImport" class="md-raised md-accent"><span v-locale="localeKey + '.run_import'"></span></md-button>
				<md-button style="position: absolute; top: 0; right: 0;" v-if="curOperation" @click="stopImport" class="md-warn"><span v-locale="localeKey + '.stop_import'"></span></md-button>
			</div>
			
			<md-progress-bar class="md-accent" v-if="curOperation" md-mode="determinate" :md-value="percent"></md-progress-bar>

			<div style="display: flex; justify-content: space-between;">
			  <h3>Generate static site and upload to IPFS</h3>
			</div>
			
			<div>
				<md-button :disabled="loading || !!curOperation || !dbGroup" :to="{name: 'static-site-manager', params: {type: 'group', id: dbGroup && dbGroup.id}}" class="md-raised md-accent"><span v-locale="localeKey + '.static_site_manager'"></span></md-button>
			</div>

<!--			<md-table>-->
<!--			  <md-table-row>-->
<!--				<md-table-head>Title</md-table-head>-->
<!--				<md-table-head></md-table-head>-->
<!--			  </md-table-row>-->
<!--	-->
<!--			  <md-table-row v-for="item in posts">-->
<!--				<md-table-cell>{{item.title}}</md-table-cell>-->
<!--				<md-table-cell>-->
<!--&lt;!&ndash;				<md-button class="md-accent md-icon-button" @click="editApiKey(item)"><md-icon>sync</md-icon></md-button>&ndash;&gt;-->
<!--				</md-table-cell>-->
<!--			  </md-table-row>-->
<!--			</md-table>-->
        </div>
      </div>
    </md-card-content>
  </md-card>
</div>
`;