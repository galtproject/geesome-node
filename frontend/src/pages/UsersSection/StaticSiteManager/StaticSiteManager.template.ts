module.exports = `
<div id="profile-page" class="container-page" v-if="dbGroup">
  <router-link :to="{name: 'group-page', params: {groupId: dbGroup.staticStorageId}}" class="back">< Back to group</router-link>
  <h3>Static Site Manager for {{type | prettyName}}</h3>
  
  <md-card>
    <md-card-content>
      <div class="md-layout">
        <div class="md-layout-item md-size-20 md-small-size-100">
          <div class="properties">
            <div><label>Group title:</label> <span>{{dbGroup.title}}</span></div>
		  	<div><label>Group posts count:</label> <span>{{dbGroup.publishedPostsCount}}</span></div>
		  	<div v-if="staticSiteStorageId"><label>Link to site:</label> <a :href="siteLink" target="_blank"><pretty-hex :hex="staticSiteStorageId"></pretty-hex></a></div>
		  </div>
        </div>
        <div class="md-layout-item md-size-80 md-small-size-100">
			<div style="display: flex; justify-content: space-between;">
			  <h3>Generate Static Site</h3>
			</div>
			
			<md-field>
                <label>Site title</label>
                <md-input v-model="options.site.title"></md-input>
            </md-field>
			
			<md-field>
                <label>Site description</label>
                <md-textarea v-model="options.site.description"></md-textarea>
            </md-field>
            
			<md-field>
                <label>Post title preview length</label>
                <md-input v-model="options.post.titleLength" type="number"></md-input>
            </md-field>
            
			<md-field>
                <label>Post description preview length</label>
                <md-input v-model="options.post.descriptionLength" type="number"></md-input>
            </md-field>
            
			<md-field>
                <label>Posts per page</label>
                <md-input v-model="options.postList.postsPerPage" type="number"></md-input>
            </md-field>
		
			<md-button :disabled="loading || !!curOperation" @click="runGenerate" class="md-raised md-accent"><span v-locale="localeKey + '.generate'"></span></md-button>

			<md-progress-bar class="md-accent" v-if="curOperation" md-mode="determinate" :md-value="percent"></md-progress-bar>
        </div>
      </div>
    </md-card-content>
  </md-card>
</div>
`;