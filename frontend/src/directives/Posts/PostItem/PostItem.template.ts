module.exports = `
<md-card class="post-card">
  <md-card-header>
    <div class="md-layout" style="justify-content: space-between;">
      <div class="md-subhead">
        <router-link :to="{name: 'group-page', params: {groupId: value.groupId}}">{{localGroup ? '@' + localGroup.name : '...'}}
        </router-link>
      </div>
      <div>
        <router-link :to="{name: 'group-post-page', params: {postId: value.id, groupId: value.groupId}}">{{date}}
        </router-link>
        <md-button v-if="cybActive" class="md-icon-button" @click="link">
          <md-icon class="fas fa-link"></md-icon>
        </md-button>
      </div>
    </div>
  </md-card-header>

  <md-card-content v-for="content in contentsList">
    <content-manifest-item :manifest="content.storageId" v-if="content.view !== 'link'"></content-manifest-item>
  </md-card-content>

  <!--<md-card-actions>-->
  <!--<md-button>Action</md-button>-->
  <!--<md-button>Action</md-button>-->
  <!--</md-card-actions>-->
</md-card>
`;