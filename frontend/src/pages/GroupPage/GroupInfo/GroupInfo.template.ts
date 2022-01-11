module.exports = `
<md-card class="group-info">
  <md-card-header>
    <md-card-header-text>
      <div class="md-title">
        <router-link :to="{'name': 'group-page', params: {groupId: group.staticId}}" style="text-decoration: none;">
          @{{group.name}}
        </router-link>
      </div>
      <div class="md-subhead">
        <pretty-hex :hex="group.staticId"></pretty-hex>
      </div>
      <div class="md-subhead">
        <pretty-hex :hex="dynamicId"></pretty-hex>
      </div>
      <div class="md-subhead">Posts: {{group.postsCount}}</div>
      <div class="md-subhead">Peers: {{peers ? peers.count : '...'}}</div>
    </md-card-header-text>

    <md-card-media>
      <content-manifest-item :manifest="group.avatarImage" :preview-mode="true"></content-manifest-item>
    </md-card-media>
  </md-card-header>

  <md-card-actions>
  	<div v-if="isCanEditGroup">
  	    <md-button :to="{name: 'edit-group', params: {groupId: group.staticId}}">Edit</md-button>
		<md-button :to="{name: 'static-site-manager', params: {type: 'group', id: group.staticId}}">Static site manager</md-button>
	</div>
    <div v-else>
      <md-button class="md-accent" v-if="isJoined" @click="leaveGroup">Unsubscribe</md-button>
      <md-button class="md-primary" v-else @click="joinGroup">Subscribe</md-button>
    </div>
    <!--<md-button>Action</md-button>-->
  </md-card-actions>
</md-card>
`;