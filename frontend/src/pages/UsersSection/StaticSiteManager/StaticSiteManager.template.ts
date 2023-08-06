module.exports = `
<div class="container-page static-site-manager" v-if="dbGroup">
  <router-link :to="{name: 'group-page', params: {groupId: dbGroup.staticStorageId}}" class="back">< Back to group</router-link>
  <h3>Static Site Manager for {{type | prettyName}}</h3>
  
  <md-card>
    <md-card-content>
      <div class="md-layout">
        <div class="md-layout-item md-size-30 md-small-size-100">
          <div class="properties">
            <div><label>Group title:</label> <span>{{dbGroup.title}}</span></div>
		  	<div><label>Group posts count:</label> <span>{{dbGroup.publishedPostsCount}}</span></div>
			<div v-if="siteInfo"><label>Link to site:</label> <pretty-hex :href="siteLink" :hex="siteInfo.staticId || siteInfo.storageId"></pretty-hex></div>
			<div v-if="siteInfo"><label>Storage id(IPFS):</label> <pretty-hex :hex="siteInfo.storageId"></pretty-hex></div>
			<div v-if="siteInfo"><label>Static id(IPNS):</label> <pretty-hex :hex="siteInfo.staticId"></pretty-hex></div>
		  </div>
		  
            <div v-if="siteInfo && socNetChannel">
                <md-button @click="setAutoGenerate()" class="md-raised md-accent">Auto import and generate</md-button>
            </div>
        </div>
        <div class="md-layout-item md-size-70 md-small-size-100">
			<div style="display: flex; justify-content: space-between;">
			  <h3>Generate Static Site</h3>
			</div>
			
			<div v-if="options">
				<md-field>
					<label>Site title</label>
					<md-input v-model="options.site.title"></md-input>
				</md-field>
				
				<md-field>
					<label>Site description</label>
					<md-textarea v-model="options.site.description"></md-textarea>
				</md-field>
				
				  <md-field>
					<label>View</label>
					<md-select v-model="options.view">
					  <md-option value="tumblr-like">Like in Tumblr</md-option>
					  <md-option value="youtube-like">Like in Youtube</md-option>
					</md-select>
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
				
				<div class="margin-bottom">
					<a href @click.stop.prevent="toggleAdvanced()">Advanced settings</a>
				</div>
				
				<div v-if="showAdvanced">
					<md-field>
						<label>Site name (IPNS)</label>
						<md-input v-model="options.site.name"></md-input>
					</md-field>
					
					<md-field>
						<label>Assets base URL</label>
						<md-input v-model="options.baseStorageUri"></md-input>
					</md-field>
				</div>
			
				<md-button :disabled="loading || !!curOperation" @click="runGenerate" class="md-raised md-accent"><span v-locale="localeKey + '.generate'"></span></md-button>
	
				<md-progress-bar class="md-accent" v-if="curOperation" md-mode="determinate" :md-value="percent"></md-progress-bar>
				
				<div style="margin-top: 20px" class="md-success" v-if="done">Static site successfully generated! Use link to site above.</div>
			</div>
        </div>
      </div>
    </md-card-content>
  </md-card>
</div>
`;